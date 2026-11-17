/** Six digits, first digit 1 to 9. Mirrors worker/pincode.py. */
export function isValidPincode(value: unknown): value is string {
  return typeof value === "string" && /^[1-9][0-9]{5}$/.test(value);
}
