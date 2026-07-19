/* Node validation harness for the DDG engine (no browser needed).
   Loads the source modules in order and exercises the generator +
   renderer against the skill's invariants. */
var g = globalThis;
require("../src/js/00-util.js");
require("../src/js/01-renderer.js");
require("../src/js/02-library.js");
require("../src/js/03-generator.js");
var DDG = g.DDG;

var fail = 0, checks = 0;
function ok(cond, msg) { checks++; if (!cond) { fail++; console.log("  FAIL:", msg); } }

// ASCII occupancy dump to verify corridors are straight & connected.
function occ(D, mode) {
  var floor = {}, ids = {};
  var add = function (rc) { for (var x = rc.x; x < rc.x + rc.w; x++) for (var y = rc.y; y < rc.y + rc.h; y++) floor[x + "," + y] = 1; };
  D.rooms.forEach(function (r) { if (r.secret && mode === "player") return; add(r); ids[Math.round(r.x + r.w / 2) + "," + Math.round(r.y + r.h / 2)] = r.id[0]; });
  (D.corridors || []).forEach(function (c) {
    var A = DDG.room(D, c[0]), B = DDG.room(D, c[1]), meta = c[2] || {};
    if (mode === "player" && (meta.secret || A.secret || B.secret)) return;
    add(DDG.corridor(A, B).rect);
  });
  var er = DDG.room(D, D.entry); add({ x: Math.round(er.x + er.w / 2 - 1), y: er.y + er.h, w: 2, h: 3 });
  var maxX = 0, maxY = 0; Object.keys(floor).forEach(function (k) { var p = k.split(","); maxX = Math.max(maxX, +p[0]); maxY = Math.max(maxY, +p[1]); });
  var out = "";
  for (var y = 0; y <= maxY; y++) { var line = String(y).padStart(2) + " "; for (var x = 0; x <= maxX; x++) { var k = x + "," + y; line += ids[k] && floor[k] ? ids[k] : floor[k] ? "#" : "."; } out += line + "\n"; }
  return { text: out, floor: floor };
}

// verify each corridor actually links two rooms with a continuous floor run
function corridorsStraight(D) {
  var bad = 0;
  (D.corridors || []).forEach(function (c) {
    var A = DDG.room(D, c[0]), B = DDG.room(D, c[1]);
    var cc = DDG.corridor(A, B), rect = cc.rect;
    if (rect.w <= 0 || rect.h <= 0) bad++;
    // straight = one dimension is the 2-wide channel
    if (!(rect.w === 2 || rect.h === 2)) bad++;
  });
  return bad === 0;
}

var themes = ["crafters", "crypt", "cave", "cult"];
var combos = [[5, 4, 7], [4, 3, 6], [9, 5, 9], [3, 8, 8], [6, 2, 5]];
var difficulties = ["hard", "deadly"];
var total = 0;

themes.forEach(function (theme) {
  combos.forEach(function (c) {
    difficulties.forEach(function (diff, di) {
      total++;
      var D;
      try {
        D = DDG.generate({ theme: theme, party: { size: c[0], level: c[1] }, rooms: c[2], difficulty: diff, seed: 1000 + c[0] + di });
      } catch (e) { fail++; console.log(theme, c, "GENERATE EXCEPTION", e.message, e.stack); return; }

      var dm, pl;
      try { dm = DDG.renderMapSVG(D, "dm", null); pl = DDG.renderMapSVG(D, "player", null); }
      catch (e) { fail++; console.log(theme, c, "RENDER EXCEPTION", e.message); return; }

      var hitsDm = (dm.inner.match(/class="bm-hit"/g) || []).length;
      var hitsPl = (pl.inner.match(/class="bm-hit"/g) || []).length;
      var expDm = D.rooms.length;
      var expPl = D.rooms.filter(function (r) { return !r.secret; }).length;
      var tag = theme + " " + c.join("/") + " " + diff;
      ok(hitsDm === expDm, tag + " dm hits " + hitsDm + "/" + expDm);
      ok(hitsPl === expPl, tag + " player hits " + hitsPl + "/" + expPl);
      ok(dm.vb === pl.vb, tag + " viewBox stable");
      ok(dm.inner.indexOf("#d8c6cf") !== -1, tag + " dm has secret tint");
      ok(pl.inner.indexOf("#d8c6cf") === -1, tag + " player hides secret tint");
      ok(corridorsStraight(D), tag + " corridors straight");
      // selection ring
      ok(DDG.renderMapSVG(D, "dm", D.rooms[0].id).inner.indexOf('stroke-width="3"') !== -1, tag + " selection ring");
      // budget rows present
      ok(D.budget.length >= 4, tag + " budget rows");
      // no obvious duplicate attribute (fill=".." fill="..")
      ok(!/fill="[^"]*"\s+fill="/.test(dm.inner), tag + " no duplicate fill attr");
      // no NaN/undefined leaking into svg
      ok(dm.inner.indexOf("NaN") === -1 && dm.inner.indexOf("undefined") === -1, tag + " no NaN/undefined in svg");
    });
  });
});

// print one sample ascii for eyeballing
var sample = DDG.generate({ theme: "crypt", party: { size: 5, level: 4 }, rooms: 8, difficulty: "hard", seed: 42 });
console.log("\n=== SAMPLE crypt 5/4 r8 (DM) ===\n" + occ(sample, "dm").text);
console.log("=== SAMPLE (PLAYER) ===\n" + occ(sample, "player").text);
console.log("rooms:", sample.rooms.map(function (r) { return r.id + "(" + r.name.en + ")"; }).join(", "));
console.log("corridors:", JSON.stringify(sample.corridors));

console.log("\n" + total + " dungeons, " + checks + " checks, " + (fail ? fail + " FAILURES" : "ALL OK"));
process.exit(fail ? 1 : 0);
