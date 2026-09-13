import { describe, expect, it } from "vitest";
import {
  MANUFACTURER_REFUSAL,
  assertPackageInScope,
  canSeeAttachment,
  canWriteAttachment,
  isPackageInScope,
  redactForManufacturer,
} from "./manufacturer-access";

describe("isPackageInScope / assertPackageInScope", () => {
  it("allows a manufacturer to read a package it is shortlisted on", () => {
    expect(isPackageInScope({ supplierId: "factory-a", invitedSupplierIds: ["factory-a", "factory-b"] })).toBe(
      true,
    );
    expect(() =>
      assertPackageInScope({ supplierId: "factory-a", invitedSupplierIds: ["factory-a", "factory-b"] }),
    ).not.toThrow();
  });

  it("refuses a manufacturer reading a DIFFERENT manufacturer's package", () => {
    // factory-c was never shortlisted on this package — the package belongs
    // entirely to factory-a and factory-b.
    expect(isPackageInScope({ supplierId: "factory-c", invitedSupplierIds: ["factory-a", "factory-b"] })).toBe(
      false,
    );
    expect(() =>
      assertPackageInScope({ supplierId: "factory-c", invitedSupplierIds: ["factory-a", "factory-b"] }),
    ).toThrow(MANUFACTURER_REFUSAL);
  });

  it("refuses an account with no linked supplier at all", () => {
    expect(isPackageInScope({ supplierId: null, invitedSupplierIds: ["factory-a"] })).toBe(false);
  });

  it("uses the identical refusal message regardless of which check failed (no distinguishable error)", () => {
    let refusalA = "";
    let refusalB = "";
    try {
      assertPackageInScope({ supplierId: null, invitedSupplierIds: [] });
    } catch (e) {
      refusalA = (e as Error).message;
    }
    try {
      assertPackageInScope({ supplierId: "factory-c", invitedSupplierIds: ["factory-a"] });
    } catch (e) {
      refusalB = (e as Error).message;
    }
    expect(refusalA).toBe(refusalB);
    expect(refusalA).toBe(MANUFACTURER_REFUSAL);
  });
});

describe("canSeeAttachment", () => {
  it("lets a manufacturer see a general RFQ document UZA addressed to everyone", () => {
    expect(canSeeAttachment({ supplierId: "factory-a", uploadedForSupplierId: null })).toBe(true);
  });

  it("lets a manufacturer see its own submission", () => {
    expect(canSeeAttachment({ supplierId: "factory-a", uploadedForSupplierId: "factory-a" })).toBe(true);
  });

  it("hides a RIVAL manufacturer's submission on the same package", () => {
    expect(canSeeAttachment({ supplierId: "factory-a", uploadedForSupplierId: "factory-b" })).toBe(false);
  });

  it("hides everything from an account with no linked supplier", () => {
    expect(canSeeAttachment({ supplierId: null, uploadedForSupplierId: null })).toBe(false);
  });
});

describe("canWriteAttachment", () => {
  it("lets a manufacturer tag an upload as its own submission", () => {
    expect(canWriteAttachment({ supplierId: "factory-a", uploadedForSupplierId: "factory-a" })).toBe(true);
  });

  it("refuses tagging an upload as a general RFQ doc (only staff may do that)", () => {
    expect(canWriteAttachment({ supplierId: "factory-a", uploadedForSupplierId: null })).toBe(false);
  });

  it("refuses impersonating another manufacturer's upload", () => {
    expect(canWriteAttachment({ supplierId: "factory-a", uploadedForSupplierId: "factory-b" })).toBe(false);
  });
});

describe("redactForManufacturer", () => {
  it("strips the client's identity and the USD proforma price/reference", () => {
    const payload = {
      id: "pkg-1",
      title: "Guest room joinery",
      clientName: "Kigali Heights Hotel Ltd",
      clientContact: "+250 788 000 000",
      usdPriceMinor: 1_200_000,
      proformaReference: "UZA-PF-2609-0007",
    };
    const redacted = redactForManufacturer(payload);
    expect(redacted).toEqual({ id: "pkg-1", title: "Guest room joinery" });
    expect("clientName" in redacted).toBe(false);
    expect("usdPriceMinor" in redacted).toBe(false);
  });

  it("does nothing harmful when the confidential fields are already absent", () => {
    const payload = { id: "pkg-2", title: "Tiles", clientName: undefined };
    expect(redactForManufacturer(payload)).toEqual({ id: "pkg-2", title: "Tiles" });
  });
});
