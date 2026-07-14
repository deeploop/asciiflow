/**
 * "Run intent" dialog — a debug/ops panel unrelated to diagram drawing:
 * lists IntentActions from a Google Apps Script MCP proxy (via the same
 * JSON-RPC-over-HTTP protocol as the reference run-intent.js/
 * readintentlist.js CLI scripts), lets you pick one, edit its testArgs,
 * and run it, showing the result.
 *
 * The MCP endpoint (which embeds an access key in its query string) has a
 * hardcoded default (store/index.ts's DEFAULT_INTENT_MCP_URL) — this repo
 * auto-deploys to a public GitHub Pages URL on every push, so that key is
 * visible to any visitor and permanently in this repo's git history; it
 * was committed at the user's explicit, repeated request after being
 * warned of exactly that. The endpoint field below still overrides it
 * per-browser via localStorage, same as every other persisted setting.
 */

import { store, useAppStore } from "#asciiflow/client/store";
import { Button, ControlledDialog, TextField } from "#asciiflow/client/ui/components";
import styles from "#asciiflow/client/toolbar.module.css";
import * as React from "react";
import { useEffect, useState } from "react";

interface IntentSummary {
  intentName: string;
  intentDescription?: string;
  testArgs?: string;
}

interface StatusMessage {
  message: string;
  kind?: "ok" | "error";
}

