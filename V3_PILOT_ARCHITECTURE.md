# Venderly Swim Club — v3 "Pilot / Self-Serve Demo" Architecture

**Status:** Proposed
**Date:** 2026-07-15
**Author:** Amar
**Deciders:** Amar, Ryan (Venderly)
**Builds on:** v2 (Express + Prisma + Postgres backend, React/Vite frontend, AWS App Runner, GHL-owned payments)

---

## 1. What v3 is for

v2 proved the product for **one** club (Wedgewood). v3 turns the product into something Venderly can **sell** to *other* swim clubs. The core insight driving the design: the best sales pitch is not a slideshow — it is letting a prospect see **their own club, with their own members, already running inside the product**, and then converting that demo into a real live club with a single click.

So v3 is a **self-serve demo funnel** with five stages:

1. **Landing page** — the front door that gets a prospect to say "show me my club."
2. **Data ingestion (the hard core)** — the prospect uploads whatever data they have, in whatever shape, and the system maps it into our schema automatically, with a human confirm/fix step.
3. **Instant personalized demo** — the cleaned data is loaded into a live swim-club dashboard the prospect can explore as if they had already signed up.
4. **Conversion decision** — the prospect decides whether to proceed.
5. **One-click provisioning** — a single click promotes the demo into a real production club (new tenant) and triggers the GHL/webhook wiring that Wedgewood uses today.

The through-line: **compress "interested prospect" → "live paying club" from weeks of manual setup into one guided session.**

---

## 2. Locked decisions (from planning)

| Area | Decision | Rationale |
|---|---|---|
| **Production tenancy** | Shared DB, row-level by `club_id`, hardened with a mandatory tenant-scope layer + Postgres RLS backstop | Data model already carries `club_id`; solo dev; small number of clubs; demo isolation removes the scary risk (see below). Cheapest safe option. |
| **Demo data isolation** | **Separate sandbox database**, auto-purged on a schedule (e.g. 30 days) | A prospect's messy, unvalidated upload must never share a database with real clubs. Physical separation, not a flag. |
| **Ingestion build** | **Build in-house** (parser + fuzzy match + LLM mapping + confirm UI). Study `tableflowhq/csv-import` and `cryoff/llmTableSchemaMapping` for patterns; do not run their services. | Keeps everything in the existing Node/React stack; no extra Go microservice for a solo dev; full control over the "wow" moment. |
| **Provisioning** | **One click creates a new club tenant** in production and triggers GHL setup | Software-only, fast, matches the Wedgewood setup path already understood. |

These four choices are the spine of everything below. Each is reversible later at a known, bounded cost (noted per-section).

---

## 3. The big architectural picture

v3 introduces a **second application boundary**: a *Pilot/Sandbox* plane that is physically separate from the *Production* plane. They share code (the same dashboard components, the same schema definition) but run as separate deployments against separate databases. Provisioning is the **one-way bridge** from Sandbox → Production.

```
PROSPECT
   │
   ▼
┌──────────────────────────── PILOT / SANDBOX PLANE ────────────────────────────┐
│  Landing page  →  Upload  →  Ingestion pipeline  →  Demo dashboard            │
│                                    │                                           │
│                          (Sandbox Postgres — auto-purged)                      │
└───────────────────────────────────┼───────────────────────────────────────────┘
                                     │  ONE-CLICK PROVISION (validated data only)
                                     ▼
┌──────────────────────────── PRODUCTION PLANE ─────────────────────────────────┐
│  Real club tenant (club_id)  →  GHL webhook wiring  →  live check-in system    │
│                          (Production Postgres — shared, row-level isolated)    │
└───────────────────────────────────────────────────────────────────────────────┘
```

