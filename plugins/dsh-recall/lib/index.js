/**
 * dsh-recall — host half.
 *
 * Serves one drawer's data to the web UI over the composition's web server:
 * the markdown notebook and full-text search across stored sessions. The
 * renderer cannot read disk, so these HTTP routes are the data channel.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { decodeAll } from "./zstd.js";

const DEFAULT_NOTES_PATH = path.join(os.homedir(), "dsh-notes.md");
const API_PATH = "/notes/api";
const OPEN_PATH = "/notes/open";
const LOG_PATH = "/notes/log";
const SEARCH_PATH = "/notes/search";
const CONTEXT_PATH = "/notes/context";
let logFile = "";

/** Session transcripts, decoded once per (mtime, size). */
const sessionCache = new Map();

function sessionsRoot() {
  return path.join(os.homedir(), ".dsh", "sessions");
}

function listSessionFiles(root) {
  const files = [];
  const walk = (dir) => {
    let entries = [];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (/\.zstd$/i.test(entry.name)) files.push(full);
    }
  };
  walk(root);
  return files;
}

function loadSessionEvents(file) {
  const stat = fs.statSync(file);
  const cached = sessionCache.get(file);
  if (cached && cached.mtimeMs === stat.mtimeMs && cached.size === stat.size) return cached.events;

  const events = [];
  const text = decodeAll(fs.readFileSync(file));
  for (const line of text.split("\n")) {
    if (!line.trim()) continue;
    try {
      events.push(JSON.parse(line));
    } catch {
      /* skip malformed record */
    }
  }
  sessionCache.set(file, { mtimeMs: stat.mtimeMs, size: stat.size, events });
  return events;
}

function clip(text, at, length) {
  const start = Math.max(0, at - 70);
  const end = Math.min(text.length, at + length + 70);
  return `${start > 0 ? "…" : ""}${text.slice(start, end).replace(/\s+/g, " ").trim()}${end < text.length ? "…" : ""}`;
}

/**
 * Text worth searching inside one event.
 *
 * Only real conversation is indexed: user prompts and assistant replies. System
 * prompts, skill catalogs, request context and tool payloads are deliberately
 * excluded — they drown out the conversation.
 */
function conversationalText(event) {
  const type = event?.type;
  if (type === "user/message") {
    // Only genuine user input counts. The harness also records injected
    // messages as user/message (runtime-context, skill-catalog,
    // agent-instructions, user-approval, time-context, ...), distinguished by
    // data.source.kind; indexing those made machine text look like the user's.
    const kind = event?.data?.source?.kind;
    if (kind !== undefined && kind !== "user") return "";
    const content = event?.data?.content;
    if (!Array.isArray(content)) return "";
    return content
      .filter((part) => part?.type === "text" && typeof part.text === "string")
      .map((part) => part.text)
      .join("\n");
  }
  if (type === "assistant/message") {
    const content = event?.data?.message?.content;
    if (!Array.isArray(content)) return "";
    return content
      .filter((part) => part?.type === "text" && typeof part.text === "string")
      .map((part) => part.text)
      .join("\n");
  }
  return "";
}

/** Full-text search across every stored session transcript. */
function searchSessions(query, limit, role = "all") {
  const needle = query.toLowerCase();
  const files = listSessionFiles(sessionsRoot());
  const results = [];
  let hits = 0;
  let scanned = 0;

  for (const file of files) {
    let events;
    try {
      events = loadSessionEvents(file);
    } catch {
      continue;
    }
    const header = events.find((event) => event?.type === "session") ?? {};
    // Subagent transcripts are machine-to-machine: their "user" turns are
    // prompts an agent wrote, not something the person typed. Skip them.
    if (Number(header.delegationDepth ?? 0) > 0) continue;
    const cwd = String(header.cwd ?? "");
    const id = String(header.id ?? path.basename(path.dirname(file)));
    scanned += 1;
    let foundHere = 0;

    for (const event of events) {
      if (foundHere >= 5) break;
      const eventRole = event.type === "user/message" ? "user" : "assistant";
      if (role !== "all" && role !== eventRole) continue;
      const text = conversationalText(event);
      if (!text) continue;
      const at = text.toLowerCase().indexOf(needle);
      if (at < 0) continue;
      hits += 1;
      foundHere += 1;
      results.push({
        session: id,
        cwd,
        time: event?.time ? new Date(Number(event.time)).toISOString() : "",
        seq: Number(event?.seq ?? 0),
        role: eventRole,
        snippet: clip(text, at, needle.length),
        text: text.length > 4000 ? `${text.slice(0, 4000)}…` : text,
      });
    }
  }

  results.sort((a, b) => String(b.time).localeCompare(String(a.time)));
  return { query, scanned, hits, truncated: hits > limit, results: results.slice(0, limit) };
}

