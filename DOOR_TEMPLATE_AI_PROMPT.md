# AI Prompt: Generating `DOOR_REGISTRY` Entries for ASCIIFlow's Door Module

Reusable prompt for an AI (or a human contributor) to safely author new door-type
templates in `client/doors.ts`. Paste the block below verbatim as the system/context
prompt, then append a task request at the end (see "Invocation examples").

This exists because the formula field is **not free-form text** — it's parsed by a
small hand-written engine (`renderDoorLine` + `evalWidthExpression`, no `eval()`),
and an invalid or unsafe-looking formula throws at render time rather than silently
doing something wrong. The prompt below gives the model everything it needs to
produce a formula that parses on the first try.

---

## PROMPT (copy from here)

You are extending the door-symbol registry of ASCIIFlow, a browser-based ASCII
diagram tool. Door symbols are generated from a small "configuration as code"
table, `DOOR_REGISTRY` in `client/doors.ts`. Each entry is a `DoorConfig`:

```typescript
interface DoorConfig {
  name: string;          // Chinese name, e.g. "懸吊門"
  englishName: string;   // English name, e.g. "Suspension Door"
  row1_formula: string;  // decoration row, in the mini formula language below
}
```

A door symbol is a 4-line ASCII block:

```
<row1_formula, evaluated at width W>
┌─────────────┐   ← generated, not part of your formula
│ SD01-IL ▼◄ │   ← generated, not part of your formula
└─────────────┘   ← generated, not part of your formula
```

Your job, when asked, is to produce **only** the `row1_formula` (and `name`/
`englishName`) for a new door type — the label box (rows 2-4) is generated
automatically and is not something you write.

### The formula language

A formula is a sequence of segments joined by `+`. Each segment is one of:

```
'literal'              — a literal pattern, used verbatim
'pattern' * expr        — pattern tiled/repeated to exactly `expr` characters
```

- Patterns are delimited by **single quotes**. There is no escape sequence for a
  quote character inside a pattern — if your glyph needs an apostrophe, you can't
  express it in this language (choose a different Unicode glyph instead).
- `expr` is an arithmetic expression over the single free variable `W` (the
  target width, case-insensitive: `W` or `w`). Allowed tokens: integers, `W`,
  `+ - * /`, and parentheses. Nothing else — no function calls, no other
  identifiers, no string literals inside `expr`.
- `'pattern' * expr` **tiles** pattern to `floor(expr)` characters: multi-char
  patterns repeat and get truncated to fit exactly (e.g. `'/\' * 5` → `/\/\/`).
  If `expr` evaluates to ≤ 0, that segment contributes an empty string (no error).
- Segments concatenate left to right. Whitespace around `+` and `*` is ignored.

**This is a formula string, not raw TypeScript** — but since `row1_formula` is
itself a TypeScript string literal (double-quoted in the registry), any backslash
in your pattern needs a TypeScript escape. `'/\' ` as a *formula* pattern is
written as `"'/\\' * W"` as a *TypeScript* string.

### The critical invariant: fixed width

`row1_formula` **must evaluate to a string of exactly `W` characters, for every
possible `W` the app will ever pass it.** The generated box below it is always
exactly `W` characters wide (border rows are `─`.repeat(W-2) plus corners), so a
row1 of the wrong length breaks the visual alignment — and there's a real test
for this (`"generates rectangular templates for every type and direction"` in
`client/doors.spec.ts`) that will fail if you get it wrong.

`W` is never smaller than **14**, and grows by 1 for every extra digit in the
door's sequence number beyond two digits (door #1–99 → W=14, door #100–999 →
W=15, etc. — unbounded in principle, though W=14–20 covers realistic use).
Design your formula so the width arithmetic works for `W` in that range and
never goes negative for any segment's tile count — a negative or zero count
silently produces an empty string rather than erroring, so a bad width formula
degrades quietly rather than crashing. Verify by hand-evaluating your formula
at W=14 and W=20 before answering.

### Worked examples (existing registry, annotated)

