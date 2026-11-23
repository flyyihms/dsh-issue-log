/**
 * dsh-notes — host half.
 *
 * Serves the notes file to the web UI over the composition's web server.
 * The renderer cannot read disk, so these routes are the data channel.
 *
 * Routes:
 *   GET  /notes/api   -> parsed categories/entries
 *   POST /notes/open  -> open the markdown file in its default app
 *   POST /notes/log   -> renderer diagnostics into host.log
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";

const DEFAULT_NOTES_PATH = path.join(os.homedir(), "dsh-notes.md");
const API_PATH = "/notes/api";
const OPEN_PATH = "/notes/open";
const LOG_PATH = "/notes/log";

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
  const logPath = config?.logPath ?? path.join(path.dirname(notesPath), "host.log");

  const log = (message) => {
    try {
      fs.appendFileSync(logPath, `${new Date().toISOString()} ${message}\n`);
    } catch {
      /* diagnostics only */
    }
  };

  log(`apply called notesPath=${notesPath}`);

  ctx.inject(["webServer"], (webCtx) => {
    log("webServer service available; registering routes");

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

    // Renderer diagnostics: the web UI posts short messages here so they land
    // in the host log (the browser console is not visible to the operator).
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
