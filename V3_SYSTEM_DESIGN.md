# Venderly Swim Club — v3 Complete System Design

**Status:** Proposed · **Date:** 2026-07-15 · **Author:** Amar
**Companion docs:** `V3_PILOT_ARCHITECTURE.md` (decisions + ADRs), `V3_BUILD_PLAN.md` (execution)
**Scope:** the self-serve demo funnel that converts a prospect swim club into a live production tenant.

---

## 1. Requirements

### 1.1 Functional
- **F1.** A prospect can visit a public landing page and start a demo with no account.
- **F2.** A prospect can upload member data in arbitrary formats (CSV, XLSX, Numbers) and structures (wide/long, odd headers, combined fields).
- **F3.** The system auto-maps the uploaded columns to the swim-club schema, invoking an LLM only where deterministic matching is ambiguous.
- **F4.** The prospect reviews and corrects the proposed mapping before anything is loaded (human-in-the-loop).
- **F5.** After load, the prospect explores a fully-populated demo dashboard using their own data.
- **F6.** With one click, a demo converts into a real production club (new tenant) with GHL wiring triggered.
- **F7.** Demo data is isolated in a sandbox database and auto-purged after a retention window.
- **F8.** Venderly staff can see funnel state (prospects, demos, conversions) and provisioning status.

### 1.2 Non-functional
- **N1. Isolation:** untrusted demo data must be physically separated from production; production clubs must be logically isolated from each other (RLS).
- **N2. Latency:** landing→first mapping preview in the tens of seconds, not minutes; dashboard reads sub-second (reuse v2 hot-path indexes).
- **N3. Cost:** near-zero marginal infra cost per demo and per production club (see ADR-001 cost analysis). LLM spend bounded per upload.
- **N4. Reliability:** the ingestion service can fail/redeploy without affecting the live poolside check-in system for existing clubs.
- **N5. Security:** public upload endpoint hardened (size caps, type allow-list, sandboxed parsing, PII-minimized LLM calls, secrets rotated, CORS tightened).
- **N6. Maintainability:** solo developer; keep moving parts minimal; everything in the existing Node/React stack.

### 1.3 Constraints (inherited)
- Stack: Express + Prisma + PostgreSQL, React/Vite frontend, AWS App Runner, RDS Postgres (port 5433 for local dev).
- GHL owns payments/Stripe; v2 stores payment JSON + IDs only.
- One developer; `dev`→`main` deploy flow; 149 existing tests must stay green.

---

## 2. Load estimation (sanity check, not a scaling problem)

This is a low-volume, high-value system — sizing matters only to prove it's cheap.

- Demos: order of 1–20/day at peak of a sales push. Each = 1 file (hundreds–few thousand rows, e.g. the 750-row/41-col sample).
- Production clubs: 1 → tens over the first year.
- Check-in read traffic (existing): the hottest query, every ~3s per open dashboard — already handled by the `(club_id, is_active)` sparse index.
- Ingestion is **bursty and asynchronous**, not sustained. A demo upload triggers a short-lived job; nothing runs between demos.

Implication: no horizontal scaling, no queue cluster, no sharding. A single App Runner service + one background worker path is sufficient. The design optimizes for **isolation and maintainability**, not throughput.

---

## 3. High-level design

### 3.1 Two planes, one bridge
The system is split into a **Sandbox plane** (untrusted demo data, fast-changing ingestion code) and a **Production plane** (real clubs, stable check-in system), joined only by the **provisioning bridge**. See `V3_PILOT_ARCHITECTURE.md` §3 for the plane diagram and rationale.

### 3.2 Components

| Component | Plane | Responsibility |
|---|---|---|
| **Landing web** | Sandbox | Public marketing page + "start demo" entry; neutral Venderly brand. |
| **Demo API** | Sandbox | Prospect/demo lifecycle, upload intake, orchestrates ingestion, serves demo dashboard reads. |
| **Ingestion service** | Sandbox | The parse→map→validate→load pipeline. In-process module of Demo API, run on a background task so uploads don't block the request. |
| **Mapping store** | Sandbox | `ingestion_jobs` + `column_mappings`; caches mappings by header-signature. |
| **Sandbox DB** | Sandbox | Separate Postgres; holds `prospects`, `demo_clubs`, demo `memberships`/`persons`/etc. Auto-purged. |
| **Demo dashboard UI** | Sandbox | Reuses v2 dashboard components, pointed at Sandbox DB. |
| **Provisioning service** | Bridge | Idempotent saga: create tenant → copy validated data → trigger GHL → mark converted. |
| **Production API + DB** | Production | Existing v2 system, now multi-tenant via RLS. |
| **Admin/funnel view** | Production | Venderly-internal: prospects, demos, conversions, provisioning status. |

