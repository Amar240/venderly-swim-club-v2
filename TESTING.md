# Testing Strategy — Venderly Swim Club v2

## 1. Current state

- ~6,500 LOC backend (Express + Prisma + TypeScript)
- ~4,500 LOC frontend (React + Vite + TypeScript)
- **Test coverage: 0%** (no tests in the repo today)
- Production verification has been: curl smoke tests + manual UI clicks + real user feedback (Ryan)
- System is live with 118 households, GHL webhooks firing, Stripe test-mode purchases working

The system shipped fast and works, but every change today has been a coin flip on regression. We need tests before the next feature wave (staff edit, capacity scheduling, second tenant).

## 2. Real bugs we hit (justification for the plan below)

Every one of these would have been caught by tests we propose. They're real, not hypothetical.

| Bug | Where | What test would have caught it |
|---|---|---|
| `Elena M. Gouge` vs `Elena M Gouge` not deduped at signup | `signup.ts → normalizeName` | Unit test: `normalizeName('Elena M. Gouge') === normalizeName('Elena M Gouge')` |
| Allergies copied to every family member, rendered 4× | Backend stores per-person; frontend doesn't group | Component test on allergy block — same input on N members should render once |
| `M'hamed` rendered as `M�hamed` | CSV encoding mismatch in importer | Importer test: feed UTF-8 row with curly apostrophe, assert clean output |
| Family member last_name empty (Jared Alexander etc.) | Importer doesn't inherit primary's last_name | Importer test: family member without last_name inherits from primary |
| `getDashboardSummary` counted only events, not guests, in `currentlyInPool` | Aggregation logic | Unit test on summary calculation with mixed events + guest counts |
| Guest pass `order_id` empty → `QUANTITY_REQUIRED` | Webhook payload missing fields | Handler test: missing order_id falls back gracefully |
| Sheet primitive's built-in close stacked behind custom X | Frontend Sheet wrapper | Visual/component test that exactly one close button is rendered |
| Capacity bar showed 0% when current=0 but `currentlyInPool` calculation broke at capacity 0 division | `dashboard.ts` | Unit test: `capacityPercent` when `poolCapacity === 0` → `0`, not NaN |
| Webhook contact_id misread as `l` vs `I` (visual confusion) | Manual data entry | Contract test against captured GHL payload |
| Pending payments getting imported as members | importer | Importer test: row with `Payment Status: Pending` and `--skip-pending` → skipped |

Five hours of debugging → ten unit tests.

## 3. Testing pyramid (target shape)

```
              /───── E2E ─────\           ~5 tests — full GHL→DB→UI cycles
             /  Integration   \           ~30 tests — webhook + API end-to-end (real DB, in-memory or test container)
            /   Component      \          ~25 tests — React component interaction tests
           /    Unit Tests       \        ~80 tests — pure functions, business logic, helpers
```

Approximate count: ~140 tests for v1 coverage. Run time target: <30 seconds for unit+component, <2 minutes for full suite incl. integration.

## 4. Tooling recommendations

| Layer | Recommended | Why |
|---|---|---|
| Backend unit + integration | **Vitest** | Same TS config as the app, faster than Jest, ESM-native |
| Backend DB layer | **Testcontainers** (real Postgres in Docker) for integration; **pg-mem** for fast unit | Real Postgres for Prisma queries; pg-mem when test count grows |
| Backend HTTP layer | **supertest** | Express app testing, no port binding |
| Frontend | **Vitest + React Testing Library** | Vite-native, same config |
| Frontend a11y | **vitest-axe** | One-line a11y assertion in component tests |
| E2E | **Playwright** | Best DX, parallel, headless-first |
| Mocks | **MSW** (Mock Service Worker) | Intercept network in component tests |
| Coverage | **Vitest built-in** (`--coverage` via c8) | Zero-config |

All TypeScript. Single `vitest.config.ts` at root + one per workspace.

## 5. By component — what to test and how

### 5.1 `src/handlers/signup.ts`