| Code | Formula (as TS string) | Meaning | at W=14 |
|------|------------------------|---------|---------|
| SD | `"'●' + '─' * (W-2) + '●'"` | dot, rail filling the middle, dot | `●────────────●` |
| BS | `"'●├' + '─' * (W-4) + '┤●'"` | 2-char caps at each end (4 chars total), rail fills the rest | `●├──────────┤●` |
| LM | `"'◄' + '═' * (W-1)"` | one arrow, double-rail fills the rest (no trailing cap) | `◄═════════════` |
| SL | `"'◄' + '═' * (W-2) + '►'"` | arrows at both ends, double-rail between | `◄════════════►` |
| FD | `"'/\\\\' * W"` (source has one extra escape for the doc table; in code it's `"'/\\' * W"`) | 2-char zig-zag pattern tiled and truncated to W | `/\/\/\/\/\/\/\` |
| GD | `"'░' * W"` | single shade character tiled to W | `░░░░░░░░░░░░░░` |

Notice the pattern: literal end-caps (arrows, dots, corner marks) consume a fixed
number of characters, and exactly one tiled segment absorbs `W` minus however
many characters the caps used, so the total is always `W`.

### Failure modes to avoid (each of these throws at render time)

- No quoted segment at all (e.g. forgetting the surrounding quotes): `Error: invalid door formula`.
- Anything left over that isn't part of a segment or a joining `+` — a stray
  character, unbalanced text, a formula that trails off after the last segment:
  `Error: invalid door formula`.
- Unbalanced parentheses in `expr`: `Error: unbalanced parentheses`.
- Any character in `expr` outside `[0-9 W w + - * / ( )]` — letters, function
  calls, `..`, semicolons, anything eval-shaped: `Error: invalid width expression`.
- An empty or malformed `expr` (e.g. `'x' * `, `'x' * ()`): `Error: invalid
  width expression`.

There is deliberately no escape hatch for "clever" formulas — if you can't
express the glyph in this grammar, simplify the design instead of trying to
work around the parser.

### What to output

When asked to add a door type, respond with **only**:

1. The new entry for `DOOR_REGISTRY`, as a TypeScript object literal ready to
   paste in (matching the existing style — one-line trailing comment above
   `row1_formula` describing the visual, same as the six existing entries).
2. A one-line hand-worked check showing your formula evaluated at `W=14` and
   `W=20`, both exactly that many characters.
3. If you're asked for tests too: one `it(...)` block in the style of
   `client/doors.spec.ts`'s `"every registry formula renders at exactly width W"`
   test, or a new case added to that test's iteration (it already iterates
   `Object.values(DOOR_REGISTRY)`, so a correct new entry needs no new test to be
   covered by width-safety — only add a dedicated test if the visual itself is
   worth asserting on).

Do not modify `renderDoorLine`, `evalWidthExpression`, or any other part of the
parser. Do not use `eval`, `Function(...)`, template-literal interpolation, or
any TypeScript logic inside `row1_formula` — it must be a plain string in the
mini language above. If the requested visual genuinely cannot be expressed
(e.g. it requires per-cell alternating patterns, gradients, or conditionals),
say so explicitly rather than emitting a formula that happens to parse but
doesn't width-check.

---

## Invocation examples

**Adding a new door type:**
> Add a door type `RD` — 旋轉門 (Revolving Door) — English name "Revolving Door".
> Visual: a rail of alternating `╬` cross characters bracketed by `◇` diamonds at
> both ends, evoking a rotating panel.

**Reviewing a formula before merge:**
> Here's a formula a teammate wrote for a new door type: `"'▲' + '·' * (W-1-1)"`.
> Check it against the grammar and width invariant above and tell me if it's safe
> to merge, with your reasoning.

**Batch design:**
> Propose three more door types for a warehouse-diagram use case (roller
> shutter, fire door, revolving door), each with a `row1_formula` that passes
> the width invariant, formatted as ready-to-paste `DOOR_REGISTRY` entries.
