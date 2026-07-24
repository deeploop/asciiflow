# AI Prompt: Writing a Runtime Door-Type Definition File

Use this when you want new door types loaded through the door panel's
**[load door types]** button — no rebuild, no code change — rather than
adding a compile-time entry to `client/door_registry.ts` (for that, use
`DOOR_TEMPLATE_AI_PROMPT.md` / `DOOR_MENU_AI_PROMPT.md` instead). Paste the
block below, then describe the door types you want at the end.

---

## PROMPT (copy from here)

You're writing a door-type **definition file** for ASCIIFlow's door module,
to be loaded at runtime via the door panel's `[load door types]` button
(implemented by `parseDoorRegistryFile` in `client/doors.ts`). This is data,
not code — you are not editing the ASCIIFlow source.

### Output format — pick ONE

**JSON** (`.json`):

```json
{
  "CODE": {
    "name": "中文名稱",
    "englishName": "English Name",
    "row1_formula": "..."
  }
}
```

**Plain text block** (`.txt`) — same data, hand-editable format:

```
=== DOOR: CODE ===
name: 中文名稱
englishName: English Name
row1_formula: ...
```

Multiple door types are multiple top-level JSON keys, or multiple `=== DOOR:
... ===` blocks separated by a blank line. Either format works — the app
auto-detects which one you used by whether the file starts with `{`.

### Hard constraints (the app validates every one of these before accepting an entry — get them right or the entry is silently skipped)

1. **Code**: 1–4 uppercase letters (`A-Z` only), matching `^[A-Z]{1,4}$`.
   No digits, no punctuation, no lowercase. This isn't a style preference —
   codes are spliced into a `RegExp` used for canvas scanning, and anything
   outside this pattern is rejected specifically to prevent that from
   breaking.
2. **`name`** and **`englishName`**: non-empty strings.
3. **`row1_formula`**: a string in the door module's small formula
   language — segments of `'literal'` or `'literal' * expr` joined by `+`,
   where `expr` is arithmetic over `W` (digits, `W`/`w`, `+ - * /`,
   parentheses only — no `eval`, no other identifiers). Full grammar and
   worked examples are in `DOOR_TEMPLATE_FORMAT.md` at the repo root.
4. **The width invariant is enforced automatically and will reject your
   entry if you get it wrong**: the formula's output must be exactly `W`
   characters at every width the app tests it at (14, 15, 20, 30). Before
   answering, hand-evaluate your formula at `W=14`: sum up every literal
   segment's length plus every tiled segment's `expr` value and confirm the
   total is exactly 14.

   Example of a formula that looks plausible but is wrong: `'▼' + '─' *
   (W-4) + '▼'` — two single-character end caps (`▼`, 1 cell each) only
   account for 2 cells, so the fill segment must be `(W-2)`, not `(W-4)`.
   `(W-4)` is correct only when both end caps are 2 characters each (like
   `'●├' + ... + '┤●'`). This exact mistake was caught by the app's
   validator during development — it is not a hypothetical warning.

### What to output

The complete file content (JSON or text block, your choice), containing
every door type requested. Nothing else — no explanation prose inside the
file, no markdown fences if you're asked to write directly to a file. If a
requested visual can't be expressed in the formula grammar (needs
alternating patterns beyond simple tiling, conditionals, etc.), say so
instead of emitting something that happens to parse but doesn't match the
intended visual.

### After generating

Loading the file through the door panel reports a toast (`loaded N door
type(s): ...`) listing exactly which codes made it in; anything rejected is
logged to the browser console with the specific validation reason (in
Chinese, e.g. `代號「DD」的公式在寬度 14 時輸出了 12 個字元,必須恰好是 14`).
If your file loads 0 or fewer entries than you wrote, that's the tell —
check the console before assuming the file format itself was wrong.

---

## Invocation example

> Write a `custom_doors.json` with three door types for a warehouse project:
> a roller shutter (捲門), a fire door (防火門) with a double-line rail, and
> a revolving door (旋轉門) with alternating cross characters bracketed by
> diamonds. Verify each formula's width by hand at W=14 before outputting.