Why two planes instead of one app with an `is_demo` flag: the sandbox holds **arbitrary, untrusted, malformed** data by design. Keeping it in its own database means (a) no filter mistake can ever leak demo rows into a real club's dashboard, (b) you can wipe the entire sandbox on a cron without touching production, and (c) the ingestion service — the most experimental, fastest-changing code — can crash, be redeployed, or be rate-limited independently of the live check-in system that clubs depend on at the poolside.

---

## 4. Architecture Decision Records

### ADR-001: Production multi-tenancy via shared DB + row-level `club_id`

**Context.** v3 must host multiple real clubs. v2's schema already has `club_id` on every table. The team is one developer; expected near-term scale is a handful of clubs, not thousands.

**Decision.** Keep a single production Postgres database. Every row carries `club_id`. Enforce tenant isolation with **two independent layers**:
1. **Application layer** — a Prisma client extension / middleware that requires a `club_id` scope on every query and injects it automatically, so a developer *cannot* forget the filter.
2. **Database layer** — Postgres **Row-Level Security (RLS)** policies keyed on a session variable (`app.current_club_id`) as a backstop, so even a raw query is constrained.

**Options considered.**

| Option | Complexity | Cost | Isolation | Blast radius |
|---|---|---|---|---|
| A. Shared DB + club_id (**chosen**) | Low | 1 instance | Logical, hardened | Whole platform |
| B. Schema-per-club | Medium | 1 instance | Strong | Whole platform |
| C. Database-per-club | High | N instances | Strongest | One club |

**Pros of A:** cheapest; least migration overhead (one `prisma migrate` run); reuses existing schema untouched.
**Cons of A:** a bug that bypasses both guards leaks cross-club data; noisy-neighbor risk on one shared instance.

**Consequences.** Adds a required tenant-context middleware and RLS policies (one-time cost). Every new table must include `club_id` and a matching RLS policy — enforce via a checklist/test. Revisit → migrate a specific club to its own database (Option C) if it ever needs an isolated SLA; because data is already `club_id`-scoped, that extraction is mechanical.

### ADR-002: Demo data in a separate, auto-purged sandbox database

**Context.** Prospects upload unvalidated, arbitrarily-structured files. This data must never risk touching production, and its volume will grow with every demo.

**Decision.** A **physically separate** sandbox Postgres database (or a clearly separate RDS instance) holds all demo/pilot data. A scheduled job purges demo clubs older than a retention window (default 30 days). The sandbox uses the *same* Prisma schema so the dashboard renders identically.

**Consequences.** Two databases to migrate and monitor. Provisioning becomes an explicit **copy-forward** of validated data from sandbox → production (Section 6), which is a feature, not a bug: it's the natural place to run final validation before a club goes live.

### ADR-003: In-house ingestion pipeline (fuzzy + LLM + human confirm)

**Context.** Stage 2 must accept any format (CSV, Excel, Numbers, odd column names, merged cells, one-row-per-family *or* one-row-per-person) and map it into our schema. It is simultaneously the hardest and the most demo-critical stage.

**Decision.** Build the pipeline inside the existing Express app in four steps — **parse → infer mapping → validate → confirm/fix → load**. Use cheap deterministic **fuzzy header matching** for the easy 80% of columns and an **LLM call** only for ambiguous columns and structural transforms (e.g. splitting `"Kids: Kevin (67), Ethan (11)"` into person rows). A React **mapping-confirm screen** shows the AI's proposed mapping with per-column dropdowns the user can override before load.

**Options considered.**
- **A. In-house (chosen).** Full control, no new infra, native stack fit; you write the confirm UI (small) and the mapping logic (the real work).
- **B. Commercial importer (Flatfile/OneSchema).** Fastest UI, recurring cost, less control over the magic moment.
- **C. Hybrid — fork TableFlow + own LLM.** Reuses a mapping UI but adds a **Go** service + its own DB to run and maintain.

**Trade-off.** B and C mostly save the *easy* part (the confirm UI) while B adds cost and C adds a foreign microservice. The hard part (LLM mapping + row reshaping) is yours in all three. In-house keeps the whole thing in Node/React with no extra runtime.