/** Append a diagnostic line; never throws. */
function log(message) {
  if (!logFile) return;
  try {
    fs.appendFileSync(logFile, `${new Date().toISOString()} ${message}\n`);
  } catch {
    /* diagnostics only */
  }
}

log("module loaded");

export const name = "recall-host";

/** Locate the transcript file for one session id. */
function findSessionFile(sessionId) {
  const found = listSessionFiles(sessionsRoot());
  for (const file of found) {
    if (path.basename(path.dirname(file)) === sessionId) return file;
  }
  return "";
}

/**
 * Messages around one event: a few user/assistant turns before and after the
 * hit, so a search result can be read in context without leaving the drawer.
 */
function contextAround(sessionId, seq, around) {
  const file = findSessionFile(sessionId);
  if (!file) return { error: "session not found" };
  const events = loadSessionEvents(file);
  const index = events.findIndex((event) => Number(event?.seq) === seq);
  if (index < 0) return { error: "event not found" };

  const messages = [];
  for (const event of events) {
    const text = conversationalText(event);
    if (!text) continue;
    messages.push({
      seq: Number(event?.seq ?? 0),
      time: event?.time ? new Date(Number(event.time)).toISOString() : "",
      role: event.type === "user/message" ? "user" : "assistant",
      text: text.length > 4000 ? `${text.slice(0, 4000)}…` : text,
    });
  }

  const at = messages.findIndex((message) => message.seq === seq);
  const start = Math.max(0, at - around);
  const end = Math.min(messages.length, at + around + 1);
  return {
    session: sessionId,
    hitSeq: seq,
    messages: messages.slice(start, end).map((message) => ({ ...message, hit: message.seq === seq })),
  };
}

/** Parse `## category` / `### title <!-- date -->` blocks into a list. */
function parseNotes(text) {
  const categories = [];
  let category = null;
  let entry = null;
  const pushEntry = () => {
    if (category && entry) {
      entry.body = entry.lines.join("\n").trim();
      delete entry.lines;
      category.entries.push(entry);
    }
    entry = null;
  };

  for (const line of text.split(/\r?\n/)) {
    const h2 = /^##\s+(.+?)\s*$/.exec(line);
    const h3 = /^###\s+(.+?)\s*$/.exec(line);
    if (h2) {
      pushEntry();
      category = { name: h2[1], entries: [] };
      categories.push(category);
      continue;
    }
    if (h3) {
      pushEntry();
      if (!category) {
        category = { name: "其它", entries: [] };
        categories.push(category);
      }
      const raw = h3[1];
      const dateMatch = /<!--\s*(.*?)\s*-->/.exec(raw);
      entry = {
        title: raw.replace(/<!--\s*.*?\s*-->/, "").trim(),
        date: dateMatch ? dateMatch[1] : "",
        lines: [],
      };
      continue;
    }
    if (entry) entry.lines.push(line);
  }
  pushEntry();
  return categories;
}

function sendJson(res, status, value) {
  const body = JSON.stringify(value);
  res.statusCode = status;
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.setHeader("cache-control", "no-store");
  res.end(body);
}

