/* Tests for the exact room detector (09-cartografo-rooms.js).
   Part 1: synthetic geometry cases with known answers.
   Part 2: integration — run the real Cartógrafo generator in jsdom
   (same Blob-capture trick as its own smoke test) and detect rooms
   on real generated maps. */
"use strict";
var path = require("path");
require("../src/js/09-cartografo-rooms.js");
var DDG = globalThis.DDG;

var fail = 0, checks = 0;
function ok(cond, msg) { checks++; if (!cond) { fail++; console.log("  FAIL:", msg); } }

function cellsRect(x0, y0, w, h, t) {
  var out = [];
  for (var x = x0; x < x0 + w; x++) for (var y = y0; y < y0 + h; y++) out.push([x + "," + y, { t: t || "floor" }]);
  return out;
}
function bounds(cells) {
  var mnx = Infinity, mny = Infinity, mxx = -Infinity, mxy = -Infinity;
  cells.forEach(function (c) { var p = c[0].split(","); var x = +p[0], y = +p[1];
    mnx = Math.min(mnx, x); mny = Math.min(mny, y); mxx = Math.max(mxx, x + 1); mxy = Math.max(mxy, y + 1); });
  return { minX: mnx - 1, minY: mny - 1, maxX: mxx + 1, maxY: mxy + 1 };
}
function detect(data) { return DDG.roomsFromCartografo(data, bounds(data.cells)); }

// ---- 1. single square room ----
(function () {
  var d = { cells: cellsRect(0, 0, 4, 4), walls: [], doors: [] };
  var r = detect(d);
  ok(r.rooms.length === 1, "single: 1 room, got " + r.rooms.length);
  ok(r.rooms[0].poly.length === 4, "single: 4-pt poly, got " + r.rooms[0].poly.length);
  ok(r.rooms[0].sizeFt2 === 100, "single: 16 cells = 100 ft², got " + r.rooms[0].sizeFt2);
})();

// ---- 2. wall splits two rooms ----
(function () {
  var d = { cells: cellsRect(0, 0, 8, 4), walls: [{ x1: 4, y1: 0, x2: 4, y2: 4 }], doors: [] };
  var r = detect(d);
  ok(r.rooms.length === 2, "wall-split: 2 rooms, got " + r.rooms.length);
})();

// ---- 3. door splits AND records adjacency ----
(function () {
  var d = { cells: cellsRect(0, 0, 8, 4), walls: [{ x1: 4, y1: 0, x2: 4, y2: 1 }, { x1: 4, y1: 3, x2: 4, y2: 4 }], doors: [{ x1: 4, y1: 1, x2: 4, y2: 3 }] };
  var r = detect(d);
  ok(r.rooms.length === 2, "door-split: 2 rooms, got " + r.rooms.length);
  ok(r.adjacency.length === 1 && r.adjacency[0] === "A-B", "door adjacency A-B, got " + JSON.stringify(r.adjacency));
})();

// ---- 4. open gap = one room, non-rectangular outline ----
(function () {
  var cells = cellsRect(0, 0, 4, 4).concat(cellsRect(4, 1, 2, 2)).concat(cellsRect(6, 0, 4, 4));
  var d = { cells: cells, walls: [], doors: [] };
  var r = detect(d);
  ok(r.rooms.length === 1, "open-gap: 1 fused room, got " + r.rooms.length);
  ok(r.rooms[0].poly.length === 12, "open-gap: H-shape 12-pt poly, got " + r.rooms[0].poly.length);
})();

// ---- 5. L-shaped room = 6 points ----
(function () {
  var cells = cellsRect(0, 0, 6, 3).concat(cellsRect(0, 3, 3, 3));
  var d = { cells: cells, walls: [], doors: [] };
  var r = detect(d);
  ok(r.rooms.length === 1, "L: 1 room");
  ok(r.rooms[0].poly.length === 6, "L: 6-pt poly, got " + r.rooms[0].poly.length);
})();

// ---- 6. diagonal wall splits ----
(function () {
  var d = { cells: cellsRect(0, 0, 6, 6), walls: [{ x1: 0, y1: 0, x2: 6, y2: 6 }], doors: [] };
  var r = detect(d);
  ok(r.rooms.length === 2, "diagonal: 2 rooms, got " + r.rooms.length);
})();

// ---- 7. water flag + hints ----
(function () {
  var cells = cellsRect(0, 0, 4, 4).concat(cellsRect(1, 1, 2, 1, "water"));
  var d = { cells: cells, walls: [], doors: [],
    stairs: [{ x1: 1, y1: 1, x2: 2, y2: 1, x3: 1, y3: 2, x4: 2, y4: 2 }],
    objects: [{ a: 7, x: 2, y: 2 }], labels: [{ x: 2, y: 2, text: "Cripta" }],
    assets: { object: [{ id: 7, name: "cofre" }] } };
  var r = detect(d);
  ok(r.rooms.length === 1 && r.rooms[0].water === true, "water flag");
  ok(r.rooms[0].stairs === 1, "stairs hint, got " + r.rooms[0].stairs);
  ok(r.rooms[0].props.indexOf("cofre") >= 0, "prop hint, got " + JSON.stringify(r.rooms[0].props));
  ok(r.rooms[0].labels.indexOf("Cripta") >= 0, "label hint");
})();

