/** A roof's public id is "<pincode>-<12 hex id>", e.g. 380015-6cf7824cee6a. */
export const formatRoofId = (pincode: string, id: string) => `${pincode}-${id}`;

export function parseRoofId(value: string): { pincode: string; id: string } | null {
  const match = /^([1-9][0-9]{5})-([a-f0-9]{12})$/.exec(value);
  return match ? { pincode: match[1], id: match[2] } : null;
}
