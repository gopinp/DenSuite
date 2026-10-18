export const STAFF_ROLES = [
  "DENTIST",
  "DENTAL_NURSE",
  "PRACTICE_MANAGER",
  "RECEPTIONIST",
  "PRACTICE_OWNER",
  "ADMIN",
] as const;

export type StaffRole = (typeof STAFF_ROLES)[number];
