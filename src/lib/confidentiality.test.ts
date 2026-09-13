import { describe, expect, it } from "vitest";
import { checkForForeignBranding } from "./confidentiality";

describe("checkForForeignBranding", () => {
  it("flags a manufacturer name that leaked into client-facing text", () => {
    const text =
      "Supply proforma for guest room finishes. As written: Foshan Nanhai Ceramics Co., Ltd quotation attached.";
    const result = checkForForeignBranding(text, ["Foshan Nanhai Ceramics Co., Ltd"]);
    expect(result.clean).toBe(false);
    expect(result.matches).toEqual(["Foshan Nanhai Ceramics Co., Ltd"]);
  });

  it("does not flag UZA's own name as a false positive", () => {
    const text = "Issued by UZA Solutions Ltd, UZA Finishing Solutions, UNIFY House, Kiyovu, Kigali, Rwanda.";
    // "UZA Solutions Ltd" is deliberately also passed in as if it were a
    // supplier row match candidate, to prove the allow-list wins.
    const result = checkForForeignBranding(text, ["UZA Solutions Ltd", "UZA Finishing Solutions"]);
    expect(result.clean).toBe(true);
    expect(result.matches).toEqual([]);
  });

  it("is case-insensitive", () => {
    const result = checkForForeignBranding("quoted by GUANGDONG PEARL FACTORY", ["Guangdong Pearl Factory"]);
    expect(result.clean).toBe(false);
  });

  it("flags Cecilia's personal contact details if present", () => {
    const result = checkForForeignBranding(
      "For questions contact cecilia@uza.rw directly.",
      ["cecilia@uza.rw"],
    );
    expect(result.clean).toBe(false);
    expect(result.matches).toEqual(["cecilia@uza.rw"]);
  });

  it("skips names shorter than 3 characters to avoid noisy false positives", () => {
    const result = checkForForeignBranding("A normal sentence with no issue.", ["Ltd", "Co", ""]);
    expect(result.clean).toBe(true);
  });

  it("passes clean text with no matches", () => {
    const result = checkForForeignBranding(
      "Supply proforma, phase 1 guest rooms, FOB China.",
      ["Foshan Nanhai Ceramics Co., Ltd", "Guangdong Pearl Factory"],
    );
    expect(result.clean).toBe(true);
    expect(result.matches).toEqual([]);
  });

  it("de-duplicates repeated matches", () => {
    const result = checkForForeignBranding(
      "Foshan Nanhai quoted this. Foshan Nanhai also quoted the second line.",
      ["Foshan Nanhai"],
    );
    expect(result.matches).toEqual(["Foshan Nanhai"]);
  });

  it("ignores null/undefined entries in the known-names list", () => {
    const result = checkForForeignBranding("Clean text.", [null, undefined, "Foshan Nanhai"]);
    expect(result.clean).toBe(true);
  });
});
