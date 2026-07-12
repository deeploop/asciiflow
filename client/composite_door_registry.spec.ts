import {
  BUILTIN_COMPOSITE_DOOR_TEMPLATES,
  clearCustomCompositeDoorTemplates,
  getActiveCompositeDoorTemplates,
  getCustomCompositeDoorTemplates,
  parseCompositeDoorTemplateFile,
  setCustomCompositeDoorTemplates,
} from "#asciiflow/client/composite_door_registry";
import { expect } from "chai";

describe("composite_door_registry", () => {
  afterEach(() => {
    clearCustomCompositeDoorTemplates();
  });

  it("exposes the built-in templates by default", () => {
    const names = getActiveCompositeDoorTemplates().map((t) => t.name);
    for (const builtin of Object.keys(BUILTIN_COMPOSITE_DOOR_TEMPLATES)) {
      expect(names).contains(builtin);
    }
  });

  describe("parseCompositeDoorTemplateFile", () => {
    it("loads a valid array of templates", () => {
      const { registry, errors } = parseCompositeDoorTemplateFile(
        JSON.stringify([
          { name: "my-door", boxWidth: 12, boxHeight: 8, lockSide: "left", heightFormula: "2400" },
        ])
      );
      expect(errors).to.have.length(0);
      expect(registry["my-door"]).deep.equals({
        name: "my-door",
        boxWidth: 12,
        boxHeight: 8,
        lockSide: "left",
        heightFormula: "2400",
        widthFormula: undefined,
      });
    });

    it("defaults lockSide to left when omitted", () => {
      const { registry, errors } = parseCompositeDoorTemplateFile(
        JSON.stringify([{ name: "x", boxWidth: 10, boxHeight: 6 }])
      );
      expect(errors).to.have.length(0);
      expect(registry["x"].lockSide).equals("left");
    });

    it("rejects malformed JSON with a clear error, not a crash", () => {
      const { registry, errors } = parseCompositeDoorTemplateFile("{ not json");
      expect(registry).deep.equals({});
      expect(errors[0]).contains("JSON parse error");
    });

    it("rejects a non-array root", () => {
      const { registry, errors } = parseCompositeDoorTemplateFile(JSON.stringify({ name: "x" }));
      expect(registry).deep.equals({});
      expect(errors[0]).contains("array");
    });

    it("loads valid entries and reports invalid ones independently (partial success)", () => {
      const { registry, errors } = parseCompositeDoorTemplateFile(
        JSON.stringify([
          { name: "good", boxWidth: 10, boxHeight: 6 },
          { name: "bad", boxWidth: -5, boxHeight: 6 }, // invalid boxWidth
        ])
      );
      expect(Object.keys(registry)).deep.equals(["good"]);
      expect(errors.some((e) => e.includes("boxWidth"))).equals(true);
    });

    it("rejects a missing name", () => {
      const { registry, errors } = parseCompositeDoorTemplateFile(
        JSON.stringify([{ boxWidth: 10, boxHeight: 6 }])
      );
      expect(registry).deep.equals({});
      expect(errors.some((e) => e.includes("name"))).equals(true);
    });

    it("rejects an unrecognized lockSide", () => {
      const { registry, errors } = parseCompositeDoorTemplateFile(
        JSON.stringify([{ name: "x", boxWidth: 10, boxHeight: 6, lockSide: "top" }])
      );
      expect(registry).deep.equals({});
      expect(errors.some((e) => e.includes("lockSide"))).equals(true);
    });

    it("rejects a non-string heightFormula/widthFormula", () => {
      const { registry, errors } = parseCompositeDoorTemplateFile(
        JSON.stringify([{ name: "x", boxWidth: 10, boxHeight: 6, heightFormula: 2400 }])
      );
      expect(registry).deep.equals({});
      expect(errors.some((e) => e.includes("heightFormula"))).equals(true);
    });
  });

  describe("merging into the active template registry", () => {
    it("merges custom templates on top of built-ins", () => {
      setCustomCompositeDoorTemplates({
        "my-door": { name: "my-door", boxWidth: 12, boxHeight: 8, lockSide: "left" },
      });
      const names = getActiveCompositeDoorTemplates().map((t) => t.name);
      expect(names).contains("my-door");
      expect(names).contains("standard-900"); // built-in still present
    });

    it("lets a custom entry override a built-in name (custom wins)", () => {
      setCustomCompositeDoorTemplates({
        "standard-900": { name: "standard-900", boxWidth: 99, boxHeight: 99, lockSide: "right" },
      });
      const overridden = getActiveCompositeDoorTemplates().find((t) => t.name === "standard-900");
      expect(overridden.boxWidth).equals(99);
    });

    it("clearCustomCompositeDoorTemplates restores built-ins-only", () => {
      setCustomCompositeDoorTemplates({ x: { name: "x", boxWidth: 1, boxHeight: 1, lockSide: "left" } });
      clearCustomCompositeDoorTemplates();
      expect(getCustomCompositeDoorTemplates()).deep.equals({});
      const names = getActiveCompositeDoorTemplates().map((t) => t.name);
      expect(names).deep.equals(Object.keys(BUILTIN_COMPOSITE_DOOR_TEMPLATES));
    });
  });
});
