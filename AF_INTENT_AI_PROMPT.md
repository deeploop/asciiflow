# AI Prompt: Creating a New `AF_`-Prefixed IntentAction for ASCIIFlow's Run-Intent Dialog

Reusable prompt for an AI (or a human contributor) to correctly author a new
IntentAction that works cleanly with ASCIIFlow's `[intent]` toolbar dialog
(`client/intent_run.tsx`). Paste the block below to an AI agent that has the
`intent_action_create` MCP tool available, then append your actual task
request at the end (see "Invocation example").

This exists because the dialog only shows intents named `AF_...` and only
ever sends/displays **plain multi-line text**, never JSON — an intent whose
code expects a different args shape, or returns something that doesn't
unpack cleanly, will still run, but will show up ugly (raw JSON dumped into
the box) or simply won't receive the text the user typed. The prompt below
gives the model the exact contract needed to get this right on the first try.

---

## PROMPT (copy from here)

You are creating a new IntentAction for a Google Apps Script backend, meant
to be run from ASCIIFlow's "run intent" dialog (a small ops panel unrelated
to ASCIIFlow's diagram drawing — it just borrows the app's UI to call
Google Apps Script functions via an MCP proxy). That dialog has three
specific requirements your intent must satisfy:

### 1. Name it with an `AF_` prefix

The dialog's intent list is filtered to only show names starting with
`AF_` (`client/intent_run.tsx`'s `INTENT_NAME_PREFIX`). Name the intent
`AF_yourIntentName` — camelCase after the prefix, matching the existing
naming style (e.g. `AF_generateQuote`, `AF_parseAddress`).

### 2. Input contract: your function receives `{ raw: string }`

The dialog's "testArgs" box is plain multi-line text, not JSON — the user
never types `{...}`. When they click Run, whatever they typed is wrapped
automatically as `{"raw": "<exact text, real newlines preserved>"}` and
passed as `args` to your function. So:

```javascript
(args) => {
  const text = args.raw ?? "";      // the exact plain text the user typed
  const lines = text.split("\n");   // if you need it as separate lines
  // ...
}
```

Do **not** design your function to expect `args.a`, `args.b`, or any other
top-level field — only `args.raw` will ever be populated by this dialog.
(If this intent also needs to be callable with structured args from
somewhere else — RiveScript, another IntentAction — that's fine, just make
sure the `args.raw` path is the one this dialog's input maps to.)

### 3. Output contract: return one of these shapes, not an arbitrary object

Whatever your function returns becomes `result`, and the dialog auto-
"unpacks" it into the lastResult box as plain text using these rules, in
order:

| You return | Shown in lastResult as |
|---|---|
| a plain string | that string, unchanged |
| `{ raw: "a string" }` | the string |
| `{ raw: ["line1", "line2", ...] }` | `"line1\nline2\n..."` (array joined with `\n`) |
| a bare array `["line1", "line2"]` | `"line1\nline2"` (same join) |
| `null` / `undefined` | empty string |
| anything else (a plain object, nested structure) | pretty-printed JSON — works, but reads as JSON, not clean text |

If you want the result to read as clean, human-readable multi-line text
(the whole point of this dialog), return `{ raw: "..." }` with your output
already formatted as a single string with `\n` between lines — do not
return a plain object with multiple named fields unless JSON-formatted
output is actually what you want the user to see.

### 4. testArgs: give it a realistic default, in the same `{ raw: ... }` shape

Pass `testArgs` as a JSON **string** matching the input contract above, e.g.
`'{"raw":"example input line 1\\nexample input line 2"}'`. This is what
pre-fills the testArgs box (already unpacked to plain text) when the user
picks your intent from the dropdown — pick an example that demonstrates
the intent's actual behavior, not just `{}`.

### Full example

```javascript
// intentName: "AF_upperCaseLines"
// intentDescription: "Uppercases each line of the input text"
// testArgs: '{"raw":"hello\\nworld"}'
(args) => {
  const lines = (args.raw ?? "").split("\n");
  return { raw: lines.map((l) => l.toUpperCase()).join("\n") };
}
```

Typing `hello` / `world` (two lines) into the dialog's testArgs box and
running this intent shows `HELLO` / `WORLD` in lastResult — clean text in,
clean text out, no JSON visible to the user at any point.

### Creating it

Call `intent_action_create` with `intentName`, `intentCode` (the full arrow
function as a string, matching the contract above), `intentDescription`,
and `testArgs` (a JSON string in the `{"raw": ...}` shape). Then verify with
`intent_action_run` using a `{"raw": "..."}` args object before telling the
user it's ready — an intent that throws or returns the wrong shape is easy
to catch this way before it ever reaches the dialog.

---

## Invocation example

> [paste the PROMPT block above], then:
>
> Create a new AF_ intent called `AF_wordCount` that takes multi-line text
> and returns, for each line, the line number and its word count — one
> result line per input line, e.g. input line 3 with 5 words becomes
> `"3: 5 words"`.
