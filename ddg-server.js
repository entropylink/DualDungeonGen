#!/usr/bin/env node
/* ============================================================
   DualDungeonGen — LOCAL BRIDGE
   Serves the studio (dist/) AND exposes POST /generate, which runs
   Claude Code headless (`claude -p`) to turn an image + guidance into
   a DDG dungeon JSON. Personal, localhost-only. No API key needed —
   uses your logged-in Claude Code CLI.

   Run:  node ddg-server.js        then open http://localhost:8824/
   ============================================================ */
"use strict";
const http = require("http");
const fs = require("fs");
const path = require("path");
const os = require("os");
const { spawn, spawnSync } = require("child_process");

const ROOT = __dirname;
const DIST = path.join(ROOT, "dist");
const CONTRACT = path.join(ROOT, "ai", "ddg-generator.md");
const PORT = process.env.DDG_PORT ? Number(process.env.DDG_PORT) : 8824;
const MODEL = process.env.DDG_MODEL || ""; // optional model override
const GEN_TIMEOUT_MS = 360000; // headless generation can take a few minutes, esp. with an image

// ---- locate the claude CLI -------------------------------------------
function findClaude() {
  const probe = spawnSync(process.platform === "win32" ? "claude.cmd" : "claude",
    ["--version"], { shell: true, encoding: "utf8", timeout: 20000 });
  if (probe.status === 0 && /Claude Code/i.test(probe.stdout || "")) return (probe.stdout || "").trim();
  return null;
}
let CLAUDE_VERSION = null;

// ---- static file serving ---------------------------------------------
const MIME = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css",
  ".json": "application/json", ".png": "image/png", ".jpg": "image/jpeg", ".svg": "image/svg+xml", ".ico": "image/x-icon" };
function serveStatic(req, res) {
  let rel = decodeURIComponent(req.url.split("?")[0]);
  if (rel === "/") rel = "/index.html";
  const filePath = path.join(DIST, path.normalize(rel));
  if (!filePath.startsWith(DIST)) { res.writeHead(403); res.end("forbidden"); return; }
  fs.readFile(filePath, (err, buf) => {
    if (err) { res.writeHead(404); res.end("not found"); return; }
    res.writeHead(200, { "Content-Type": MIME[path.extname(filePath)] || "application/octet-stream" });
    res.end(buf);
  });
}

// ---- the generation prompt -------------------------------------------
function buildPrompt(input) {
  let contract = "";
  try { contract = fs.readFileSync(CONTRACT, "utf8"); }
  catch (_) { contract = "Produce a DDG dungeon JSON (format ddg-dungeon)."; }
  return contract + "\n\n---\n\nNow generate for this call.\n\nINPUT:\n" +
    "IMAGE:    " + input.imagePath + "\n" +
    "GUIDANCE: " + input.guidance + "\n" +
    "PARTY:    " + input.size + " PCs, level " + input.level + "\n" +
    "LANG:     en+es\n" +
    "OUTFILE:  " + input.outFile + "\n\n" +
    "Do it now: " + (input.imagePath !== "none"
      ? "Read the image with the Read tool, then trace ONLY the 6–14 major rooms/chambers as normalized poly[] outlines that hug each room's real walls (NEVER individual tiles/corridors — a huge room count is wrong and too slow), "
      : "") +
    "then WRITE the complete dungeon JSON to OUTFILE using the Write tool. The file must be strictly valid JSON. " +
    "After writing, reply with exactly: WROTE " + input.outFile;
}

// ---- run claude headless ---------------------------------------------
function runClaude(jobDir, prompt) {
  return new Promise((resolve) => {
    const args = ["-p", "--output-format", "json",
      "--allowedTools", "Read", "Write",
      "--permission-mode", "bypassPermissions",
      "--max-turns", "24",
      "--add-dir", jobDir];
    if (MODEL) args.push("--model", MODEL);
    const cmd = process.platform === "win32" ? "claude.cmd" : "claude";
    const child = spawn(cmd, args, { cwd: jobDir, shell: true });
    let out = "", err = "";
    const timer = setTimeout(() => {
      try { // shell:true on Windows: kill the whole tree, not just cmd.exe
        if (process.platform === "win32" && child.pid) spawnSync("taskkill", ["/pid", String(child.pid), "/t", "/f"]);
        else child.kill();
      } catch (_) {}
    }, GEN_TIMEOUT_MS);
    child.stdout.on("data", d => out += d);
    child.stderr.on("data", d => err += d);
    child.on("close", code => { clearTimeout(timer); resolve({ code, out, err }); });
    child.on("error", e => { clearTimeout(timer); resolve({ code: -1, out, err: String(e) }); });
    child.stdin.write(prompt);
    child.stdin.end();
  });
}

