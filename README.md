# Entropy · Dungeon Suite (Cartógrafo + DualDungeonGen)

A **two-tab static web app** for the Entropy site:

1. **Cartógrafo de Mazmorras** (`dungeon-maker/mazmorra.html`) — the main app: a
   Dungeon-Scrawl-style map maker/generator (11 tools, random generator, PNG/SVG/
   PDF/JSON export). Fully responsive: on phone/iPad the tool rail becomes a bottom
   bar, the header swipes, and the canvas supports **pinch-zoom + two-finger pan**.
2. **DualDungeonGen Studio** — receives the map and produces the **dual DM / Player
   interactive view** with bilingual (EN/ES) notes per room.

**The button that ties them together:** «▶ Estudio» in the Cartógrafo sends the map
to the studio tab. The studio gets the **exact map** — the very PNG the Cartógrafo
renders — plus its raw data (cells/walls/doors), from which it detects every room
**deterministically** (flood-fill cut by walls and doors → exact polygon outlines,
aligned 1:1 with the PNG). No AI vision, no approximation. You then describe the
environment ("una mina enana tomada por kobolds, dificultad media…") and the AI
writes ONLY the content: names, player read-aloud, DM tactics, monsters scaled to
the party, traps, loot, notes and encounter budget — merged room by room. Click any
room on either map for its player/DM notes.

## AI: who pays, who runs it

- **Claude Code (local bridge)** — `node ddg-server.js` + a logged-in Claude Code
  CLI on *your own machine*. The web page probes `localhost:8824`; on the public
  site that's unreachable, so **the site can never use the owner's Claude Code** —
  only someone running the bridge themselves gets this path.
- **BYOK (bring your own key)** — Anthropic / OpenAI / Gemini. The visitor pastes
  their own API key in the AI panel; it's stored **only in that browser's
  localStorage** and every call goes **directly browser → provider**. No server of
  ours ever sees, stores or proxies a key, so there is nothing shared to abuse:
  each user spends only their own key from their own browser.

## The deliverable

**`dist/`** — upload the folder to the site: `index.html` (tab shell),
`cartografo.html` (app 1), `dungeon-studio.html` (app 2). All static; the only
external dependency is Google Fonts. `node build.js` regenerates all three.

Everything under `src/` + `dungeon-maker/` is the maintainable source.

## What it does

- **Generate** — pick theme (Crafters' Guild / Undead Crypt / Beast Warren / Cult
  Sanctum), party size & level, room count, climax difficulty, and a seed. One click
  builds a full dungeon: hub-and-arms layout with guaranteed-straight corridors, a
  secret room, SRD monsters scaled to your party's 5e XP budget, traps, loot, and
  bilingual (EN/ES) read-aloud + DM tactics + an encounter-budget table. Same seed →
  same dungeon.
- **Receive a map** — Import ▾:
  - **From JSON** — the app's own lossless format (round-trips exactly). Also accepts a
    minimal `{rooms, corridors, entry}` object; plain strings get wrapped to EN/ES.
  - **Paste grid** — an ASCII letter-grid (each letter block = a room); aligned rooms
    auto-connect.
  - **From image** — loads your map image as a tracing underlay under the DM map;
    trace rooms over it with the Draw tool (opacity slider in the left panel).
  - **Blank canvas** — start from one room.
- **Dual live preview** — DM map and Player map side by side, always in sync. The
  Player map hides secret rooms/corridors/doors, monster tokens, and trap/loot markers.
  Click any room on either map for its details.
- **Edit** — the toolbar: Select/move (drag rooms, drag corner handles to resize),
  Draw room, Connect (click two rooms to add/remove a corridor), toggle Secret, Delete.
  Select a room → **Edit** in the inspector to change its name, read-aloud, monsters
  (auto-derives map tokens), trap/loot/tactics (per language), furniture, position, and
  entrance/secret flags. Dungeon title/subtitle/overview edit in the left panel.
- **EN / ES** — one toggle switches the whole UI *and* all content.
- **Export ▾** — **Interactive HTML** (a standalone shareable viewer: DM/Player + EN/ES
  + clickable rooms, the classic skill output), **JSON** (re-importable), or **PNG** of
  either map.

## AI generation (optional local bridge)

Beyond the offline generator, you can **drop in a map image and/or describe a dungeon
in words** ("a flooded goblin cavern, medium, lots of traps, one boss") and have it
built for you. This runs **Claude Code headless** on your own machine — no API key, no
cost beyond your Claude subscription — via a tiny local bridge.

One-time setup:
```bash
npm install -g @anthropic-ai/claude-code
claude                 # run once, log in with your Claude account
```
Then, to use it:
```bash
node ddg-server.js     # serves the studio AND the /generate endpoint
```
Open **http://localhost:8824/**. An **AI Generate** panel appears in the left sidebar:
add a map image (optional), type your guidance, set party size/level, click Generate.
The bridge asks Claude to (a) read the image and box its major rooms and (b) write a full
bilingual adventure, returns the dungeon JSON, and the studio renders it in the dual view.

