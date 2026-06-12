import { TEST_GHL_LOCATION_ID } from "./seed";

export const TEST_WEBHOOK_SECRET = "test-webhook-secret";

/** GHL signup webhook payload, shaped like the real form submission. */
export const buildSignupPayload = (overrides: Record<string, unknown> = {}): Record<string, unknown> => ({
  location: { id: TEST_GHL_LOCATION_ID },
  contact_id: "contact_test_1",
  first_name: "Donna",
  last_name: "Phillips",
  email: "donna.phillips@example.com",
  phone: "+1 (302) 555-1234",
  "Select the # of Members for your Membership": "3",
  "1st Member Full Name": "Tyler Phillips",
  "1st Member Age": "8 years old",
  "2nd Member Full Name": "Emma Phillips",
  "Emergency Contact Full Name": "Donna Phillips",
  "Emergency Contact Mobile Number": "+1 (302) 332-1052",
  "Emergency Contact Email": "donna.emergency@example.com",
  "Street Address": "236 East Flagstone Dr",
  City: "Newark",
  State: "Delaware",
  "Postal Code": "19702",
  Country: "United States",
  "Do you require any special accommodations? If so, please describe:": "Peanut allergy (Tyler)",
  triggerData: { payment_status: "paid", "Payment Amount": "$340" },
  ...overrides
});

/** Legacy single-person check-in payload (Branch A: no ordinal member fields). */
export const buildSingleCheckinPayload = (overrides: Record<string, unknown> = {}): Record<string, unknown> => ({
  location: { id: TEST_GHL_LOCATION_ID },
  email: "donna.phillips@example.com",
  first_name: "Donna",
  last_name: "Phillips",
  "Select Option:": "Sign-In",
  ...overrides
});

/** Batch check-in payload (Branch B: named members trigger batch path). */
export const buildBatchCheckinPayload = (
  memberNames: string[],
  overrides: Record<string, unknown> = {}
): Record<string, unknown> => {
  const ordinals = ["1st", "2nd", "3rd", "4th", "5th", "6th", "7th", "8th"];
  const namedFields = Object.fromEntries(
    memberNames.map((name, index) => [`Full Name of ${ordinals[index]} Member`, name])
  );

  return {
    location: { id: TEST_GHL_LOCATION_ID },
    email: "donna.phillips@example.com",
    "Select Option:": "Sign-In",
    // The real GHL form gates the guest count behind a yes/no question:
    // the handler only reads "# of guests entering" when "Any guests?" is "Yes".
    "Any guests?": "No",
    "# of guests entering": "0",
    ...namedFields,
    ...overrides
  };
};
