import { describe, expect, it } from "vitest";
import { speckleEmbedUrl, validateDrawingId, validatePostIssue, validateProjectId } from "./speckle.functions";

describe("speckleEmbedUrl", () => {
  it("builds a best-effort embed url from server/project/model ids", () => {
    expect(speckleEmbedUrl("https://app.speckle.systems", "proj123", "model456")).toBe(
      "https://app.speckle.systems/projects/proj123/models/model456#embed=true",
    );
  });
});

describe("validateProjectId", () => {
  it("accepts a non-empty project id", () => {
    expect(validateProjectId({ projectId: "p1" })).toEqual({ projectId: "p1" });
  });

  it("rejects a missing project id", () => {
    expect(() => validateProjectId({})).toThrow();
    expect(() => validateProjectId({ projectId: "" })).toThrow();
  });
});

describe("validateDrawingId", () => {
  it("accepts a non-empty drawing id", () => {
    expect(validateDrawingId({ drawingId: "d1" })).toEqual({ drawingId: "d1" });
  });

  it("rejects a missing drawing id", () => {
    expect(() => validateDrawingId({})).toThrow();
  });
});

describe("validatePostIssue", () => {
  it("requires a drawing id and a title, and trims/caps their lengths", () => {
    expect(validatePostIssue({ drawingId: "d1", title: "Tile colour", body: "Looks off in this corner." })).toEqual({
      drawingId: "d1",
      title: "Tile colour",
      body: "Looks off in this corner.",
    });
  });

  it("rejects a comment with no title", () => {
    expect(() => validatePostIssue({ drawingId: "d1", title: "" })).toThrow();
  });

  it("rejects a comment with no drawing selected", () => {
    expect(() => validatePostIssue({ title: "Tile colour" })).toThrow();
  });

  it("defaults body to an empty string when omitted", () => {
    expect(validatePostIssue({ drawingId: "d1", title: "Tile colour" }).body).toBe("");
  });
});
