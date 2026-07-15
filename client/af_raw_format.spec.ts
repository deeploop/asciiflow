import { packRaw, unpackRaw, unpackRawJsonString } from "#asciiflow/client/af_raw_format";
import { expect } from "chai";

describe("af_raw_format", () => {
  describe("packRaw", () => {
    it("wraps plain multi-line text as {raw: text}, preserving real newlines", () => {
      expect(packRaw("line1\nline2\nline3")).deep.equals({ raw: "line1\nline2\nline3" });
    });

    it("wraps a single line the same way, no special-casing", () => {
      expect(packRaw("just one line")).deep.equals({ raw: "just one line" });
    });

    it("wraps empty text as {raw: \"\"}", () => {
      expect(packRaw("")).deep.equals({ raw: "" });
    });
  });

  describe("unpackRaw", () => {
    it("unwraps {raw: \"string\"} to the plain string", () => {
      expect(unpackRaw({ raw: "line1\nline2" })).equals("line1\nline2");
    });

    it("unwraps {raw: [...]} by joining the array with newlines — the exact conversion in the user's reference prompt", () => {
      expect(unpackRaw({ raw: ["第1行", "第2行", "第3行"] })).equals("第1行\n第2行\n第3行");
    });

    it("joins a bare array with newlines even when not wrapped in raw", () => {
      expect(unpackRaw(["a", "b", "c"])).equals("a\nb\nc");
    });

    it("passes a bare string through unchanged", () => {
      expect(unpackRaw("already plain text")).equals("already plain text");
    });

    it("returns empty string for null/undefined instead of \"null\"/\"undefined\"", () => {
      expect(unpackRaw(null)).equals("");
      expect(unpackRaw(undefined)).equals("");
    });

    it("falls back to pretty-printed JSON for a shape it doesn't recognize", () => {
      expect(unpackRaw({ a: 1, b: 2 })).equals(JSON.stringify({ a: 1, b: 2 }, null, 2));
    });

    it("joins a numeric array by stringifying each element first", () => {
      expect(unpackRaw({ raw: [1, 2, 3] })).equals("1\n2\n3");
    });
  });

  describe("unpackRawJsonString", () => {
    it("parses a stored {\"raw\": \"...\"} JSON string into plain text", () => {
      expect(unpackRawJsonString('{"raw":"line1\\nline2"}')).equals("line1\nline2");
    });

    it("parses a stored {\"raw\": [...]} JSON string into newline-joined plain text", () => {
      expect(unpackRawJsonString('{"raw":["a","b"]}')).equals("a\nb");
    });

    it("returns empty string for undefined/empty input instead of throwing", () => {
      expect(unpackRawJsonString(undefined)).equals("");
      expect(unpackRawJsonString("")).equals("");
    });

    it("falls back to the original string as-is when it isn't valid JSON", () => {
      expect(unpackRawJsonString("not json at all")).equals("not json at all");
    });

    it("round-trips the exact example from the user's reference prompt", () => {
      const stored = JSON.stringify({ raw: ["第1行", "第2行", "第3行"] });
      expect(unpackRawJsonString(stored)).equals("第1行\n第2行\n第3行");
    });
  });

  describe("pack/unpack round-trip", () => {
    it("unpackRaw(packRaw(text)) returns the original text exactly", () => {
      const text = "line1\nline2\n第三行\nline4";
      expect(unpackRaw(packRaw(text))).equals(text);
    });
  });
});