### 3.3 Storage choices
- **Two Postgres databases** (sandbox, production) — same Prisma schema, different connection URLs. Rationale in ADR-002.
- **Object storage (S3)** for the raw uploaded file (short-lived), so the parser reads from S3 not from request memory, and we retain the original for debugging a bad mapping. Lifecycle rule purges with the demo.
- **No Redis/queue** initially — background jobs run in-process with a DB-backed status row (`ingestion_jobs.status`) as the source of truth. Revisit if concurrency grows.

---

## 4. API contracts

All demo/sandbox routes under `/api/v1/demo`; provisioning under `/api/v1/provision`; existing club routes unchanged. Secrets/headers follow v2 conventions.

### 4.1 Demo lifecycle
```
POST /api/v1/demo/start
  body: { clubName, contactName, email, source? }
  → 201 { demoClubId, expiresAt }

POST /api/v1/demo/:demoClubId/upload           (multipart)
  file: the raw membership export
  → 202 { jobId, status: "parsing" }            # async; poll job

GET  /api/v1/demo/jobs/:jobId
  → 200 { status, rowCount, detectedFormat,
          mapping: [ { sourceColumn, targetField, confidence, method, transform } ],
          validation: { okRows, errorRows, samples[] },
          error? }
```

### 4.2 Mapping confirm/fix
```
PUT  /api/v1/demo/jobs/:jobId/mapping
  body: { mapping: [ { sourceColumn, targetField|null, transform? } ] }
  → 200 { status: "needs_review", revalidated: {...} }   # re-runs validation preview

POST /api/v1/demo/jobs/:jobId/commit
  → 202 { status: "loading" }                            # writes into sandbox demo tables
  → (poll) status: "loaded"
```

### 4.3 Demo dashboard reads
Reuse existing dashboard endpoints, but resolved against the Sandbox DB and scoped to `demoClubId`. No new contracts beyond a demo-context resolver.

### 4.4 Provisioning
```
POST /api/v1/provision/:demoClubId
  body: { confirm: true }
  → 202 { provisioningRunId, steps: [...] }     # idempotent; safe to retry

GET  /api/v1/provision/runs/:id
  → 200 { status, steps: [ { name, status, detail } ], clubId? }
```

### 4.5 Admin/funnel (Venderly-internal, production, admin context)
```
GET /api/v1/admin/funnel        → prospects, demos, conversions, drop-off
GET /api/v1/admin/provision     → in-flight and failed provisioning runs
```

---

## 5. Key sequence flows

### 5.1 Upload → live demo
```
Prospect → Demo API:  POST /demo/:id/upload (file)
Demo API → S3:        store raw file
Demo API:             create ingestion_job (status=parsing), return 202 jobId
[background]
  Ingestion: parse (format sniff) → normalized table {headers, rows}
  Ingestion: fuzzy map headers → synonym dict (auto-assign high confidence)
  Ingestion: LLM map ONLY unresolved headers (+ 3–5 sample values) → target + transform
  Ingestion: cache mapping by header-signature hash
  Ingestion: validate rows via shared v2 validators → job.status=needs_review
Prospect polls GET /demo/jobs/:id → sees proposed mapping + validation preview
Prospect edits mapping → PUT .../mapping → revalidate preview
Prospect → POST .../commit
  Ingestion: apply transforms (incl. wide→long unnest) → write demo memberships/persons → status=loaded
Prospect → demo dashboard (reads Sandbox DB, scoped to demoClubId)
```

### 5.2 One-click provision (saga, idempotent)
```
Prospect → POST /provision/:demoClubId { confirm:true }
Provisioning run (each step idempotent, recorded in provisioning_runs):
  1. create club + staff in Production (new club_id)          [skip if exists]
  2. re-validate demo data against production rules
  3. copy memberships/persons/guest_passes forward under club_id (RLS context set)
  4. trigger GHL location/webhook wiring (parameterized Wedgewood setup)
  5. mark demo_club status=converted
On failure at step N: run stays resumable; GET /provision/runs/:id shows which step.
```

---

## 6. Data model (new tables)

DDL sketch (Prisma-equivalent). Sandbox tables live in the sandbox DB; `provisioning_runs` in production.