**Unit tests** (no DB):
- `normalizeName('Elena M. Gouge') === normalizeName('Elena M Gouge')` ✓
- `normalizeName('Anthony J. Cavaciuti') === normalizeName('Anthony J Cavaciuti')`
- `normalizeName(' Lisa  TURNER ') === normalizeName('lisa turner')`
- `parseMembershipTier` for each `1, 2, 3, 4, 5+` and edge cases (null, "")
- `parseFamilyMembers` correctly filters account holder duplicate (with and without punctuation)
- `parseFamilyMembers` returns max 9 members
- `parseFamilyMembers` ignores empty member slots
- `cleanPhoneNumber('+1 (302) 555-1234')` → `'3025551234'`
- `cleanPhoneNumber('abc')` → `undefined`
- `parseAge('8 years old')` → `8`
- `splitFullName('Mary Jane Watson')` → `{firstName: 'Mary', lastName: 'Jane Watson'}`
- `getPaymentStatus({payment_status: 'paid'})` → `'paid'`

**Integration tests** (real DB, transactional):
- Full webhook payload → creates 1 membership + N persons in correct rows
- Webhook with `submittedAt` before 2026-05-01 → guest_passes_total = 5
- Webhook with `submittedAt` after 2026-05-01 → guest_passes_total = 0
- Re-firing same `contact_id` → updates membership instead of duplicating
- Family member with same name as account holder (with punctuation differences) → not duplicated
- Address fields persisted on membership row, not on persons
- Emergency contact email persisted on all family rows
- Invalid `WEBHOOK_SECRET` → 401, no DB writes
- Missing `location.id` → 422, no DB writes
- Invalid email → 400 VALIDATION_ERROR

Coverage target: **85%**.

### 5.2 `src/handlers/checkin.ts`

**Unit tests**:
- `collectNamedMembers` returns trimmed, non-empty names from the 8 ordinal fields
- `collectNamedMembers` returns empty array → forces legacy path
- `parseGuestCount('2')` → 2; `parseGuestCount('')` → 0; `parseGuestCount('Yes')` and `"Any guests?"=Yes` cooperation

**Integration tests** (real DB):

Legacy single-person path:
- Old payload with `first_name`/`last_name`/`email` → resolves person → creates one checkin_event
- Email matches multiple → disambiguates by first_name
- Phone fallback when email doesn't match
- "Membership Name" fallback when email + phone both miss
- Member not found → 404
- Already checked in → 409
- Capacity exceeded → 403
- Membership not ACTIVE → 422
- Sign-out path flips `is_active` on the active event

New batch path:
- 3 named members + 2 guests → creates 3 checkin_events + decrements `guest_passes_used` by 2 + first event has `numGuests=2`
- Any unmatched name → 422, batch rejected, no DB writes (verify rollback)
- One named member already checked in → 409, batch rejected
- Combined family + active count > maxMembers → 403, batch rejected
- numGuests > remaining guest passes → 403, batch rejected
- All success path → response includes `checkedIn` array, `guestPassesRemaining`

Race condition (concurrency test):
- 2 parallel check-ins for same person → exactly one succeeds, one returns 409 (catches the race I flagged earlier)

Coverage target: **90%** (this is the highest-stakes handler).

### 5.3 `src/handlers/signout.ts`

**Integration tests**:
- Single sign-out happy path
- Single sign-out when no active checkin → 404
- "Sign out all" flips every active event for the membership
- "Sign out all" when nobody is checked in → 200 with empty signedOut[]
- "Sign out all" doesn't touch other memberships

Coverage target: **80%**.

### 5.4 `src/handlers/dashboard.ts`

**Unit tests** (timezone helper logic, summary aggregations):
- `getNewYorkTodayBounds()` returns `start <= now < end` and exactly 24h span (DST-resistant)
- Summary with no check-ins → all zeros
- Summary with 3 active checkins + 2 guests → `currentlyInPool = 5`
- Summary `capacityPercent` when `poolCapacity === 0` → 0, not NaN/Infinity
- `submittedAt` filter (not `createdAt`) for `newMembersToday`

**Integration tests**:
- `manualCheckin` happy path + decrement guests
- `manualCheckin` insufficient guest passes → 403, no DB write
- `manualCheckin` already checked in → 409
- `manualSignout` person scope (existing)
- `manualSignout` membership scope flips all active for membership
- `updateClubCapacity` valid → 200 + persisted
- `updateClubCapacity` 0 or 5000 → 400 (out of range)
- Search returns persons (legacy) — assert duplicate household persons appear separately
- Member detail returns full nested family + history