// ---- 8. normalization: every point strictly inside 0..1 ----
(function () {
  var d = { cells: cellsRect(3, 5, 10, 7), walls: [], doors: [] };
  var r = detect(d);
  var inb = r.rooms[0].poly.every(function (p) { return p[0] > 0 && p[0] < 1 && p[1] > 0 && p[1] < 1; });
  ok(inb, "normalized points inside (0,1)");
})();

console.log("synthetic: " + checks + " checks" + (fail ? ", " + fail + " FAIL" : " — OK"));

// ---- Part 2: real generated maps via jsdom ----
var MAZ = path.join(__dirname, "..", "dungeon-maker", "mazmorra.html");
var fs = require("fs");
if (!fs.existsSync(MAZ)) { console.log("(skip integration — mazmorra.html not found)"); done(); return; }
var JSDOM;
try { ({ JSDOM } = require(path.join(__dirname, "..", "dungeon-maker", "node_modules", "jsdom"))); }
catch (e) { try { ({ JSDOM } = require("jsdom")); } catch (e2) { console.log("(skip integration — no jsdom)"); done(); } }
if (JSDOM) {
  var html = fs.readFileSync(MAZ, "utf8");
  var dom = new JSDOM(html, { runScripts: "outside-only", pretendToBeVisual: true });
  var window = dom.window, document = window.document;
  var grad = { addColorStop: function () {} };
  window.HTMLCanvasElement.prototype.getContext = function () {
    return new Proxy({}, { get: function (t, p) {
      if (p === "measureText") return function (s) { return { width: (s ? String(s).length : 1) * 7 }; };
      if (p === "createLinearGradient") return function () { return grad; };
      if (p === "createPattern") return function () { return { setTransform: function () {} }; };
      if (p === "getImageData") return function () { return { data: new Uint8ClampedArray(4) }; };
      if (p === "canvas") return { width: 800, height: 600 };
      if (typeof p === "string") return function () {};
      return undefined; }, set: function () { return true; } });
  };
  window.HTMLCanvasElement.prototype.toBlob = function (cb) { cb(new window.Blob(["x"])); };
  window.URL.createObjectURL = function () { return "blob:x"; };
  window.URL.revokeObjectURL = function () {};
  var blobs = [];
  var BlobReal = window.Blob;
  window.Blob = function (parts, opts) { blobs.push({ parts: parts, type: opts && opts.type }); return new BlobReal(parts, opts); };
  var script = html.match(/<script>([\s\S]*?)<\/script>/g).pop().replace(/<\/?script>/g, "");
  window.eval(script);
  function click(sel) { var el = document.querySelector(sel); el.dispatchEvent(new window.MouseEvent("click", { bubbles: true })); }

  var types = ["rooms", "caves", "maze"], totalRooms = 0;
  types.forEach(function (ty) {
    click("#genBtn");
    click('#genTypeSeg [data-gtype="' + ty + '"]');
    click('#genSizeSeg [data-gsize="m"]');
    click("#genGo");
    blobs.length = 0;
    click("#exportBtn");
    document.querySelectorAll('#exportMenu button[data-fmt="json"]').forEach(function (b) { b.dispatchEvent(new window.MouseEvent("click", { bubbles: true })); });
    var cap = blobs.filter(function (b) { return b.type === "application/json"; }).pop();
    ok(!!cap, ty + ": captured JSON export");
    if (!cap) return;
    var data = JSON.parse(cap.parts.join(""));
    var r = detect(data);
    totalRooms += r.rooms.length;
    ok(r.rooms.length >= 1, ty + ": >=1 room, got " + r.rooms.length);
    var allValid = r.rooms.every(function (rm) {
      return rm.poly.length >= 3 && rm.poly.every(function (p) {
        return isFinite(p[0]) && isFinite(p[1]) && p[0] >= 0 && p[0] <= 1 && p[1] >= 0 && p[1] <= 1;
      });
    });
    ok(allValid, ty + ": all polys valid + normalized");
    var ids = {}; var dup = false;
    r.rooms.forEach(function (rm) { if (ids[rm.id]) dup = true; ids[rm.id] = 1; });
    ok(!dup, ty + ": unique ids");
    console.log("  " + ty + ": cells=" + data.cells.length + " doors=" + data.doors.length +
      " -> rooms=" + r.rooms.length + " adjacency=" + r.adjacency.length);
  });
  ok(totalRooms >= 3, "integration produced rooms overall");
  done();
}
function done() {
  console.log("\nTOTAL: " + checks + " checks, " + (fail ? fail + " FAILURES" : "ALL OK"));
  process.exit(fail ? 1 : 0);
}