**Consequences.** You own prompt quality and mapping accuracy (mitigate with a fixture suite of deliberately-messy files). LLM calls cost money and add latency → cache mappings per detected header-signature, and only invoke the LLM on the columns fuzzy matching can't resolve.

### ADR-004: One-click provisioning = create tenant + trigger GHL

**Context.** Converting a demo to a real club must feel like one click but must be safe.

**Decision.** "Set up my real site" runs a **provisioning workflow**: (1) create a new `club` row + staff in production, (2) copy the validated demo data forward into production under the new `club_id`, (3) trigger the GHL location/webhook wiring (the Wedgewood setup, parameterized), (4) mark the sandbox demo as `converted`. Wrap steps in a transaction/saga with idempotency so a retry can't double-provision.

**Consequences.** Provisioning is the one place sandbox and production meet — it must re-run validation and enforce the tenant guard from ADR-001. GHL setup may need manual credential steps initially; expose a "provisioning status" view so a half-finished setup is visible and resumable.

---

## 5. Data model additions

Production keeps the existing 6 tables (`clubs`, `memberships`, `persons`, `checkin_events`, `guest_pass_purchases`, `staff`). v3 adds a small set of tables, most living in the **sandbox** DB:

**Sandbox DB (new):**
- `prospects` — who's demoing: club name, contact, email, source, created_at.
- `demo_clubs` — a demo tenant; mirrors `clubs` plus `prospect_id`, `expires_at`, `status` (`active` | `converted` | `expired`).
- `ingestion_jobs` — one per uploaded file: `demo_club_id`, original filename, detected format, row count, status (`uploaded` | `parsing` | `mapping` | `needs_review` | `loaded` | `failed`), error detail.
- `column_mappings` — the AI's proposed and user-confirmed mapping for a job: `source_column`, `target_field`, `confidence`, `method` (`fuzzy` | `llm` | `manual`), `transform` (e.g. split/parse rule).
- Demo copies of `memberships` / `persons` etc. live here too, tagged by `demo_club_id`.

**Production DB (new):**
- `provisioning_runs` — audit + idempotency for each demo→prod conversion: `prospect_id`, `demo_club_id`, new `club_id`, step statuses, timestamps.

Every sandbox table gets swept by the purge job; `provisioning_runs` is retained in production as a permanent record.

---

## 6. The ingestion pipeline in depth (Stage 2)

This is where most of the build effort and demo value concentrate. The flow inside a single `ingestion_job`:

1. **Parse.** Detect format by extension + sniffing. CSV → PapaParse; Excel → SheetJS; `.numbers` → `numbers-parser` (already validated on the sample file). Output a normalized in-memory table: `{ headers[], rows[][] }`.
2. **Infer mapping.**
   - **Fuzzy pass (cheap, deterministic).** Normalize each source header (lowercase, strip punctuation) and score it against a synonym dictionary for each target field (`email` ← "e-mail", "email addr", "contact email"; `phone` ← "phone", "mobile", "cell"; etc.). High-confidence matches are auto-assigned.
   - **LLM pass (only for leftovers).** Send *only* the unresolved headers plus 3–5 sample values per column to the LLM, asking for the best target field and any transform (e.g. "this column contains multiple people → split"). This keeps token cost and latency low and is the part fuzzy matching can't do — semantic + structural reshaping.
   - Cache the resulting mapping keyed by a hash of the header set, so a second file with the same shape skips the LLM entirely.
3. **Validate.** Run the mapped rows through the same validation your webhook handlers already use (email shape, phone normalization, tier/`maxMembers` rules, guest-pass rule). Collect per-row errors.
4. **Confirm / fix (the human-in-the-loop step).** Render the mapping table: each source column, the proposed target field with a confidence badge, a dropdown to override, and a live preview of a few transformed rows + any validation errors. Nothing loads until the user clicks confirm. This is the "automatic, then fixable" pattern you chose — and the same pattern the whole CSV-importer market converged on.
5. **Load.** Write the validated, mapped data into the sandbox demo tables under the `demo_club_id`. The demo dashboard is now populated.

