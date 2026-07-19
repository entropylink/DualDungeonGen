# DDG Generator — instruction contract for headless Claude

This is the "brain" the app's AI door uses. A Claude Code agent (interactive in
the desktop app, or headless via `claude -p`) is given this file plus an **input
block**, and must return a single **DDG dungeon JSON** that the DualDungeonGen
studio imports losslessly.

The studio is the renderer/editor. Your job is only to produce good JSON:
extract the layout (from an image, if given) and populate the adventure (from the
guidance). The human will tweak the result in the editor, so **faithful + valid**
beats **perfect** — never stall for perfection, always emit valid JSON.

---

## Input block (provided at call time)

```
IMAGE:     <path to a map image, or "none">
GUIDANCE:  <free text — what the dungeon is about, mood, mechanics, e.g.
           "a flooded goblin cavern, medium difficulty, lots of traps, one boss",
           or "empty crypt, no monsters, deadly traps only">
PARTY:     <size> PCs, level <n>          (default 4 PCs, level 3)
LANG:      en+es                          (always produce both)
OUTFILE:   <path to write the JSON to, or "stdout">
```

## Output contract (obey exactly)

- If `OUTFILE` is a path: **write only the JSON** to that file, then reply with one
  line: `WROTE <path>`.
- If `OUTFILE` is `stdout`: reply with **only** the JSON — no prose, no code fence,
  no commentary before or after. The first character of your reply must be `{`.
- The JSON must parse and match the schema below. Validate it mentally before emitting.

---

## Step 1 — Layout

### If `IMAGE` is a path — IMAGE-BACKED output (use the EXACT map)

The image itself **is** the map — the studio shows it exactly as-is and overlays your
rooms on top. **Do NOT redraw it, do NOT invent a grid, do NOT output cell coordinates
or `corridors`.**

**Room count — critical:** identify only the **major rooms and chambers**, aim for
**6–14 rooms, hard maximum 16**. Do NOT box individual grid tiles, 5-ft squares, thin
corridors, doorways, or tiny alcoves. If a cluster of small connected spaces reads as one
area, make it **one** room. Fewer, meaningful rooms is the goal — a wall of 60 tile-boxes
is wrong. (Over-segmenting also makes generation far too slow.)

Read the image and, for each major room/chamber, trace its **outline as a polygon** of
**normalized points** in a `poly` array — this is what makes the clickable area match the
room's real shape:

```jsonc
"poly": [ [0.06,0.42], [0.26,0.42], [0.26,0.60], [0.06,0.60] ]   // [x,y] pairs, 0..1
```
Each point is `[x, y]` where `x` = pixel-x ÷ image width, `y` = pixel-y ÷ image height
(origin top-left). List the points **in order around the room's perimeter**. Use **4 points
for a rectangular room; 5–12 points to follow an L-shape, a round cavern, or an irregular
chamber.** Trace the **inner floor edge** of each room, hugging its actual walls — this is
the whole point: match the reference exactly, don't approximate with a loose box. Rooms
should not overlap. Mark the outside entrance room as `entry` and any clearly-hidden room
as `"secret": true`.

**Do NOT output `meta.image`** — the app attaches the original image itself. Just output
the rooms (with `img` boxes) + content + `overview`/`notes`/`budget`. Omit `corridors`.

### If `IMAGE` is `none` — DRAWN output (grid)

Design a layout from scratch that fits the guidance — 6–9 rooms, hub-and-spoke or a small
loop, one entrance, one climax, one secret room. Use **cell coordinates**: each room is an
axis-aligned rectangle `x,y` (top-left) + `w,h` in cells (origin top-left), plus
`corridors` (pairs of room ids). Keep the map within ~34×34 cells.

Hard rule for DRAWN maps — **corridors must be straight**: two rooms you connect must
overlap on one axis by ≥1 cell. If a passage would bend, split it with a small junction
room. (This rule does not apply to image-backed maps, which have no drawn corridors.)

## Step 2 — Content (from GUIDANCE)

Read the guidance literally and honor it:
- **Monsters:** pick SRD creatures that fit ("goblin cavern" → goblins, goblin boss,
  maybe a giant spider; "undead crypt" → skeletons, ghouls, a wight). Keep the
  mechanical name + CR in `mon` (e.g. `"3× Goblin (CR ¼)"`). If guidance says
  **empty / no monsters / traps only**, leave `mon` off those rooms.