async function callMcpTool(mcpUrl: string, name: string, args: unknown): Promise<any> {
  const res = await fetch(mcpUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: Date.now(),
      method: "tools/call",
      params: { name, arguments: args },
    }),
  });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} ${res.statusText}: ${await res.text()}`);
  }
  const body = await res.json();
  if (body.error) {
    throw new Error(`MCP error ${body.error.code}: ${body.error.message}`);
  }
  return body.result;
}

/** Unwraps the {content:[{text}]} MCP tool-result shape into parsed JSON (or raw text if it isn't JSON). */
function unwrapResult(result: any): any {
  const text = result?.content?.[0]?.text;
  if (text === undefined) {
    return result;
  }
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function IntentRunForm() {
  const mcpUrl = useAppStore((s) => s.intentMcpUrl);
  const [intents, setIntents] = useState<IntentSummary[]>([]);
  const [selected, setSelected] = useState("");
  const [description, setDescription] = useState("");
  const [testArgs, setTestArgs] = useState("");
  const [lastResult, setLastResult] = useState("");
  const [status, setStatus] = useState<StatusMessage | null>(null);
  const [loadingList, setLoadingList] = useState(false);
  const [running, setRunning] = useState(false);

  async function loadIntentList(url: string) {
    setLoadingList(true);
    setStatus({ message: "Loading intent list…" });
    try {
      const result = await callMcpTool(url, "intent_action_list", {});
      const data = unwrapResult(result);
      setIntents(data?.intents ?? []);
      setStatus({ message: `Loaded ${data?.intents?.length ?? 0} intent(s).`, kind: "ok" });
    } catch (e) {
      setStatus({ message: `Failed to load intent list: ${(e as Error).message}`, kind: "error" });
    } finally {
      setLoadingList(false);
    }
  }

  // Auto-load once, on mount, if an endpoint is already saved from a
  // previous session — this component remounts fresh every time the
  // dialog opens (Dialog unmounts its children on close), so this doesn't
  // re-fire while the dialog stays open.
  useEffect(() => {
    if (mcpUrl) {
      loadIntentList(mcpUrl);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function onSelect(intentName: string) {
    setSelected(intentName);
    setDescription("");
    setTestArgs("");
    setLastResult("");
    if (!intentName) {
      return;
    }
    setStatus({ message: `Loading "${intentName}"…` });
    try {
      const result = await callMcpTool(mcpUrl, "intent_action_list", { intentName });
      const data = unwrapResult(result);
      const intent = data?.intent;
      if (!intent) {
        setStatus({ message: `No detail returned for "${intentName}".`, kind: "error" });
        return;
      }
      setDescription(intent.intentDescription ?? "");
      setTestArgs(intent.testArgs ?? "");
      setLastResult(intent.lastResult ?? "");
      setStatus({ message: "Ready.", kind: "ok" });
    } catch (e) {
      setStatus({ message: `Failed to load "${intentName}": ${(e as Error).message}`, kind: "error" });
    }
  }

  async function onRun() {
    if (!selected) {
      return;
    }
    let args: unknown;
    const raw = testArgs.trim();
    if (raw !== "") {
      try {
        args = JSON.parse(raw);
      } catch (e) {
        setStatus({ message: `testArgs is not valid JSON: ${(e as Error).message}`, kind: "error" });
        return;
      }
    }
    setRunning(true);
    setStatus({ message: `Running "${selected}"…` });
    try {
      const params: { intentName: string; args?: unknown } = { intentName: selected };
      if (args !== undefined) {
        params.args = args;
      }
      const result = await callMcpTool(mcpUrl, "intent_action_run", params);
      const data = unwrapResult(result);
      // intent_action_run's payload is {ok, intentName, args, result} — the
      // sheet's lastResult column (and this box, when an intent is first
      // picked) only ever holds the plain `result` value.
      const value = data && typeof data === "object" && "result" in data ? data.result : data;
      setLastResult(typeof value === "string" ? value : JSON.stringify(value, null, 2));
      setStatus(
        result?.isError
          ? { message: `"${selected}" returned an error — see result below.`, kind: "error" }
          : { message: `"${selected}" ran successfully.`, kind: "ok" }
      );
    } catch (e) {
      setLastResult(`Error: ${(e as Error).message}`);
      setStatus({ message: `Failed to run "${selected}": ${(e as Error).message}`, kind: "error" });
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className={styles.drawPanel} style={{ width: "480px", maxWidth: "100%" }}>
      <TextField
        label="MCP endpoint (override saved only in this browser; a default is baked into this build)"
        value={mcpUrl}
        placeholder="https://your-worker.workers.dev/?accessKey=...&channel=mcp"
        autoFocus={!mcpUrl}
        onKeyDown={(e) => e.stopPropagation()}
        onChange={(e) => store.setIntentMcpUrl(e.target.value)}
      />

      <div className={styles.doorRow}>
        <span className={styles.viewLabel}>intent:</span>
        <select
          className={styles.compositeDoorInput}
          style={{ flex: 1, minWidth: 0 }}
          value={selected}
          disabled={!mcpUrl || intents.length === 0}
          onChange={(e) => onSelect(e.target.value)}
        >
          <option value="">
            {!mcpUrl
              ? "enter an MCP endpoint above first"
              : `select an intent… (${intents.length} found)`}
          </option>
          {intents.map((intent) => (
            <option key={intent.intentName} value={intent.intentName}>
              {intent.intentName}
            </option>
          ))}
        </select>
        <Button onClick={() => loadIntentList(mcpUrl)} disabled={!mcpUrl || loadingList}>
          {loadingList ? "loading…" : "reload"}
        </Button>
      </div>
      {description && <div className={styles.drawHint}>{description}</div>}

      <span className={styles.viewLabel}>testArgs (JSON):</span>
      <textarea
        className={styles.compositeDoorTextarea}
        style={{ width: "100%", minHeight: "80px", boxSizing: "border-box" }}
        value={testArgs}
        onKeyDown={(e) => e.stopPropagation()}
        onChange={(e) => setTestArgs(e.target.value)}
      />

      <span className={styles.viewLabel}>lastResult:</span>
      <textarea
        className={styles.compositeDoorTextarea}
        style={{ width: "100%", minHeight: "140px", boxSizing: "border-box" }}
        value={lastResult}
        onKeyDown={(e) => e.stopPropagation()}
        onChange={(e) => setLastResult(e.target.value)}
      />

      <div className={styles.doorRow}>
        <Button variant="primary" onClick={onRun} disabled={!selected || running}>
          {running ? "running…" : "run intent"}
        </Button>
        {status && (
          <span
            style={{
              color:
                status.kind === "error"
                  ? "var(--color-danger)"
                  : status.kind === "ok"
                  ? "var(--color-success)"
                  : undefined,
            }}
          >
            {status.message}
          </span>
        )}
      </div>
    </div>
  );
}

export function IntentRunButton() {
  return (
    <ControlledDialog
      button={
        <button
          className={styles.actionBtn}
          style={{ color: "var(--color-brand)" }}
          title="Run a Google Apps Script IntentAction (unrelated to drawing — a dev/ops utility)"
        >
          [intent]
        </button>
      }
      title="run intent"
    >
      <IntentRunForm />
    </ControlledDialog>
  );
}