**Key principle:** the LLM is a *scalpel, not a hammer*. Deterministic code does everything it reliably can; the model is invoked only on genuine ambiguity. That controls cost, latency, and — most importantly — the chance of it guessing wrong in front of a prospect.

---

## 7. Security & isolation summary

- **Two databases.** Untrusted demo data is physically separated from production (ADR-002).
- **Two isolation layers in production.** App-level mandatory `club_id` scoping + Postgres RLS backstop (ADR-001).
- **Provisioning is the only bridge**, and it re-validates before writing to production (ADR-004).
- **Secrets.** Carry forward the open v2 item — rotate `JWT_SECRET` / `WEBHOOK_SECRET`, tighten CORS off `*`. v3's public landing page + upload endpoint widens the attack surface, so this graduates from "should" to "must" before launch.
- **Upload safety.** Cap file size, whitelist extensions, scan/parse in a sandboxed worker, never execute file contents, strip formulas.
- **LLM data handling.** Only send column headers + a few sample values to the model — not entire member lists — to limit PII exposure; document this for prospects who ask.

---

## 8. Phased delivery plan

**Phase 0 — Foundations (de-risk the tenancy change).**
Add the tenant-scope middleware + RLS to the existing app behind tests; stand up the separate sandbox database and its Prisma schema; add the new sandbox tables. Ship nothing user-facing yet. *Exit:* Wedgewood still works, all 149 tests green, cross-club leak test passes.

**Phase 1 — Ingestion pipeline, headless.**
Build parse → fuzzy → LLM → validate as a service with a fixture suite of deliberately-messy files (mangled copies of the 750-row sample). No UI yet; prove mapping accuracy from tests. *Exit:* messy fixtures map correctly at target accuracy.

**Phase 2 — Demo experience.**
Landing page → upload → mapping-confirm UI → populated demo dashboard (reuse existing dashboard components against the sandbox DB). *Exit:* you can take a raw file to a live demo dashboard in one session.

**Phase 3 — One-click provisioning.**
The demo→production workflow with idempotency + provisioning-status view + GHL wiring. *Exit:* a demo converts into a real, isolated production club that behaves like Wedgewood.

**Phase 4 — Harden & polish.**
Secrets rotation, CORS, upload limits, purge cron, rate limiting on public endpoints, LLM cost caps, analytics on the funnel. *Exit:* ready to put in front of real prospects.

---

## 9. Design & UX notes (from design:user-research / design:design-system)

**Primary persona — "the swim club board member."** Volunteer or part-time admin, not technical, currently running membership on spreadsheets + a patchwork of tools. Skeptical of "another system." The demo must earn trust in under two minutes by showing *their* data, correctly, with zero setup. Their fear is "this will be a huge migration project" — the one-session demo directly rebuts that fear.

**Secondary persona — "poolside staff."** Already served by the v2 check-in UI; unchanged in v3 except that they're now one of many clubs.

**Research to run before Phase 2:** 3–5 short interviews with clubs *other* than Wedgewood to learn what shapes their membership data actually takes — this directly feeds the ingestion fixture suite and the synonym dictionary. Don't guess the messiness; sample it.

**Design system:** extend the existing Wedgewood tokens into a small multi-tenant theme layer (per-club brand color + logo) so a provisioned club's dashboard can carry its own identity. Keep the landing page and demo flow on a neutral Venderly brand, switching to club branding only after provisioning. Document components (upload dropzone, mapping table, confidence badge, provisioning-status stepper) as reusable pieces from the start.

---

## 10. Open questions to resolve as we build