export function apply(ctx, config) {
  const notesPath = config?.notesPath ?? DEFAULT_NOTES_PATH;
  // Diagnostics sit next to the notes file unless a logPath is configured.
  logFile = config?.logPath ?? path.join(path.dirname(notesPath), "dsh-recall-host.log");
  log(`apply called notesPath=${notesPath}`);

  ctx.inject(["webServer"], (webCtx) => {
    log("webServer service available; registering route");
    webCtx.effect(
      () =>
        webCtx.webServer.register({
          kind: "exact",
          path: API_PATH,
          handler: (req, res) => {
            if (req.method !== "GET") {
              sendJson(res, 405, { error: "method not allowed" });
              return;
            }
            try {
              if (!fs.existsSync(notesPath)) {
                sendJson(res, 200, { path: notesPath, exists: false, categories: [] });
                return;
              }
              const text = fs.readFileSync(notesPath, "utf8");
              sendJson(res, 200, {
                path: notesPath,
                exists: true,
                updatedAt: fs.statSync(notesPath).mtime.toISOString(),
                categories: parseNotes(text),
              });
            } catch (error) {
              sendJson(res, 500, { error: error instanceof Error ? error.message : String(error) });
            }
          },
        }),
      `notes: GET ${API_PATH}`,
    );
    log(`route registered ${API_PATH}`);

    // Open the notes file with the OS default editor.
    webCtx.effect(
      () =>
        webCtx.webServer.register({
          kind: "exact",
          path: OPEN_PATH,
          handler: (req, res) => {
            if (req.method !== "POST") {
              sendJson(res, 405, { error: "method not allowed" });
              return;
            }
            try {
              if (!fs.existsSync(notesPath)) {
                sendJson(res, 404, { error: `notes file not found: ${notesPath}` });
                return;
              }
              // `start` goes through ShellExecute, so the file opens in its
              // associated editor instead of showing its folder.
              const child = spawn("cmd.exe", ["/c", `start "" "${notesPath}"`], {
                detached: true,
                stdio: "ignore",
                windowsVerbatimArguments: true,
              });
              child.unref();
              log(`open requested ${notesPath}`);
              sendJson(res, 200, { ok: true, path: notesPath });
            } catch (error) {
              sendJson(res, 500, { error: error instanceof Error ? error.message : String(error) });
            }
          },
        }),
      `notes: POST ${OPEN_PATH}`,
    );
    log(`route registered ${OPEN_PATH}`);

    // Renderer diagnostics: the web UI posts short messages here so they land
    // in host.log (the browser console is not visible to the operator).
    // Global search across every stored session transcript.
    webCtx.effect(
      () =>
        webCtx.webServer.register({
          kind: "exact",
          path: SEARCH_PATH,
          handler: (req, res) => {
            if (req.method !== "GET") {
              sendJson(res, 405, { error: "method not allowed" });
              return;
            }
            try {
              const url = new URL(String(req.url ?? "/"), "http://localhost");
              const query = (url.searchParams.get("q") ?? "").trim();
              const limit = Math.max(1, Math.min(50, Number(url.searchParams.get("limit") ?? 20) || 20));
              const roleParam = url.searchParams.get("role") ?? "all";
              const role = roleParam === "user" || roleParam === "assistant" ? roleParam : "all";
              if (!query) {
                sendJson(res, 400, { error: "missing q" });
                return;
              }
              sendJson(res, 200, searchSessions(query, limit, role));
            } catch (error) {
              sendJson(res, 500, { error: error instanceof Error ? error.message : String(error) });
            }
          },
        }),
      `notes: GET ${SEARCH_PATH}`,
    );

    // Surrounding messages for one search hit.
    webCtx.effect(
      () =>
        webCtx.webServer.register({
          kind: "exact",
          path: CONTEXT_PATH,
          handler: (req, res) => {
            if (req.method !== "GET") {
              sendJson(res, 405, { error: "method not allowed" });
              return;
            }
            try {
              const url = new URL(String(req.url ?? "/"), "http://localhost");
              const session = (url.searchParams.get("session") ?? "").trim();
              const seq = Number(url.searchParams.get("seq") ?? 0);
              const around = Math.max(1, Math.min(10, Number(url.searchParams.get("around") ?? 3) || 3));
              if (!session || !Number.isFinite(seq)) {
                sendJson(res, 400, { error: "missing session or seq" });
                return;
              }
              const result = contextAround(session, seq, around);
              sendJson(res, result.error ? 404 : 200, result);
            } catch (error) {
              sendJson(res, 500, { error: error instanceof Error ? error.message : String(error) });
            }
          },
        }),
      `notes: GET ${CONTEXT_PATH}`,
    );

    webCtx.effect(
      () =>
        webCtx.webServer.register({
          kind: "exact",
          path: LOG_PATH,
          handler: (req, res) => {
            if (req.method !== "POST") {
              sendJson(res, 405, { error: "method not allowed" });
              return;
            }
            let raw = "";
            req.on("data", (chunk) => {
              raw += chunk;
              if (raw.length > 8192) raw = raw.slice(0, 8192);
            });
            req.on("end", () => {
              try {
                const body = JSON.parse(raw || "{}");
                log(`[client] ${String(body.message ?? "").slice(0, 2000)}`);
                sendJson(res, 200, { ok: true });
              } catch (error) {
                sendJson(res, 400, { error: error instanceof Error ? error.message : String(error) });
              }
            });
          },
        }),
      `notes: POST ${LOG_PATH}`,
    );
  });
}

export default apply;