- **Difficulty:** scale to PARTY using 5e 2014 XP thresholds (per character, ×party
  size): warm-up room ≈ Easy, work rooms ≈ Medium, climax ≈ Hard or Deadly per the
  guidance. Put the per-room XP + Easy/Medium/Hard/Deadly label in `budget`.
- **Traps:** honor "lots of traps" / "trap-heavy" by giving most rooms a `trap` with
  a trigger, save DC, damage, and a spot DC. Make them thematic to the room.
- **Loot:** minor coin + a consumable early; the signature item at the climax; the
  "why" (a note/ledger/map) in the secret room.

### Bilingual + tone rules (non-negotiable)
- Every player/DM string is `{ "en": "...", "es": "..." }`. Spanish must be natural,
  real Spanish using RPG-standard terms (PJ/PX, CD, Percepción, Investigación, Fue/Des,
  daño cortante/fuego/ácido, VD for CR). Not word-by-word translation.
- `see` = what players **see**: sensory and physical only. **Never name a monster,
  reveal a trap, or spoil a secret** in `see`. A hidden ambusher reads as "a chest that
  sits oddly pristine," not "a mimic."
- `tac` = advice to the DM, 2nd person: one beat of behaviour + one tactical note.
- Furniture: pick 1–3 `feats` per room from the glyph library so the map isn't bare:
  `looms tapestry kiln anvil anvil2 bellows benches lathe shelves crates vat crest
  desk deskbig cases columns plinth bookshelf safe altar sarcophagus pool rubble
  stalagmites throne table beds cauldron barrels brazier`.

---

## Schema (emit exactly this shape)

```jsonc
{
  "format": "ddg-dungeon", "version": 1,
  "meta": {
    "title":    { "en": "...", "es": "..." },
    "subtitle": { "en": "...", "es": "..." },
    "theme": "cave",                       // freeform label; used for a badge
    "party": { "size": 4, "level": 3 },
    "cell": 26,
    "badge": { "en": "Beast Warren", "es": "Madriguera Bestial" },
    "difficulty": "Medium"
  },
  "entry": "A",
  "rooms": [
    {
      "id": "A", "x": 2, "y": 12, "w": 6, "h": 5,
      "secret": false,
      "feats": ["stalagmites", "rubble"],
      "name": { "en": "...", "es": "..." },
      "see":  { "en": "...", "es": "..." },
      "mon":  { "en": ["2× Goblin (CR ¼)"], "es": ["2× Trasgo (VD ¼)"] },
      "tokens": [ { "t": "GOB", "cr": 0.25 }, { "t": "GOB", "cr": 0.25 } ],
      "trap": { "en": "...", "es": "..." },
      "loot": { "en": "...", "es": "..." },
      "tac":  { "en": "...", "es": "..." }
    }
  ],
  "corridors": [ ["A","B"], ["D","S", { "secret": true }] ],
  "overview": { "en": "...", "es": "..." },
  "notes": { "en": ["<b>Party:</b> ...", "..."], "es": ["<b>Grupo:</b> ...", "..."] },
  "budget": [
    ["A", { "en": "Cave Mouth", "es": "Boca de la Cueva" },
          { "en": "2× Goblin", "es": "2× Trasgo" }, "~100 XP", "Easy"]
  ]
}
```

The schema above is the DRAWN (grid) form. **For an IMAGE-BACKED map, each room instead
carries a `poly` outline and there are NO `x/y/w/h` and NO `corridors`:**

```jsonc
{ "id": "A", "poly": [[0.06,0.42],[0.26,0.42],[0.26,0.60],[0.06,0.60]], "secret": false,
  "name": {…}, "see": {…}, "mon": {…}, "tokens": […], "trap": {…}, "loot": {…}, "tac": {…} }
```
Everything else (`meta` except `image`, `overview`, `notes`, `budget`, `entry`) is identical.

Field notes:
- `tokens` are the 2–3 letter labels drawn on the DM map (one per monster, max 4).
  `cr` ≥ 2 draws a bigger token. Omit `mon`/`tokens` for empty rooms.
- Only fields present are shown; a room with no `trap`/`loot`/`mon` is fine.
- `notes` = 4–5 HTML bullet strings (party math, pacing, a clever link between two
  rooms, the secret-room hook, a non-violent way to win). `budget` skips the secret room.
- Grid coords are integers in cells; `img` values are 0..1 fractions. Keep ids short
  (single letters or letter+digit).

Emit valid JSON. Then stop.
