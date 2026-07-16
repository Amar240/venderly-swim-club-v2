# Ingestion Test Fixtures — Manifest (the test oracle)

These files exercise the v3 ingestion engine. Each is a deliberately-messy export a prospect club might hand us. For each fixture below, the **Expected mapping** and **Expected transforms** define what a correct engine must produce. Codex builds the engine to satisfy these.

**Canonical target schema** (what every fixture must map *into*):
- `membership`: `accountHolderName`, `email`, `phone` (E.164), `streetAddress?`, `city?`, `postalCode?` (string, keep leading zeros), `state?`, `country?`, `memberCount`, `guestPasses?`, `paymentAmount?`, `orderId?`, `submittedAt?` (ISO 8601), `medicalNotes?`
- `person[]` (one per person on the membership): `fullName`, `age?`, `phone?`, `isPrimary` (boolean)

**Who is in `persons` (matches v2 `signup.ts`):** the account holder IS a person with `isPrimary: true`; each additional/family member is a person with `isPrimary: false`. Dedupe: skip any listed member whose normalized name equals the account holder's (never double-count the holder). Note `memberCount` (the tier/"# of Members" field) is stored as-is and is NOT necessarily equal to `persons.length`.

Row count in each fixture: 40 memberships (subset of the 750-row sample).

---

## base_wedgewood_wide.csv — happy path (wide)
Exact GHL/Wedgewood shape. `1st…7th Member *` are repeating groups.

**Expected mapping:** `Your Full Name→accountHolderName`, `Your Email→email`, `Your Phone→phone`, `Street Address→streetAddress`, `City→city`, `Postal Code→postalCode`, `State→state`, `Country→country`, `Select the # of Members…→memberCount`, `Guest Passes→guestPasses`, `Payment Amount→paymentAmount`, `Order Id→orderId`, `Submission Date→submittedAt`, allergies col→`medicalNotes`.
**Expected transforms:** `split_people` (wide→long over the 7 member groups, drop null groups); `coerce_int_zeropad` on Postal Code (`19929.0`→`"19929"`); `coerce_phone`; `parse_date_loose`; `drop_column` on `Terms and Conditions`, `Timezone`, `Payment Status`, `Email Verified`, `Phone Verified` (constant/empty/irrelevant).
**Spot check:** row 1 (Caleb Lewis) → 3 persons: Caleb Lewis (primary), Kevin Lewis (67), Ethan Lewis (11).

## fixture_A_long_per_person.csv — already long, grouped by household
One row per person; `household_id` ties a family together; `is_primary=yes` marks the account holder.

**Expected mapping:** `household_id`→(grouping key, not a field), `member_name→person.fullName` / `accountHolderName` when primary, `age→person.age`, `phone→phone`/`person.phone`, `email→email` (primary only), `plan_size→memberCount`, `amount_paid→paymentAmount`, `signup_date→submittedAt`.
**Expected transforms:** `group_people` (collapse N rows sharing `household_id` into one membership + N persons); the primary row (`is_primary=yes`) supplies membership-level fields. **Key case: proves the engine handles long as well as wide.**

## fixture_B_renamed_combined.csv — renamed headers + combined "name (age)" cell
Headers are synonyms; `Family Members` packs everyone into one cell: `"Kevin Lewis (67); Ethan Lewis (11)"`.

**Expected mapping (via synonyms):** `Full Name→accountHolderName`, `E-Mail Addr→email`, `Mobile #→phone`, `Home Address→streetAddress`, `# in Plan→memberCount`, `Amt→paymentAmount`, `Joined→submittedAt`, `Family Members→person[]`.
**Expected transforms:** `split_people_from_cell` (split on `;`, then regex `Name (age)` → `{fullName, age}`); `coerce_phone`; `parse_date_loose`.
**Spot check:** row 1 → 3 persons: Caleb Lewis (primary), Kevin Lewis (67), Ethan Lewis (11).

## fixture_C_mixed_junk.csv — mixed phone formats, leading-zero zip, constant/empty/junk cols
`Phone` appears in 3 formats: `+13025911540`, `3026742095`, `(302) 486-0333`. `Zip` has a string leading-zero value `01992`. `State`/`Country` constant. `_internal_id`, `LegacyFlag` junk; `EmailVerified` empty.

**Expected mapping:** `Name→accountHolderName`, `Phone→phone`, `Email→email`, `Zip→postalCode`, `State→state`, `Country→country`, `Members→memberCount`, `GuestPasses→guestPasses`, `Notes→medicalNotes`.
**Expected transforms:** `coerce_phone` normalizes all 3 formats to the same E.164; `postalCode` preserved as **string** (`01992` stays `"01992"` — never numeric-coerce a zip); `drop_column` on `_internal_id`, `LegacyFlag`, `EmailVerified`. Empty `GuestPasses` → null (not 0).

## fixture_D_dates_split_name.csv — split name, combined address, varied dates
`First Name`+`Last Name` separate; `Full Address` = `"8354 Sunset Blvd, Smyrna, DE, USA ChIJ888…"` with Google Place-ID tail; `Signup` in 3 formats (`"Jul 6th 2026, 11:52 pm"`, `2026-07-09`, `07/09/2026`).

**Expected mapping:** `First Name`+`Last Name→accountHolderName` (join), `Email→email`, `Phone→phone`, `Full Address→streetAddress/city/state` (split), `Signup→submittedAt`, `Members→memberCount`.
**Expected transforms:** `join_name` (First+Last→fullName); `split_address` (parse street/city/state, strip the `ChIJ…` place-id tail); `parse_date_loose` handles all 3 date formats → ISO.

---

## Coverage matrix
| Transform / capability | base | A | B | C | D |
|---|---|---|---|---|---|
| header synonym match | · | · | ✓ | ✓ | ✓ |
| wide→long (`split_people`) | ✓ | | | | |
| long grouping (`group_people`) | | ✓ | | | |
| split combined cell → people | | | ✓ | | |
| join first+last name | | | | | ✓ |
| split combined address | | | | | ✓ |
| mixed phone → E.164 | ✓ | | ✓ | ✓ | ✓ |
| postal leading-zero (string) | | | | ✓ | |
| loose/multi-format dates | ✓ | | ✓ | | ✓ |
| drop constant/empty/junk cols | ✓ | | | ✓ | |

An engine that passes all five is ready for the LLM layer and the DB-load stage.
