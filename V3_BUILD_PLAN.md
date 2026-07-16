# Venderly Swim Club — v3 Build Plan

**Status:** Proposed · **Date:** 2026-07-15
**Reads with:** `V3_PILOT_ARCHITECTURE.md` (decisions/ADRs), `V3_SYSTEM_DESIGN.md` (design)
**Team:** 1 developer (Amar). Estimates are relative effort, not calendar promises.

---

## Guiding principles

1. **Protect Wedgewood at all times.** No phase ships anything that risks the live club. Phase 0 hardens tenancy behind the existing 149 tests before any funnel code exists.
2. **De-risk the hard part first.** The ingestion engine is the highest-uncertainty, most demo-critical piece — prove it headless (test-driven) before building UI on top.
3. **Every phase is independently shippable and has a hard exit criterion.** No phase is "done" until its exit test passes.
4. **Reuse before build.** The demo dashboard is v2 components pointed at the sandbox DB, not a rewrite.

---

## Phase 0 — Tenancy hardening (foundations)

*Goal: make the production DB safely multi-tenant without any user-visible change.*

Deliverables:
- Prisma client extension that sets `SET LOCAL app.current_club_id` per transaction (defense layer 2).
- Request middleware resolving + requiring a `club_id` context (defense layer 1).
- RLS migration: `ENABLE` + **`FORCE`** RLS + `USING`/`WITH CHECK` policies on every tenant table.
- App Runner DB role verified as non-superuser / non-`BYPASSRLS`.
- Composite indexes with `club_id` leading on every tenant table (audit existing; add missing).
- Deliberate admin/cross-club context for funnel reporting + provisioning.
- **CI isolation test:** club A context cannot read club B rows (both directions).

Exit criteria: Wedgewood behaves identically; all existing tests + new isolation test green; a raw query without club context returns zero rows.

Effort: **M.** Risk: medium (touches core data path) — mitigated by existing test suite. Depends on: nothing.

---

## Phase 1 — Ingestion engine, headless (de-risk the core)

*Goal: prove any-format → clean schema mapping from tests, no UI.*

Deliverables:
- Stand up the **sandbox database** + Prisma schema + new sandbox tables (`prospects`, `demo_clubs`, `ingestion_jobs`, `column_mappings`).
- Parser: CSV/XLSX/Numbers → normalized `{headers, rows}`; constant/empty-column detection.
- Fuzzy mapping + synonym dictionary (seed from the sample + memory of GHL fields).
- LLM mapping step (leftovers only) + header-signature cache.
- Transform library: `coerce_phone`, `coerce_int_zeropad`, `split_people` (wide→long), `split_address`, `parse_date_loose`, `drop_column`, `map_tier`.
- Validators reused from v2 webhooks.
- **Fixture suite:** mangle `fake_750_memberships_final.numbers` into ≥4 ugly shapes (one-row-per-person, renamed headers, combined name/age cell, mixed phone formats, extra junk columns).

Exit criteria: fixtures map to the correct schema at an agreed accuracy target (set from Phase 1 runs); `split_people` correctly unnests the 7-member wide format; mixed phone formats normalize.

Effort: **L.** Risk: high (the real unknown) — which is exactly why it's early and test-first. Depends on: Phase 0 (sandbox schema mirrors hardened prod schema).

---

## Phase 2 — Demo experience (make it visible)

*Goal: a prospect can go from landing page to a live, populated demo dashboard in one session.*

Deliverables:
- Landing page (neutral Venderly brand) + "start demo" → `POST /demo/start`.
- Upload flow (`UploadDropzone`) → S3 + `POST /demo/:id/upload` (async job).
- Job polling + **`MappingTable`** with `ConfidenceBadge`, inline transformed preview, per-cell validation, edit → `PUT .../mapping`.
- `ValidationSummary`; `commit` → load into sandbox demo tables.
- Demo dashboard = v2 dashboard components resolved against sandbox DB, scoped to `demoClubId`.
- Design-system components built reusable (per `V3_SYSTEM_DESIGN.md` §11), all five UI states designed.

Exit criteria: take a raw file end-to-end to a working demo dashboard, including the mapping-fix path, in one session without developer intervention.

Effort: **L.** Risk: medium (UI breadth). Depends on: Phase 1.

---

## Phase 3 — One-click provisioning (close the loop)

*Goal: convert a demo into a real, isolated production club.*

Deliverables:
- Provisioning saga (`POST /provision/:demoClubId`): create tenant → re-validate → copy data forward under `club_id` (RLS context) → trigger GHL wiring → mark converted.
- Idempotency + `provisioning_runs` audit; `ProvisioningStepper` UI + `GET /provision/runs/:id`.
- GHL location/webhook automation (parameterized Wedgewood setup); manual credential step surfaced where API can't cover it.

Exit criteria: a demo converts into a production club that behaves like Wedgewood (check-in, webhooks, dashboard) and is RLS-isolated from other clubs; a retried provision never double-creates.

Effort: **M–L.** Risk: medium (GHL automation is the unknown). Depends on: Phase 0 + Phase 2.

---

## Phase 4 — Harden, purge, observe (launch-ready)

*Goal: safe to point real prospects at it.*

Deliverables:
- Sandbox purge cron (retention window) + S3 lifecycle rule.
- Rate limiting + abuse caps on public endpoints; upload safety limits.
- Secrets rotation, CORS tightened, `/webhooks/debug` removed.
- LLM cost caps + per-job spend logging.
- Funnel analytics + ingestion-accuracy sampling + provisioning-success monitoring (reuse logger + digest pattern).
- Admin `FunnelBoard`.

Exit criteria: public-facing security checklist complete; purge verified on a test demo; funnel metrics visible.

Effort: **M.** Risk: low. Depends on: Phases 2–3.

---

## Critical path & sequencing

```
Phase 0 ─┬─► Phase 1 ──► Phase 2 ──► Phase 3 ──► Phase 4
         └─(sandbox schema shares hardened prod schema)
```
Phase 0 → 1 → 2 → 3 → 4 is strictly sequential on the critical path. The **user research** (System Design §12) runs *in parallel* starting now and feeds Phase 1 fixtures + Phase 2 landing copy — it is the one thing that can and should happen alongside Phase 0.

## Parallelizable / anytime
- Research interviews with non-Wedgewood clubs (start immediately; gates nothing but improves Phase 1–2).
- Synonym-dictionary seeding.
- Design-system component design (can precede Phase 2 build).

## What could change the plan
- If research shows prospect data is wildly more varied than the sample, Phase 1 grows (more transforms, wider LLM scope).
- If GHL's API can't automate enough of setup, Phase 3 keeps a larger manual step for the first clubs.
- If demo concurrency ever contends, insert a queue between Phase 2 and its background jobs (status row already models it).

## Suggested first concrete step
Phase 1's fixture generation — mangle the 750-row sample into the ≥4 ugly shapes — because it's self-contained, needs no infra, and immediately makes the hardest phase testable. (Phase 0 can proceed in parallel since it's confined to the existing repo.)
