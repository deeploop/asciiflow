import { parseDimensionFormula } from "#asciiflow/client/dimension_formula";
import { expect } from "chai";

describe("dimension_formula", () => {
  describe("parseDimensionFormula", () => {
    it("computes the running total for a real-world height chain", () => {
      // Verified against DOOR_SHOP_DRAWING_ANALYSIS.md's reference drawing:
      // 2439 - 45 - 10 = 2384.
      const result = parseDimensionFormula("2439\n-45\n-10");
      expect(result.errors).to.have.length(0);
      expect(result.terms).deep.equals([2439, "-45", "-10"]);
      expect(result.total).equals(2384);
    });

    it("computes the running total for a real-world width formula", () => {
      // 1114 + 18 + 7 + 24 = 1163.
      const result = parseDimensionFormula("1114\n+18\n+7\n+24");
      expect(result.errors).to.have.length(0);
      expect(result.total).equals(1163);
    });

    it("accepts a bare base value with no deltas", () => {
      const result = parseDimensionFormula("900");
      expect(result.errors).to.have.length(0);
      expect(result.terms).deep.equals([900]);
      expect(result.total).equals(900);
    });

    it("ignores blank lines and surrounding whitespace", () => {
      const result = parseDimensionFormula("\n  2400  \n\n  -10  \n\n");
      expect(result.errors).to.have.length(0);
      expect(result.terms).deep.equals([2400, "-10"]);
      expect(result.total).equals(2390);
    });

    it("supports decimal deltas", () => {
      const result = parseDimensionFormula("100\n+2.5\n-0.5");
      expect(result.errors).to.have.length(0);
      expect(result.total).equals(102);
    });

    it("reports an empty formula instead of crashing", () => {
      const result = parseDimensionFormula("");
      expect(result.terms).to.have.length(0);
      expect(result.total).equals(0);
      expect(result.errors).to.have.length(1);
      expect(result.errors[0]).contains("empty");
    });

    it("reports a non-numeric base value but still returns a usable result", () => {
      const result = parseDimensionFormula("abc\n+10");
      expect(result.errors.some((e) => e.includes("base value"))).equals(true);
      // The delta after a bad base is still parsed on its own terms — the
      // caller (a live UI preview) gets partial feedback, not a crash.
      expect(result.total).equals(10);
    });

    it("reports a malformed delta line (missing sign) without dropping the rest", () => {
      const result = parseDimensionFormula("2400\n10\n-5");
      expect(result.errors.some((e) => e.includes('"10"'))).equals(true);
      // The malformed term doesn't participate in the sum...
      expect(result.total).equals(2395); // 2400 - 5, "10" skipped
      // ...but is still preserved in terms, so a UI can show the user
      // exactly what they typed rather than silently discarding it.
      expect(result.terms).deep.equals([2400, "10", "-5"]);
    });
  });
});
