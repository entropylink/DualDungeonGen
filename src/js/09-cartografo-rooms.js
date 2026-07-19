/* ============================================================
   DualDungeonGen — EXACT ROOM DETECTION from Cartógrafo data
   Input: the Cartógrafo de Mazmorras save JSON (v4) + the export
   bounds used to render its PNG. Output: rooms as EXACT polygon
   outlines (normalized 0..1 against that same PNG), plus hints
   (water, stairs, props, labels, door adjacency) for the AI.

   Deterministic — no vision, no approximation:
   - flood-fill floor/water cells, passage blocked where the
     center-to-center segment crosses a wall or door segment
     (same geometric rule the Cartógrafo itself uses);
   - each connected component = one room;
   - its boundary is traced along the exact cell edges and
     normalized with the SAME bounds the PNG was rendered with,
     so overlays align pixel-perfect.
   ============================================================ */
(function (root) {
  "use strict";
  var DDG = root.DDG || (root.DDG = {});

  // ---- segment intersection --------------------------------------------
  // EXACT same rule as the Cartógrafo's own segIntersect/crossesWall
  // (zero-orientation groups with the negative side), so room detection
  // agrees with how the app's own flood/bucket behaves — including cells
  // whose center lies ON a diagonal wall.
  function orient(ax, ay, bx, by, cx, cy) {
    return (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
  }
  function segsCross(a, b, c, d) {
    var o1 = orient(a.x, a.y, b.x, b.y, c.x, c.y), o2 = orient(a.x, a.y, b.x, b.y, d.x, d.y);
    var o3 = orient(c.x, c.y, d.x, d.y, a.x, a.y), o4 = orient(c.x, c.y, d.x, d.y, b.x, b.y);
    return ((o1 > 0) !== (o2 > 0)) && ((o3 > 0) !== (o4 > 0));
  }

  // ---- passage test ------------------------------------------------------
  // Blockers = walls + doors (a door separates two rooms). Segments with
  // zero length are ignored. Cell centers are (x+.5, y+.5).
  function makeBlockTest(walls, doors) {
    var segs = [];
    (walls || []).concat(doors || []).forEach(function (w) {
      if (w && (w.x1 !== w.x2 || w.y1 !== w.y2)) segs.push(w);
    });
    // coarse spatial hash so big maps stay fast
    var grid = {};
    segs.forEach(function (s, i) {
      var mnx = Math.floor(Math.min(s.x1, s.x2)), mxx = Math.floor(Math.max(s.x1, s.x2));
      var mny = Math.floor(Math.min(s.y1, s.y2)), mxy = Math.floor(Math.max(s.y1, s.y2));
      for (var gx = mnx - 1; gx <= mxx + 1; gx++)
        for (var gy = mny - 1; gy <= mxy + 1; gy++) {
          var k = gx + "," + gy; (grid[k] || (grid[k] = [])).push(i);
        }
    });
    return function blocked(ax, ay, bx, by) {
      var a = { x: ax + 0.5, y: ay + 0.5 }, b = { x: bx + 0.5, y: by + 0.5 };
      var k1 = ax + "," + ay, k2 = bx + "," + by, seen = {};
      var lists = [grid[k1], grid[k2]];
      for (var li = 0; li < lists.length; li++) {
        var L = lists[li]; if (!L) continue;
        for (var i = 0; i < L.length; i++) {
          var idx = L[i]; if (seen[idx]) continue; seen[idx] = 1;
          var s = segs[idx];
          if (segsCross(a, b, { x: s.x1, y: s.y1 }, { x: s.x2, y: s.y2 })) return true;
        }
      }
      return false;
    };
  }

  // ---- connected components ---------------------------------------------
  function components(cellKeys, blocked) {
    var inSet = {}; cellKeys.forEach(function (k) { inSet[k] = 1; });
    var seen = {}, comps = [];
    var DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    cellKeys.forEach(function (start) {
      if (seen[start]) return;
      var q = [start], comp = []; seen[start] = 1;
      while (q.length) {
        var k = q.pop(); comp.push(k);
        var p = k.split(","), x = +p[0], y = +p[1];
        for (var d = 0; d < 4; d++) {
          var nx = x + DIRS[d][0], ny = y + DIRS[d][1], nk = nx + "," + ny;
          if (!inSet[nk] || seen[nk]) continue;
          if (blocked(x, y, nx, ny)) continue;
          seen[nk] = 1; q.push(nk);
        }
      }
      comps.push(comp);
    });
    return comps;
  }

  // ---- boundary tracing ---------------------------------------------------
  // Directed edges (interior kept on a consistent side); chained into loops;
  // the loop with the largest area is the outer boundary. Collinear points
  // are merged so a straight wall is 2 points, not 20.
  function tracePolygon(comp) {
    var inC = {}; comp.forEach(function (k) { inC[k] = 1; });
    var edges = {}; // "x,y" start -> array of [ex,ey]
    function addEdge(sx, sy, ex, ey) { var k = sx + "," + sy; (edges[k] || (edges[k] = [])).push([ex, ey]); }
    comp.forEach(function (k) {
      var p = k.split(","), x = +p[0], y = +p[1];
      if (!inC[x + "," + (y - 1)]) addEdge(x, y, x + 1, y);           // top  →E
      if (!inC[(x + 1) + "," + y]) addEdge(x + 1, y, x + 1, y + 1);   // right→S
      if (!inC[x + "," + (y + 1)]) addEdge(x + 1, y + 1, x, y + 1);   // bot  →W
      if (!inC[(x - 1) + "," + y]) addEdge(x, y + 1, x, y);           // left →N
    });
    var loops = [];
    var startKeys = Object.keys(edges);
    for (var si = 0; si < startKeys.length; si++) {
      var sk = startKeys[si];
      while (edges[sk] && edges[sk].length) {
        var sp = sk.split(","), cx = +sp[0], cy = +sp[1];
        var loop = [[cx, cy]];
        var cur = edges[sk].pop();
        var px = cx, py = cy;
        var guard = 0;
        while (guard++ < 100000) {
          var vx = cur[0], vy = cur[1];
          if (vx === loop[0][0] && vy === loop[0][1]) break; // closed
          loop.push([vx, vy]);
          var outs = edges[vx + "," + vy];
          if (!outs || !outs.length) { loop = null; break; } // broken chain (shouldn't happen)
          var next;
          if (outs.length === 1) next = outs.pop();
          else {
            // pinch vertex: prefer the sharpest turn toward the interior
            // (right turn in y-down coords) so we stay on the same loop
            var inx = vx - px, iny = vy - py, best = -1, bestScore = -Infinity;
            for (var oi = 0; oi < outs.length; oi++) {
              var ox = outs[oi][0] - vx, oy = outs[oi][1] - vy;
              var cross = inx * oy - iny * ox;      // >0 = right turn (y down)
              var dot = inx * ox + iny * oy;
              var score = cross > 0 ? 2 : (cross === 0 && dot > 0 ? 1 : 0);
              if (score > bestScore) { bestScore = score; best = oi; }
            }
            next = outs.splice(best, 1)[0];
          }
          px = vx; py = vy; cur = next;
        }
        if (loop && loop.length >= 3) loops.push(loop);
      }
    }
    if (!loops.length) return null;
    // outer loop = max |shoelace area|
    var bestLoop = loops[0], bestA = -1;
    loops.forEach(function (L) {
      var a = 0;
      for (var i = 0; i < L.length; i++) { var j = (i + 1) % L.length; a += L[i][0] * L[j][1] - L[j][0] * L[i][1]; }
      a = Math.abs(a / 2);
      if (a > bestA) { bestA = a; bestLoop = L; }
    });
    // merge collinear runs
    var out = [];
    for (var i2 = 0; i2 < bestLoop.length; i2++) {
      var A = bestLoop[(i2 + bestLoop.length - 1) % bestLoop.length], B = bestLoop[i2], C = bestLoop[(i2 + 1) % bestLoop.length];
      if ((B[0] - A[0]) * (C[1] - B[1]) - (B[1] - A[1]) * (C[0] - B[0]) !== 0) out.push(B);
    }
    return out.length >= 3 ? out : bestLoop;
  }

  // ---- main entry ---------------------------------------------------------
  // data:   Cartógrafo save JSON (v4) — cells [[key,{t,..}],..], walls, doors,
  //         stairs, objects, labels, assets
  // bounds: {minX,minY,maxX,maxY} in cell coords — MUST be the same bounds
  //         the PNG was rendered with (padB(contentBounds(),1)).
  function roomsFromCartografo(data, bounds) {
    var cells = new Map(data.cells || []);
    var keys = [...cells.keys()];
    if (!keys.length) return { rooms: [], adjacency: [] };
    var blocked = makeBlockTest(data.walls, data.doors);
    var comps = components(keys, blocked).filter(function (c) { return c.length >= 1; });
    comps.sort(function (a, b) { return b.length - a.length; });

    var bw = bounds.maxX - bounds.minX, bh = bounds.maxY - bounds.minY;
    function norm(pt) {
      return [Math.round((pt[0] - bounds.minX) / bw * 10000) / 10000,
              Math.round((pt[1] - bounds.minY) / bh * 10000) / 10000];
    }
    function cellRoomIndex(x, y) {
      var k = Math.floor(x) + "," + Math.floor(y);
      for (var i = 0; i < comps.length; i++) if (compSets[i][k]) return i;
      return -1;
    }
    var compSets = comps.map(function (c) { var s = {}; c.forEach(function (k) { s[k] = 1; }); return s; });

    // asset names for object hints
    var objNames = {};
    ((data.assets && data.assets.object) || []).forEach(function (a) { objNames[a.id] = a.name || ""; });

    var rooms = comps.map(function (comp, i) {
      var poly = tracePolygon(comp);
      var id = i < 26 ? String.fromCharCode(65 + i) : "R" + (i + 1);
      var water = false;
      comp.forEach(function (k) { var c = cells.get(k); if (c && c.t === "water") water = true; });
      return {
        id: id,
        poly: poly ? poly.map(norm) : null,
        cells: comp.length,
        sizeFt2: Math.round(comp.length * 6.25), // cell = 2.5ft → 6.25 ft²
        water: water,
        stairs: 0, props: [], labels: []
      };
    }).filter(function (r) { return r.poly && r.poly.length >= 3; });

    // hints: stairs / props / labels by position
    (data.stairs || []).forEach(function (s) {
      var mx = (s.x1 + s.x4) / 2, my = (s.y1 + s.y4) / 2;
      var ri = cellRoomIndex(mx, my); if (ri >= 0 && rooms[ri]) rooms[ri].stairs++;
    });
    (data.objects || []).forEach(function (o) {
      var ri = cellRoomIndex(o.x, o.y);
      if (ri >= 0 && rooms[ri]) { var n = objNames[o.a]; if (n && rooms[ri].props.indexOf(n) < 0) rooms[ri].props.push(n); }
    });
    (data.labels || []).forEach(function (l) {
      var ri = cellRoomIndex(l.x, l.y);
      if (ri >= 0 && rooms[ri] && l.text) rooms[ri].labels.push(l.text);
    });

    // door adjacency: which two rooms each door separates
    var adjacency = [];
    (data.doors || []).forEach(function (d) {
      var mx = (d.x1 + d.x2) / 2, my = (d.y1 + d.y2) / 2;
      var vert = Math.abs(d.x2 - d.x1) < Math.abs(d.y2 - d.y1);
      var a, b;
      if (vert) { a = cellRoomIndex(mx - 0.5, my); b = cellRoomIndex(mx + 0.5, my); }
      else { a = cellRoomIndex(mx, my - 0.5); b = cellRoomIndex(mx, my + 0.5); }
      if (a >= 0 && b >= 0 && a !== b && rooms[a] && rooms[b]) {
        var pair = [rooms[a].id, rooms[b].id].sort().join("-");
        if (adjacency.indexOf(pair) < 0) adjacency.push(pair);
      }
    });

    return { rooms: rooms, adjacency: adjacency };
  }

  DDG.roomsFromCartografo = roomsFromCartografo;
  DDG._cartoInternals = { segsCross: segsCross, makeBlockTest: makeBlockTest, components: components, tracePolygon: tracePolygon };
  if (typeof module !== "undefined" && module.exports) module.exports = { roomsFromCartografo: roomsFromCartografo };
})(typeof window !== "undefined" ? window : globalThis);