Coverage target: **80%**.

### 5.5 `src/handlers/guestPassPurchase.ts`

**Integration tests**:
- Happy path with explicit `quantity` and `order_id` → +N passes
- Missing `quantity` → derive from `amount / pack_price` → correct passes
- Missing both → 422 QUANTITY_REQUIRED, no DB write
- Missing `order_id` → fallback composite key created
- Repeat call with same `order_id` → 200 with `duplicate: true`, no double-credit
- Unknown contact → 422 MEMBERSHIP_NOT_FOUND
- Quantity > 50 cap → still creates with cappedQuantity=50

Coverage target: **90%**.

### 5.6 `src/lib/guestPasses.ts`

**Unit tests** (pure function — 100% coverage easy):
- `calculateInitialGuestPasses(null)` → 0
- `calculateInitialGuestPasses(2026-04-30)` → 5
- `calculateInitialGuestPasses(2026-05-01T12:00:00Z)` → 5 (inclusive of May 1)
- `calculateInitialGuestPasses(2026-05-02T00:00:01Z)` → 0
- `PASSES_PER_PACK === 10`

Coverage target: **100%**.

### 5.7 `src/lib/timezone.ts`

**Unit tests**:
- `getNewYorkTodayBounds()` at noon EDT → start is today 4:00 UTC, end is tomorrow 4:00 UTC
- `getNewYorkTodayBounds()` at noon EST → start is today 5:00 UTC, end is tomorrow 5:00 UTC
- Run at midnight NY-time → still produces correct bounds (no off-by-one)
- Mock `Date.now()` for determinism

Coverage target: **100%**.

### 5.8 Middleware

**Unit tests** for `jwtAuth.ts`:
- Valid token → `res.locals.staff` populated
- Missing Authorization header → 401 MISSING_AUTH_TOKEN
- Malformed token → 401
- Expired token → 401
- Token signed with wrong secret → 401

**Unit tests** for `webhookAuth.ts`:
- Valid `X-Webhook-Secret` → next()
- Missing header → 401
- Wrong secret → 401
- Missing `WEBHOOK_SECRET` env → 500

Coverage target: **100%** (security boundary).

### 5.9 `src/routes/apiV1.ts`

**Integration tests** for `/api/v1/members`:
- Returns one row per person (not per household — by design for dashboard search)
- Filter by `?tier=Family` → only Family-tier persons
- Limit honored, capped at 100
- `q` parameter searches first_name, last_name, email case-insensitively
- `/api/v1/members/:id` returns full nested household with family array
- `/api/v1/memberships` returns one row per household, `accountHolderName` from primary
- Unauthorized → 401

### 5.10 `scripts/importMembers.ts`

This is critical and complex. It earned its own section.

**Unit tests** (helpers, pure):
- `parseGhlDate('Apr 30th 2026, 11:36 pm')` → valid Date
- `parseGhlDate('May 1st 2026, 12:00 am')` → valid Date matching cutoff
- `parseGhlDate('')` → null
- `parseBool('true')` / `'yes'` / `'1'` → true
- `parseBool('false')` / `'no'` / `''` → false
- `parsePaymentAmountCents('$340 ')` → 34000
- `parsePaymentAmountCents('$0')` → 0
- `resolveTier(290, 2)` → `{ tier: 'AdultPlusChild', maxMembers: 2 }`
- `resolveTier(200, 5)` → `{ tier: 'Family5', maxMembers: 5 }` (unknown amount, fallback to count)
- `resolveTier(0, 1)` → `{ tier: 'Adult', maxMembers: 1 }`
- `resolveTier(530, 9)` → `{ tier: 'Family5', maxMembers: 9 }` (known tier, maxMembers bumped)
- `parseChildrenAges('Yelena (12), Ethan (9)')` → `Map { Yelena → 12, Ethan → 9 }`
- `parseRelationships('Son: Tyler, Daughter: Emily')` → `Map { Tyler → 'son', Emily → 'daughter' }`
- `splitMultivalue('a@b.com, c@d.com\ne@f.com')` → 3 entries
- Family member with empty last_name → inherits primary's last_name
- UTF-8 row with curly apostrophe (`M'hamed`) survives parsing unchanged
- Row with `Payment Status: Pending` + `skipPending=true` → counted as skipped
- Row with `Payment Status: Pending` + `skipPending=false` → counted as imported