**Image maps are "image-backed": your exact image is the map** (no redraw/approximation) —
the DM and Player views render *on top of your actual image*, overlaying clickable rooms,
tokens, and secret masks. Each room's clickable area is a **polygon that traces the room's
real shape** (stored as normalized `poly:[[x,y],…]` points), so hit areas follow the actual
layout, not loose rectangles. In the editor, **Draw** traces a polygon click-by-click
(click the first point or press Enter to close); **Select** then lets you drag the whole
room or any corner dot to reshape its outline. Generation takes ~2–5 minutes for an image.

- `ai/ddg-generator.md` — the instruction contract Claude follows (schema, layout
  extraction, no-spoiler/bilingual/straight-corridor rules). Editable to tune output.
- `ddg-server.js` — the bridge: static file server + `POST /generate` (runs `claude -p`,
  has Claude *write* the JSON to a file, then validates + auto-retries on bad JSON).
- The studio still works as a plain static file — the AI panel is always shown
  (BYOK with an Anthropic / OpenAI / Gemini key works without the bridge); only
  its status line changes to say whether the local bridge is reachable.

## Build

```bash
node build.js          # inlines src/shell.html + styles.css + js/*.js -> dist/dungeon-studio.html
node test/harness.js   # headless engine checks (generate + render invariants)
```

`build.js` also compiles the standalone **viewer** (`src/viewer-template.html` with the
renderer injected) and embeds it base64 in the studio, so *Export → Interactive HTML*
works offline.

## Source layout

| File | Role |
|---|---|
| `src/js/00-util.js` | seeded RNG, 5e XP thresholds & encounter math |
| `src/js/01-renderer.js` | the Dungeon Scrawl renderer — `renderMapSVG(dungeon, mode, sel)` |
| `src/js/02-library.js` | offline content: SRD monster bank + themed room prose (EN/ES) |
| `src/js/03-generator.js` | procedural layout + content assembly + budget scaling |
| `src/js/04-importers.js` | JSON / ASCII / image / blank, with coercion & validation |
| `src/js/05-editor.js` | pointer-driven geometry editing + image underlay |
| `src/js/06-export.js` | JSON / standalone HTML / PNG export |
| `src/js/07-app.js` | state, dual preview, inspector, language, wiring |
| `src/js/08-ai.js` | AI providers (bridge + BYOK Anthropic/OpenAI/Gemini) + AI panel |
| `src/js/09-cartografo-rooms.js` | EXACT room detection from Cartógrafo data (flood-fill + polygon tracing) |
| `src/js/10-integration.js` | shell handshake, map reception, describe dialog, content merge |
| `src/shell.html`, `src/styles.css` | studio markup + Entropy-house-style CSS |
| `src/shell-tabs.html` | the 2-tab shell (→ `dist/index.html`) |
| `src/viewer-template.html` | standalone exported-viewer skeleton |
| `ai/ddg-generator.md` | the AI generation contract (Claude follows this) |
| `ddg-server.js` | local bridge: serves dist + runs `claude -p` (map mode + content-only mode) |
| `dungeon-maker/mazmorra.html` | the Cartógrafo (source of truth; `dungeon-maker/*.js` = its test suite) |

## The dungeon data model (import/export JSON)

```jsonc
{
  "format": "ddg-dungeon", "version": 1,
  "meta": { "title": {"en","es"}, "subtitle": {"en","es"}, "theme": "crafters",
            "party": {"size": 5, "level": 4}, "cell": 26, "difficulty": "Hard" },
  "entry": "A",
  "rooms": [ { "id":"A", "x":6,"y":12,"w":6,"h":5, "secret":false, "feats":["kiln"],
               "name":{"en","es"}, "see":{"en","es"},
               "mon":{"en":["3× Skeleton (CR ¼)"],"es":[...]},
               "tokens":[{"t":"SK","cr":0.25}],
               "trap":{"en","es"}, "loot":{"en","es"}, "tac":{"en","es"} } ],
  "corridors": [ ["A","B"], ["B","C",{"secret":true}] ],
  "overview": {"en","es"}, "notes": {"en":[...],"es":[...]}, "budget": [ ... ]
}
```

Connected rooms must overlap on one axis so the corridor router draws them straight;
the editor warns when they don't.

## License & attribution

Code is MIT-licensed (see `LICENSE`). The creature bank uses names and
challenge ratings from the SRD 5.1 by Wizards of the Coast LLC, under
CC-BY-4.0 — full attribution in `NOTICE`. No rulebook text or stat blocks are
reproduced; all adventure prose is original. Not affiliated with or endorsed
by Wizards of the Coast.

## A note on the local AI bridge

`ddg-server.js` runs Claude Code with `--permission-mode bypassPermissions`.
That is a deliberate, bounded choice: the server listens on loopback only,
validates Host and Origin, restricts the agent to `Read,Write` tools inside a
throwaway temp directory, and feeds the prompt via stdin (no shell
interpolation). Review those guards before changing the surface.