```sql
-- SANDBOX DB
prospects        (id uuid pk, club_name, contact_name, email, source, created_at)
demo_clubs       (id uuid pk, prospect_id fk, name, status enum[active,converted,expired],
                  expires_at, created_at)               -- mirrors clubs shape for dashboard reuse
ingestion_jobs   (id uuid pk, demo_club_id fk, raw_file_key, detected_format,
                  row_count, header_signature,
                  status enum[uploaded,parsing,mapping,needs_review,loading,loaded,failed],
                  error jsonb, created_at, updated_at)
column_mappings  (id uuid pk, job_id fk, source_column, target_field,
                  confidence numeric, method enum[fuzzy,llm,manual],
                  transform jsonb)                       -- e.g. {"op":"split_people"} / {"op":"coerce_phone"}
-- demo copies of memberships/persons/guest_pass_purchases tagged by demo_club_id

-- PRODUCTION DB
provisioning_runs(id uuid pk, prospect_id, demo_club_id, club_id nullable,
                  steps jsonb, status enum[running,succeeded,failed],
                  created_at, updated_at)               -- audit + idempotency
```
Every sandbox table is swept by the purge job; `provisioning_runs` is retained permanently.

---

## 7. Ingestion service internals (designed against the real sample)

The pipeline is five stages. The transforms below are derived directly from the data profile of `fake_750_memberships_final.numbers`.

**Stage 1 — Parse.** Format sniff → CSV (PapaParse) / XLSX (SheetJS) / Numbers (numbers-parser). Emit `{ headers[], rows[][] }`. Detect and flag: constant columns (cardinality 1, e.g. State/Country), fully-empty columns (100% null, e.g. Email/Phone Verified) → propose "ignore".

**Stage 2 — Infer mapping.**
- *Fuzzy pass:* normalize headers, score against a synonym dictionary per target field (`email`←"e-mail/email addr/your email"; `phone`←"phone/mobile/cell"; `full_name`←"name/your full name/member name"). Auto-assign ≥ threshold.
- *LLM pass (leftovers only):* send unresolved headers + 3–5 sample values, ask for `{target_field, transform}`. This is where structural intelligence lives — recognizing that `1st…7th Member *` is a **repeating group** to unnest, or that `Address` is a **combined field** to split.
- Cache by `header_signature` (hash of sorted headers) → identical future files skip the LLM.

**Stage 3 — Transforms (the "any structure" muscle).** A small transform library keyed off `column_mappings.transform`:
- `coerce_phone` — unify `+13025911540` (str) and `3025911540.0` (float) → E.164.
- `coerce_int_zeropad` — Postal Code `19929.0` → `"19929"` (preserve leading zeros for non-DE states).
- `split_people` — pivot `1st…7th Member Name/Phone/Age` wide → one `person` row each, dropping nulls.
- `split_address` — parse combined `Address`, strip Google Place-ID tail.
- `parse_date_loose` — `"Jul 6th 2026, 11:52 pm"` → ISO timestamp.
- `drop_column` — constant/empty columns.
- `map_tier` — Payment Amount → membership tier + maxMembers (reuse v2 mapping).

**Stage 4 — Validate.** Run mapped rows through the **same validators the v2 webhooks use** (email shape incl. the emergency-email tolerance fix, phone normalization, tier/maxMembers, guest-pass rule). Produce `{okRows, errorRows, samples}` for the confirm UI.

**Stage 5 — Load.** On commit, write validated rows into sandbox demo tables under `demo_club_id`. Dashboard now populated.

**Principle:** deterministic code does everything it can; the LLM is a scalpel for ambiguity and structure only — bounding cost, latency, and the risk of a wrong guess in front of a prospect.

---

## 8. Error handling & reliability

- **Ingestion failures** are captured in `ingestion_jobs.status=failed` + `error` jsonb; the raw file is retained in S3 for replay. The prospect sees a friendly "we need a hand with this file" state; Venderly can inspect.
- **Provisioning** is an idempotent saga (§5.2) — any step is safe to retry; a half-run is visible and resumable, never double-provisions (guard on existing `club_id`).
- **Blast-radius isolation (N4):** ingestion and demo traffic run in the Sandbox plane; a crash or bad deploy there cannot affect existing clubs' poolside check-in in Production.
- **LLM guardrails:** timeouts + fallback to "all columns need manual mapping" (degrade to pure human-in-the-loop) rather than failing the demo.

---

## 9. Scale & reliability posture

- **Scaling:** vertical only, and not soon. One App Runner service; ingestion in-process on background tasks. Add a real queue (SQS) only if concurrent demos ever contend — the `ingestion_jobs` status row already models the work, so the migration is mechanical.
- **Availability:** Production plane availability is unchanged from v2 and independent of Sandbox. Sandbox downtime affects only new demos, not customers.
- **Monitoring:** funnel metrics (start→upload→commit→convert drop-off), ingestion success rate + mapping-accuracy sampling, LLM cost/latency per job, provisioning success. Reuse existing logger + the Monday digest pattern.