**Integration tests** (real DB):
- Full 127-row CSV → 118 memberships, 337 persons, 6 pending skipped, 3 duplicate ghl_contact_id skipped
- `--dry-run` flag → no rows written (assert COUNT before/after unchanged)
- 9-member household → all 9 family persons created
- Re-running importer (idempotent) → same final state, no duplicates

Coverage target: **85%**.

### 5.11 Frontend components — what to test

Focus on components with real behavior, skip pure presentational ones.

| Component | Test type | Key assertions |
|---|---|---|
| `MemberDetailSheet` | Component | Renders family list, household-level allergies grouped when same, X button calls `onOpenChange(false)`, guest stepper caps at remaining passes, CHECK IN fires mutation with current count |
| `GuestPassBar` | Component | Color zones (green/yellow/red), shows "0 used today" only when > 0, "No guest passes purchased" when total=0 |
| `CapacityBanner` | Component | Hidden when percent < 100, shown at ≥100, dismissable, dismissal persists in sessionStorage |
| `Dashboard` | Component | Stat cards show correct numbers from query, polling restarts after invalidation, search bar debounces correctly |
| `Members` page | Component | Card grid renders one card per household, search filter, tier chip filter |
| `SettingsMenu` | Component | Sound toggle persists, Pool capacity dialog updates and reflects, Sign out works |
| `ActiveMemberRow` | Component | Sign Out button stops propagation (doesn't open sheet), clicking row opens sheet |
| `ActivityFeedItem` | Component | Click row opens sheet with correct personId |
| `useManualCheckin` hook | Hook test | Optimistic update applied, reverts on error, invalidates correct queries on settle |
| `useUiPrefs` hook | Hook test | Sound preference persists across reloads (via localStorage mock) |

Coverage target: **50%** lines, **80%** for interaction logic.

### 5.12 Accessibility tests

Quick wins via `vitest-axe`:
- MemberDetailSheet — no a11y violations
- Dashboard — no a11y violations
- Settings dialog — focus trapped, ESC closes
- All buttons have aria-labels
- Color contrast checks on tier badges and status dots

### 5.13 E2E tests (Playwright)

5 critical journeys, each <30 seconds:

1. **Lifeguard manual check-in**: Login → search "Oldis" → click → tap CHECK IN on Tyler → verify Tyler appears in Currently In Pool → sign out
2. **Family batch check-in via GHL webhook simulation**: POST to `/webhooks/ghl/checkin` with batch payload → verify dashboard reflects within 5s polling
3. **Guest pass purchase**: POST to `/webhooks/ghl/guestpass` with member contact_id → verify household card shows +10 passes
4. **Capacity change**: Settings → Pool capacity → 100 → verify dashboard subtitle updates
5. **Sign out everyone**: Membership with 3 people in pool → sign-out-all webhook → all flipped

E2E is the lowest-value/highest-cost tier — keep it small. Five is plenty.

## 6. Test data strategy

- **Fixtures**: a `tests/fixtures/` folder with `csvRows.ts` (5 representative rows from the real CSV — masked emails), `webhookPayloads.ts` (one example for each GHL webhook captured from webhook.site), `members.ts` (3 seed households for integration tests)
- **DB seeding**: a `tests/helpers/seed.ts` exports `seedClub()`, `seedMembership({tier, withFamily})` that wrap Prisma in transactions
- **DB cleanup**: each integration test runs inside a transaction that gets rolled back at teardown (Vitest's `beforeEach`/`afterEach`) — clean state, fast
- **No leaking to dashboard**: tests use a separate test club_id (`test-` prefix) so accidental DB hits don't contaminate dashboard

## 7. CI integration

Add to GitHub Actions (or App Runner pre-deploy):

```yaml
test:
  - npm ci
  - npm run db:generate
  - npm run test:unit       # vitest run, no DB
  - npm run test:integration # vitest run, against pg docker container
  - npm run test:frontend    # cd frontend && vitest run
  - npm run build           # existing build step (ensures TS still compiles)
```

Fail the build if coverage drops below threshold. Skip E2E in PR CI (run on nightly schedule instead — they're flakier and slower).

## 8. Phased rollout plan

You have a working production system; don't shave the yak. Phase it.

### Phase 1 (week 1) — Safety net
- Set up Vitest in backend + frontend workspaces
- Write unit tests for the 6 lib files (`guestPasses`, `timezone`, parsers in `importMembers`, `normalizeName` in `signup`)
- Aim: 50 tests, all <2 seconds, run on every save

### Phase 2 (week 2) — Webhook regression coverage
- Integration tests for all 4 webhooks (signup, checkin, signout, guestPassPurchase)
- Use captured real payloads as fixtures
- Aim: 30 more tests covering happy + each error path

### Phase 3 (week 3) — API contract + frontend critical components
- Integration tests for `/api/v1/*` endpoints
- Component tests for MemberDetailSheet + Dashboard + SettingsMenu
- Add CI to GitHub Actions

### Phase 4 (week 4) — E2E + a11y
- 5 Playwright journeys
- vitest-axe checks on top 3 pages
- First true regression-safe deploy

### Phase 5 (ongoing) — Maintain
- Rule: every bug fix lands with a regression test
- Rule: every new endpoint lands with integration tests
- Rule: refactors require existing tests to keep passing

## 9. Coverage targets summary

| Area | Target | Current |
|---|---|---|
| `src/lib/*` | 100% | 0% |
| `src/middleware/*` | 100% | 0% |
| `src/handlers/*.ts` | 85% | 0% |
| `src/routes/*.ts` | 70% | 0% |
| `scripts/importMembers.ts` | 85% | 0% |
| `frontend/src/components/*` | 50% | 0% |
| `frontend/src/hooks/*` | 70% | 0% |
| `frontend/src/pages/*` | 40% | 0% |
| E2E critical paths | 5 journeys | 0 |

## 10. What I'd skip

- Trivial getters/setters (none in this code anyway)
- shadcn/Radix primitive components (they have their own tests upstream)
- One-off SQL queries
- The `src/templates/*` HTML templates (server-rendered confirmation pages; covered by E2E if needed)
- Logger output
- Type checks (TypeScript already does this)

## 11. What this strategy explicitly does NOT solve

Honest disclaimers:

- **Load testing**: not in scope. If Wedgewood grows past 500 households or 50 concurrent staff, revisit with k6.
- **Security pentest**: separate concern. We have JWT + webhook secret; a pentest would test for injection, IDOR, etc.
- **Migration testing**: when schema changes happen, you need to write a one-off test that the migration is safe + idempotent. Not part of the standing suite.
- **Visual regression**: skipped on purpose — adds maintenance overhead, our UI is stable enough.
- **GHL contract validation**: GHL changes their webhook payload structure unilaterally. We can't test against their future changes. Mitigation: capture payloads in webhook.site regularly and compare against fixtures.

## 12. First test to write (start tomorrow morning)

Don't try to set up the whole pyramid at once. Start here:

```ts
// tests/lib/guestPasses.test.ts
import { describe, it, expect } from "vitest";
import { calculateInitialGuestPasses, PASSES_PER_PACK } from "../../src/lib/guestPasses";

describe("calculateInitialGuestPasses", () => {
  it("returns 0 for null", () => {
    expect(calculateInitialGuestPasses(null)).toBe(0);
  });

  it("returns 5 for dates before May 1, 2026", () => {
    expect(calculateInitialGuestPasses(new Date("2026-04-30T12:00:00Z"))).toBe(5);
  });

  it("returns 5 for May 1, 2026 itself (inclusive cutoff)", () => {
    expect(calculateInitialGuestPasses(new Date("2026-05-01T23:59:00Z"))).toBe(5);
  });

  it("returns 0 for dates after May 1, 2026", () => {
    expect(calculateInitialGuestPasses(new Date("2026-05-02T00:00:01Z"))).toBe(0);
  });
});

describe("PASSES_PER_PACK constant", () => {
  it("equals 10", () => {
    expect(PASSES_PER_PACK).toBe(10);
  });
});
```

This is 30 lines, no setup, no DB. Run `npx vitest run tests/lib/guestPasses.test.ts`. Green. You now have a foothold.

Then write the next 10 unit tests in `lib/` and `middleware/`. You'll have 20% coverage on your most critical code in a single afternoon.
