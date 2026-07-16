export type ScalarTargetField =
  | "accountHolderName"
  | "email"
  | "phone"
  | "streetAddress"
  | "city"
  | "postalCode"
  | "state"
  | "country"
  | "memberCount"
  | "guestPasses"
  | "paymentAmount"
  | "orderId"
  | "submittedAt"
  | "medicalNotes";

export const normalizeHeader = (header: string): string => header.toLowerCase().replace(/[^a-z0-9]/g, "");

export const HEADER_SYNONYMS: Record<ScalarTargetField, string[]> = {
  accountHolderName: ["Your Full Name", "Full Name", "Name", "member_name"],
  email: ["Your Email", "E-Mail Addr", "Email"],
  phone: ["Your Phone", "Mobile #", "Phone"],
  streetAddress: ["Street Address", "Home Address"],
  city: ["City"],
  postalCode: ["Postal Code", "Zip"],
  state: ["State"],
  country: ["Country"],
  memberCount: ["Select the # of Members for your Membership", "# in Plan", "Members", "plan_size"],
  guestPasses: ["Guest Passes", "GuestPasses"],
  paymentAmount: ["Payment Amount", "Amt", "amount_paid"],
  orderId: ["Order Id"],
  submittedAt: ["Submission Date", "Joined", "Signup", "signup_date"],
  medicalNotes: [
    "Do you have any allergies, medical concerns, or require any special accommodations? If so, please describe:",
    "Do you require any special accommodations? If so, please describe:",
    "allergies",
    "notes"
  ]
};

export const SYNONYM_LOOKUP = Object.fromEntries(
  Object.entries(HEADER_SYNONYMS).flatMap(([targetField, headers]) =>
    headers.map((header) => [normalizeHeader(header), targetField as ScalarTargetField])
  )
) as Record<string, ScalarTargetField>;