---

## 10. Security (N5) — additions beyond v2

- Public endpoints (`/demo/start`, `/upload`) get **rate limiting** (extend v2's login limiter) + basic abuse controls (per-IP demo cap).
- **Upload safety:** size cap, extension allow-list, parse in a sandboxed worker, never evaluate formulas, retain raw file server-side only.
- **PII minimization for LLM:** send headers + a few sample values, never full member lists; document for privacy-conscious prospects.
- **Graduate the v2 "should"s to "must"s** before public launch: rotate `JWT_SECRET`/`WEBHOOK_SECRET`, tighten CORS off `*`, remove the temporary `/webhooks/debug` route.

---

## 11. Design system (design:design-system)

Extend the existing Wedgewood tokens into a small multi-tenant theme layer.

**Tokens.** Keep v2's brand palette as the *club* theme slot (`--club-primary`, `--club-logo`); add a neutral *Venderly* brand for landing + demo chrome. A provisioned club's dashboard binds its own `--club-primary`/logo; the demo funnel stays Venderly-neutral until conversion.

**New components (build as reusable from day one):**
- `UploadDropzone` — drag/drop, format hint, size/progress, error states.
- `MappingTable` — rows of `sourceColumn → [targetField dropdown]` with a **ConfidenceBadge** (green auto / amber LLM / grey manual), inline transformed-value preview, and per-cell validation error.
- `ValidationSummary` — okRows/errorRows with expandable sample failures.
- `ProvisioningStepper` — the saga's steps with live status.
- `FunnelBoard` (admin) — prospects/demos/conversions columns.

**States that must be designed, not improvised:** empty (no file yet), parsing (spinner + row count), needs-review (the mapping table), error (friendly recovery), loaded (CTA into dashboard). Empty/error states are where trust is won or lost — see personas.

---

## 12. Personas & research plan (design:research-synthesis)

*Pre-research: these are hypotheses to validate, not findings — we have no interviews yet.*

**P1 — "The board member" (primary, the buyer).** Volunteer/part-time club admin, non-technical, runs membership on spreadsheets. Core fear: *"switching systems will be a huge migration project."* The one-session demo exists to kill that fear by showing their own data live in minutes. Success = trust earned in < 2 minutes.

**P2 — "Poolside staff" (existing, unchanged).** Served by the v2 check-in UI; in v3 they're one club among many. No new needs beyond correct tenant scoping.

**P3 — "Venderly (you/Ryan)" (operator).** Needs funnel visibility and safe, resumable provisioning.

**Research to run before Phase 2 (feeds the ingestion fixtures + synonym dict):**
- 3–5 short interviews with clubs *other than Wedgewood*; ask for a **real (anonymizable) export** of their member data.
- Synthesize into: (a) the actual shapes member data takes in the wild → ingestion fixtures; (b) the vocabulary clubs use for the same fields → synonym dictionary; (c) the words they use for their fear → landing-page copy.
- Method: 20-min calls, "show me how you track members today," collect one file each. Synthesize with affinity mapping into shapes / vocabulary / objections.

---

## 13. Trade-offs & what we'll revisit

| Decision | Trade-off accepted | Revisit when |
|---|---|---|
| In-process ingestion (no queue) | Simplicity now vs. concurrency ceiling | Concurrent demos contend → add SQS (status row already models it) |
| Shared prod DB + RLS | Policy-based isolation vs. physical | A single club needs its own SLA → lift that club to its own DB |
| LLM only on ambiguous columns | Small accuracy risk vs. big cost/latency saving | Mapping accuracy below target on fixtures → widen LLM scope |
| Two DBs (sandbox/prod) | Two things to migrate vs. hard isolation | Never for isolation; maybe unify tooling via shared migration scripts |
| Reuse v2 dashboard for demo | Fast vs. demo-specific polish | Demo needs bespoke storytelling beyond the real dashboard |

---

## 14. Assumptions
- Prospect member data is exportable to a file (CSV/XLSX/Numbers) — no live API integration needed for the demo.
- GHL exposes enough API surface to automate most location/webhook setup; first few clubs may need a manual credential step (tracked in the provisioning stepper).
- Demo volume stays low enough that in-process background jobs suffice through the first year.
- The guest-pass rule and tier mapping from v2 are correct inputs to the ingestion validator (guest-pass rule still pending Ryan's sign-off).
