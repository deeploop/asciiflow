# AI Prompt: Adding a Menu-Integrated Door Type (post single-source-of-truth fix)

Use this instead of asking an AI to "wire up the door menu" — that work is done.
This prompt is for the one thing that's still genuinely a task: writing a
correct `door_registry.ts` entry, including the formula. Paste as-is, then
describe the door type you want at the end.

---

## PROMPT (copy from here)

You're adding a new door type to ASCIIFlow's door module. As of the current
codebase, **`client/door_registry.ts` is the single source of truth** — the
toolbar menu, the `DoorTypeCode` TypeScript type, canvas-scanning regexes, and
Excel import/export all derive from it automatically. Do not touch
`client/toolbar.tsx`, `client/store/index.ts`, or the regex constants near the
top of `client/doors.ts` (`DOOR_LABEL_REGEX`, `TYPE_FIELD`, `LABEL_FIELD`) —
they already read `DOOR_TYPE_CODES`/`DoorTypeCode`, which are derived from the
registry via `keyof typeof DOOR_REGISTRY`. Touching those files for a new
door type is very likely wrong and means you've misunderstood the task.

Your entire deliverable is one object literal to add to `DOOR_REGISTRY` in
`client/door_registry.ts`:

```typescript
export interface DoorConfig {
  name: string;          // Chinese name
  englishName: string;
  row1_formula: string;  // see grammar below
}
```

### The `row1_formula` grammar (strict — do not deviate)

- A sequence of `'literal'` or `'literal' * expr` segments joined by `+`.
- `expr` is arithmetic over `W` (the symbol's width in cells): only digits,
  `W`/`w`, `+ - * /`, and parentheses — nothing else. It is parsed by a
  hand-written tokenizer + recursive-descent evaluator, not `eval()`.
- `'pattern' * expr` tiles `pattern` (repeats and truncates) to exactly
  `floor(expr)` characters.
- **The whole formula must evaluate to exactly `W` characters for every `W`
  the app will ever pass it.** `W` is never below 14, and grows by 1 per
  extra digit in the door's sequence number (14 covers doors #1–99).
  Verify by hand at `W=14` and `W=20`.
- No escape sequence for a quote character inside a pattern. Backslashes
  need the normal TypeScript string escape (one `\` in the formula language
  is written `\\` in the TS source).

Reference examples already in the registry:

```typescript
SD: { row1_formula: "'●' + '─' * (W-2) + '●'" }   // ●────────●
FD: { row1_formula: "'/\\' * W" }                  // /\/\/\/\/\
```

Full grammar/parser details, error messages, and a worked SOP are in
`DOOR_TEMPLATE_FORMAT.md` at the repo root — read it if the formula you need
is more complex than a couple of end-caps plus one tiled middle segment.

### What to output

Just the new `DOOR_REGISTRY` entry (a 2-letter uppercase key, matching the
existing style), plus a one-line hand-worked width check at `W=14` and `W=20`.
Nothing else needs to change. If asked, you may also propose a name for a
`Kbd` shortcut hint, but the numeric 1–6(–N) shortcuts in the door tool
already index into the registry positionally, so no shortcut code changes
are needed either.

### Verifying it worked

After adding the entry: `bazel build client:bundle` (or the dev server) should
compile with no changes needed anywhere else. The toolbar's door panel gets a
new button (`{code} {name}`) automatically, wrapping onto a new line if the
row is full — no layout code to touch. Clicking it and stamping the canvas
should show the new code with an auto-incrementing number (e.g. `DD01-IL`).

---

## Invocation example

> Add a door type `RD` — 旋轉門 (Revolving Door), English "Revolving Door" —
> visual: a rail of alternating `╬` cross characters bracketed by `◇`
> diamonds at both ends.