function shallowValidate(d) {
  if (!d || typeof d !== "object") return "not an object";
  if (!Array.isArray(d.rooms) || !d.rooms.length) return "no rooms";
  for (const r of d.rooms) {
    if (r.id == null) return "room missing id";
    const hasPoly = Array.isArray(r.poly) && r.poly.length >= 3 && r.poly.every(p => Array.isArray(p) && p.length >= 2 && p.every(n => typeof n === "number"));
    const hasImg = r.img && ["x", "y", "w", "h"].every(k => typeof r.img[k] === "number");
    const hasGrid = ["x", "y", "w", "h"].every(k => typeof r[k] === "number");
    if (!hasPoly && !hasImg && !hasGrid) return "room " + r.id + " missing poly[]/img{}/x-y-w-h";
  }
  return null;
}

async function handleGenerate(req, res) {
  if (!CLAUDE_VERSION) { json(res, 503, { error: "Claude Code CLI not found. Install with: npm i -g @anthropic-ai/claude-code, then run `claude` once to log in." }); return; }
  let body = "";
  req.on("data", c => { body += c; if (body.length > 40 * 1024 * 1024) req.destroy(); });
  req.on("end", async () => {
    let input;
    try { input = JSON.parse(body || "{}"); } catch (_) { json(res, 400, { error: "bad request body" }); return; }
    const contentMode = input.mode === "content" && typeof input.prompt === "string" && input.prompt.trim();
    const guidance = (input.guidance || "").toString().slice(0, 4000).trim();
    const size = clampInt(input.party && input.party.size, 1, 12, 4);
    const level = clampInt(input.party && input.party.level, 1, 20, 3);
    if (!contentMode && !guidance && !input.image) { json(res, 400, { error: "Provide guidance text and/or a map image." }); return; }

    const jobDir = fs.mkdtempSync(path.join(os.tmpdir(), "ddg-"));
    const outFile = path.join(jobDir, "dungeon.json");
    let imagePath = "none";
    try {
      let prompt;
      if (contentMode) {
        // content-only: geometry is fixed client-side; the studio built the
        // full prompt (room facts + rules + JSON contract). Just add the
        // file-writing instruction.
        prompt = String(input.prompt).slice(0, 80000) +
          "\n\nWRITE that JSON (strictly valid) to " + outFile +
          " using the Write tool, then reply with exactly: WROTE " + outFile;
        log("generate (content-only):", (input.prompt.match(/"([^"]{0,60})"/) || [])[1] || "");
      } else {
        if (input.image) {
          const m = /^data:(image\/(png|jpe?g|webp|gif));base64,(.*)$/i.exec(input.image);
          if (m) { const ext = m[2].toLowerCase().replace("jpeg", "jpg"); imagePath = path.join(jobDir, "map." + ext);
            fs.writeFileSync(imagePath, Buffer.from(m[3], "base64")); }
        }
        prompt = buildPrompt({ imagePath, guidance: guidance || "(design a fitting dungeon)", size, level, outFile });
        log("generate:", guidance.slice(0, 60) || "(image only)", imagePath !== "none" ? "+image" : "");
      }

      let result = await runClaude(jobDir, prompt);
      let dungeon = readDungeon(outFile, contentMode ? "content" : "map");

      // one repair pass if the file is missing or invalid
      if (!dungeon.ok) {
        log("first pass invalid (" + dungeon.error + "), retrying repair…");
        const repair = "The file " + outFile + " is missing or not valid JSON (error: " + dungeon.error +
          "). Read it if it exists, then WRITE strictly valid JSON matching the requested schema to " + outFile +
          ". Reply WROTE when done.";
        await runClaude(jobDir, repair);
        dungeon = readDungeon(outFile, contentMode ? "content" : "map");
      }

      if (!dungeon.ok) {
        json(res, 502, { error: "Generation failed: " + dungeon.error, cliError: (result.err || "").slice(0, 500), raw: tailResult(result.out) });
        return;
      }
      const nRooms = Array.isArray(dungeon.data.rooms) ? dungeon.data.rooms.length : Object.keys(dungeon.data.rooms || {}).length;
      log("ok:", (dungeon.data.meta && dungeon.data.meta.title && (dungeon.data.meta.title.en || dungeon.data.meta.title)) || "dungeon", "|", nRooms, "rooms");
      json(res, 200, { dungeon: dungeon.data });
    } catch (e) {
      json(res, 500, { error: String(e && e.message || e) });
    } finally {
      try { fs.rmSync(jobDir, { recursive: true, force: true }); } catch (_) {}
    }
  });
}

function readDungeon(outFile, mode) {
  if (!fs.existsSync(outFile)) return { ok: false, error: "no output file written" };
  let txt = fs.readFileSync(outFile, "utf8").trim();
  // tolerate a stray code fence if the model added one
  txt = txt.replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  let data;
  try { data = JSON.parse(txt); } catch (e) { return { ok: false, error: "invalid JSON: " + e.message }; }
  const v = mode === "content" ? validateContent(data) : shallowValidate(data);
  if (v) return { ok: false, error: v };
  return { ok: true, data };
}
// content-only mode: rooms is an OBJECT keyed by id (no geometry)
function validateContent(d) {
  if (!d || typeof d !== "object") return "not an object";
  if (!d.rooms || Array.isArray(d.rooms) || typeof d.rooms !== "object") return "rooms must be an object keyed by room id";
  if (!Object.keys(d.rooms).length) return "no rooms";
  if (!d.meta || !d.overview) return "missing meta/overview";
  return null;
}
function tailResult(out) {
  try { const j = JSON.parse((out || "").trim().split("\n").pop()); return (j.result || "").slice(0, 400); }
  catch (_) { return (out || "").slice(-400); }
}

// ---- helpers ----------------------------------------------------------
function json(res, code, obj) { const b = JSON.stringify(obj); res.writeHead(code, { "Content-Type": "application/json" }); res.end(b); }
function clampInt(v, lo, hi, d) { v = parseInt(v, 10); return isFinite(v) ? Math.max(lo, Math.min(hi, v)) : d; }
function log() { console.log("[ddg]", ...arguments); }

// ---- localhost-only guard ---------------------------------------------
// The bridge runs the user's own Claude Code with no auth, so it MUST only
// be reachable from this machine's browser. Two gates on top of the
// loopback bind: reject a non-localhost Host header (blocks DNS-rebinding,
// where a public hostname resolves to 127.0.0.1) and reject a cross-site
// Origin (blocks a random website from POSTing to localhost:8824). CORS is
// echoed back only for localhost origins, never "*".
function isLocalHostname(h) {
  if (!h) return false;
  h = h.replace(/:\d+$/, "").replace(/^\[|\]$/g, "").toLowerCase();
  return h === "localhost" || h === "127.0.0.1" || h === "::1" || h === "0.0.0.0";
}
function originAllowed(origin) {
  if (!origin) return true;                 // no Origin = same-origin / curl / direct nav
  try { return isLocalHostname(new URL(origin).hostname); } catch (e) { return false; }
}

function handler(req, res) {
  if (!isLocalHostname(req.headers.host)) { res.writeHead(403); res.end("forbidden host"); return; }
  const origin = req.headers.origin;
  if (origin) {
    if (!originAllowed(origin)) { res.writeHead(403); res.end("forbidden origin"); return; }
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
  }
  if (req.method === "OPTIONS") { res.writeHead(204, { "Access-Control-Allow-Headers": "Content-Type", "Access-Control-Allow-Methods": "GET,POST,OPTIONS" }); res.end(); return; }
  const url = req.url.split("?")[0];
  if (url === "/health") { json(res, 200, { ok: true, claude: !!CLAUDE_VERSION, version: CLAUDE_VERSION, model: MODEL || "default" }); return; }
  if (url === "/generate" && req.method === "POST") { handleGenerate(req, res); return; }
  serveStatic(req, res);
}

// ---- server (loopback only: 127.0.0.1 + ::1, never a public interface) --
CLAUDE_VERSION = findClaude();
let listening = 0;
["127.0.0.1", "::1"].forEach((host) => {
  const s = http.createServer(handler);
  s.on("error", (e) => { if (e.code !== "EADDRINUSE" && e.code !== "EADDRNOTAVAIL") console.warn("  listen " + host + ": " + e.message); });
  s.listen(PORT, host, () => { if (!listening++) banner(); });
});
function banner() {
  console.log("\n  DualDungeonGen bridge running (loopback only):  http://localhost:" + PORT + "/");
  console.log("  Claude Code CLI: " + (CLAUDE_VERSION ? "OK (" + CLAUDE_VERSION + ")" : "NOT FOUND — AI generation disabled"));
  console.log("  Serving studio from: " + DIST + "\n");
}