1. **Mapping accuracy target** — what auto-map hit-rate is "good enough" to demo confidently? (Set from Phase 1 fixtures.)
2. **Retention window** — 30 days for sandbox purge, or shorter?
3. **GHL provisioning** — how much of the location/webhook setup can be fully automated via GHL's API vs. needs a manual credential step for the first clubs?
4. **Guest-pass rule** — still needs Ryan's sign-off (carried from v2) and must be encoded in the ingestion validator.
5. **Pricing/gate** — is the demo fully open, or gated behind a contact form? Affects landing-page design and abuse controls.

---

## Appendix A — Shared-DB multi-tenancy implementation rules (RLS hardening)

These are the concrete rules for implementing ADR-001 safely and efficiently, synthesized from current PostgreSQL RLS + Prisma best practice (AWS Prescriptive Guidance, Crunchy Data, the Prisma client-extensions RLS example). Treat this as the checklist for Phase 0.

**Isolation correctness (prevents cross-club data leaks):**

1. **Every tenant-scoped table carries a non-null `club_id`** with a foreign key to `clubs`. No exceptions — a table without `club_id` cannot be protected.
2. **Enable AND force RLS on every tenant table:** `ALTER TABLE x ENABLE ROW LEVEL SECURITY;` **and** `ALTER TABLE x FORCE ROW LEVEL SECURITY;`. `FORCE` is essential — without it the table owner (and any superuser) silently bypasses all policies.
3. **The App Runner database role is a normal role** — no `SUPERUSER`, no `BYPASSRLS`. Any bypass attribute silently disables isolation.
4. **Set tenant context with `SET LOCAL` inside a transaction**, e.g. `SET LOCAL app.current_club_id = '<uuid>'`. Use `LOCAL` always: because App Runner reuses pooled connections, a plain `SET` leaks one request's context onto the connection for the next request. `SET LOCAL` is scoped to the transaction and cannot bleed.
5. **RLS policy shape:** `USING (club_id = current_setting('app.current_club_id')::uuid)` for reads, with a matching `WITH CHECK` clause so inserts/updates can't write another club's rows.
6. **Two application layers of defense:** (a) request middleware guarantees every request has a valid resolved `club_id`; (b) a Prisma Client extension sets the session variable before every operation, so a developer cannot forget to scope a query. RLS in the database is the backstop beneath both.

**Performance (prevents slow queries under RLS):**

7. **`club_id` must be the leading column** of the primary access index on every RLS table (e.g. `(club_id, is_active)`, `(club_id, created_at)`). Without it, RLS filtering can be ~100× slower. v2's existing sparse `(club_id, is_active)` check-in index already follows this — replicate the pattern for every new table.
8. **Keep the shared connection pool.** The session-variable approach (vs. per-tenant DB users) is precisely what lets one pool serve all clubs — that's the efficiency win.

**Operational correctness:**

9. **CI isolation test (mandatory):** set club A's context, assert a query returns zero of club B's rows; set club B, assert the inverse. This is the permanent regression guard against leaks.
10. **Deliberate cross-club/admin path.** Venderly's own multi-club reporting and the demo→production provisioning workflow need a *controlled* elevated context (a dedicated admin role or explicit policy), not superuser everywhere — otherwise steps 2–6 are quietly defeated.
11. **Test views and functions.** RLS interacts with `SECURITY DEFINER` / invoker rights in stored functions and views in non-obvious ways; verify nested queries and any reporting views explicitly.
12. **New-table checklist:** `club_id` FK + not-null → `ENABLE` + `FORCE` RLS → `USING`/`WITH CHECK` policy → `(club_id, …)` leading index → add to the CI isolation test. No tenant table merges without all five.

**References:** AWS Prescriptive Guidance — RLS recommendations; Crunchy Data — RLS for tenants in Postgres; Prisma `prisma-client-extensions/row-level-security`; The Nile — shipping multi-tenant SaaS with RLS.
