import { describe, expect, it } from "vitest";
import { isValidPincode } from "./pincode";
import { estimate, SQFT_PER_M2, subsidy } from "./savings";

describe("savings model", () => {
  it("matches the worked example: 300 sq ft home", () => {
    expect(estimate(300 / SQFT_PER_M2, "residential")).toEqual({
      kw: 3,
      units_per_year: 4200,
      saving_per_year: 29400,
      saving_low: 24990,
      saving_high: 33810,
      system_cost: 165000,
      subsidy: 78000,
      net_cost: 87000,
      payback_years: 3,
    });
  });

  it("applies subsidy slabs and caps", () => {
    expect(subsidy(1, "residential", null)).toBe(30000);
    expect(subsidy(2.5, "residential", null)).toBe(69000);
    expect(subsidy(10, "residential", null)).toBe(78000);
    expect(subsidy(3, "residential", "Uttarakhand")).toBe(85800);
    expect(subsidy(50, "commercial", null)).toBe(0);
  });

  it("caps homes at 10 kW and prices businesses at the commercial tariff", () => {
    expect(estimate(500, "residential").kw).toBe(10);
    expect(estimate(1000, "commercial").saving_per_year).toBe(100 * 1400 * 9);
  });

  it("uses sunshine hours when given", () => {
    expect(estimate(100, "commercial", null, 2000).units_per_year).toBe(15000);
  });
});

describe("pincode validation", () => {
  it("accepts six digits not starting with zero", () => {
    expect(isValidPincode("380015")).toBe(true);
    for (const bad of ["080015", "38001", "3800155", "38O015", "", null, 380015]) {
      expect(isValidPincode(bad)).toBe(false);
    }
  });
});
