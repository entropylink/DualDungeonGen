/* ============================================================
   DualDungeonGen — RENDERER
   Dungeon Scrawl style (cream tiles, ink walls, door bars).
   Ported from the dungeon-map-html skill's verified buildCG,
   refactored to draw from a passed-in `dungeon` object so the
   generator, importers and editor can all feed the same engine.

   Public: DDG.renderMapSVG(dungeon, mode, selectedId) -> {inner, vb}
   `mode` = "dm" | "player".  Player mode hides secret rooms /
   corridors / doors, monster tokens, trap/loot/secret markers and
   room-id labels. Geometry + furniture are identical in both modes.
   ============================================================ */
(function (root) {
  "use strict";

  // ---- palette (Dungeon Scrawl defaults) --------------------------------
  var WALL = "#16120c", FLOOR = "#dccbab", GRID = "#87795f",
      DOORC = "#f6f3ec", BG = "#2c2e33";
  var INK = "#6b5d47", FIRE = "#c0562e", ACID = "#6f8f5a", METAL = "#8a8f96";
  var TOK = { mon: { f: "#3f7d4e", s: "#eae3d2" }, trap: "#b23a2e",
              loot: "#c79a3a", sec: "#7d5bb0", sel: "#c79a3a" };
  var SECRET_TINT = "#d8c6cf";

  function cellOf(D) { return (D.meta && D.meta.cell) || 26; }
  function room(D, id) {
    for (var i = 0; i < D.rooms.length; i++) if (D.rooms[i].id === id) return D.rooms[i];
    return null;
  }

  // Corridor auto-router: straight 2-wide corridor between overlapping rooms.
  function corridor(A, B) {
    var ax1 = A.x, ax2 = A.x + A.w, ay1 = A.y, ay2 = A.y + A.h,
        bx1 = B.x, bx2 = B.x + B.w, by1 = B.y, by2 = B.y + B.h;
    var ox1 = Math.max(ax1, bx1), ox2 = Math.min(ax2, bx2),
        oy1 = Math.max(ay1, by1), oy2 = Math.min(ay2, by2), cw = 2;
    if (ox2 - ox1 >= 1) {
      var cx = Math.round((ox1 + ox2) / 2 - cw / 2),
          top = Math.min(ay2, by2), bot = Math.max(ay1, by1);
      return { rect: { x: cx, y: top - 1, w: cw, h: (bot - top) + 2 }, dir: "V" };
    }
    var cy = Math.round((oy1 + oy2) / 2 - cw / 2),
        lft = Math.min(ax2, bx2), rgt = Math.max(ax1, bx1);
    return { rect: { x: lft - 1, y: cy, w: (rgt - lft) + 2, h: cw }, dir: "H" };
  }

  // Full extent (always includes secret rooms) so the viewBox is stable
  // across DM/Player toggles.
  function extent(D) {
    var minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    D.rooms.forEach(function (r) {
      minX = Math.min(minX, r.x); minY = Math.min(minY, r.y);
      maxX = Math.max(maxX, r.x + r.w); maxY = Math.max(maxY, r.y + r.h);
    });
    var er = room(D, D.entry);
    if (er) maxY = Math.max(maxY, er.y + er.h + 3); // south entry stub
    if (!isFinite(minX)) { minX = 0; minY = 0; maxX = 10; maxY = 10; }
    return { minX: minX, minY: minY, maxX: maxX, maxY: maxY };
  }

  // Tokens for the map glyphs. If a room lacks explicit `tokens`, derive
  // a fallback from its `mon` display strings.
  function tokensFor(r) {
    if (r.tokens && r.tokens.length) return r.tokens;
    if (!r.mon || !r.mon.length) return [];
    var out = [];
    r.mon.forEach(function (m) {
      var s = String(m);
      // count prefix "3× Name" -> repeat token
      var count = 1, cm = s.match(/^\s*(\d+)\s*[x×]/i);
      if (cm) count = Math.min(4, parseInt(cm[1], 10));
      var cr = 1, crm = s.match(/CR\s*([\d.¼½¾/]+)/i);
      if (crm) cr = parseFrac(crm[1]);
      var name = s.replace(/^\s*\d+\s*[x×]\s*/i, "").replace(/\s*\(.*$/, "").trim();
      var t = name.split(/\s+/).map(function (w) { return w[0]; }).join("").slice(0, 3).toUpperCase() || "M";
      for (var i = 0; i < count; i++) out.push({ t: t, cr: cr });
    });
    return out.slice(0, 4);
  }
  function parseFrac(x) {
    x = String(x).trim();
    if (x === "¼" || x === "1/4") return 0.25;
    if (x === "½" || x === "1/2") return 0.5;
    if (x === "¾" || x === "3/4") return 0.75;
    if (x === "⅛" || x === "1/8") return 0.125;
    var f = parseFloat(x); return isFinite(f) ? f : 1;
  }

  function renderMapSVG(D, mode, sel) {
    // Image-backed dungeons use the user's EXACT map image as the base and
    // overlay interactivity; no Dungeon-Scrawl redraw / approximation.
    if (D.meta && D.meta.image) return renderImageMapSVG(D, mode, sel);
    var CELL = cellOf(D);
    var px = function (v) { return v * CELL; };
    var floor = {}, sec = {}, doors = [];
    var add = function (rc, s) {
      for (var x = rc.x; x < rc.x + rc.w; x++)
        for (var y = rc.y; y < rc.y + rc.h; y++) {
          var k = x + "," + y; floor[k] = 1; if (s) sec[k] = 1;
        }
    };

    D.rooms.forEach(function (r) {
      if (r.secret && mode === "player") return;
      add(r, r.secret);
    });

    (D.corridors || []).forEach(function (c) {
      var A = room(D, c[0]), B = room(D, c[1]), meta = c[2] || {};
      if (!A || !B) return;
      if (mode === "player" && (meta.secret || A.secret || B.secret)) return;
      var cc = corridor(A, B), rect = cc.rect, dir = cc.dir;
      add(rect, meta.secret);
      if (dir === "V") {
        var top = A.y < B.y ? A : B, bot = A.y < B.y ? B : A;
        doors.push({ x: rect.x, y: top.y + top.h, w: rect.w, horiz: true, secret: meta.secret });
        doors.push({ x: rect.x, y: bot.y, w: rect.w, horiz: true, secret: meta.secret });
      } else {
        var lft = A.x < B.x ? A : B, rgt = A.x < B.x ? B : A;
        doors.push({ x: lft.x + lft.w, y: rect.y, h: rect.h, horiz: false, secret: meta.secret });
        doors.push({ x: rgt.x, y: rect.y, h: rect.h, horiz: false, secret: meta.secret });
      }
    });

    var er = room(D, D.entry), stub = null;
    if (er) {
      stub = { x: Math.round(er.x + er.w / 2 - 1), y: er.y + er.h, w: 2, h: 3 };
      add(stub);
      doors.push({ x: stub.x, y: er.y + er.h, w: stub.w, horiz: true });
    }

    var ex = extent(D), p = 20;
    var x0 = px(ex.minX) - p, y0 = px(ex.minY) - p,
        vw = (ex.maxX - ex.minX) * CELL + 2 * p, vh = (ex.maxY - ex.minY) * CELL + 2 * p;
    var vb = x0 + " " + y0 + " " + vw + " " + vh;

    var s = '<g font-family="Cinzel, \'Crimson Pro\', serif">';
    s += '<rect x="' + x0 + '" y="' + y0 + '" width="' + vw + '" height="' + vh + '" fill="' + BG + '"/>';

    // floor pass
    Object.keys(floor).forEach(function (k) {
      var p2 = k.split(","), x = +p2[0], y = +p2[1], f = sec[k] ? SECRET_TINT : FLOOR;
      s += '<rect x="' + px(x) + '" y="' + px(y) + '" width="' + CELL + '" height="' + CELL +
           '" fill="' + f + '" stroke="' + GRID + '" stroke-width="1" stroke-opacity=".45"/>';
    });

    // wall pass — emit an edge line where a floor cell borders non-floor
    var ww = Math.round(CELL * 0.3), wl = "";
    Object.keys(floor).forEach(function (k) {
      var p2 = k.split(","), x = +p2[0], y = +p2[1], X = px(x), Y = px(y);
      if (!floor[x + "," + (y - 1)]) wl += '<line x1="' + X + '" y1="' + Y + '" x2="' + (X + CELL) + '" y2="' + Y + '"/>';
      if (!floor[x + "," + (y + 1)]) wl += '<line x1="' + X + '" y1="' + (Y + CELL) + '" x2="' + (X + CELL) + '" y2="' + (Y + CELL) + '"/>';
      if (!floor[(x - 1) + "," + y]) wl += '<line x1="' + X + '" y1="' + Y + '" x2="' + X + '" y2="' + (Y + CELL) + '"/>';
      if (!floor[(x + 1) + "," + y]) wl += '<line x1="' + (X + CELL) + '" y1="' + Y + '" x2="' + (X + CELL) + '" y2="' + (Y + CELL) + '"/>';
    });
    s += '<g stroke="' + WALL + '" stroke-width="' + ww + '" stroke-linecap="round" stroke-linejoin="round">' + wl + '</g>';

    // furniture (both modes)
    D.rooms.forEach(function (r) {
      if (r.secret && mode === "player") return;
      var rx = px(r.x), ry = px(r.y), rw = r.w * CELL, rh = r.h * CELL, cx = rx + rw / 2, cy = ry + rh / 2;
      (r.feats || []).forEach(function (ft) { s += feat(ft, rx, ry, rw, rh, cx, cy); });
    });

    // doors punch through walls
    doors.forEach(function (d) {
      if (d.secret && mode === "player") return;
      var col = d.secret ? TOK.sec : DOORC;
      if (d.horiz) {
        var X = px(d.x), Y = px(d.y), W = d.w * CELL;
        s += '<rect x="' + (X + 3) + '" y="' + (Y - ww / 2 - 1) + '" width="' + (W - 6) + '" height="' + (ww + 2) + '" fill="' + FLOOR + '"/>';
        s += '<rect x="' + (X + 3) + '" y="' + (Y - 2.5) + '" width="' + (W - 6) + '" height="5" fill="' + col + '" stroke="' + WALL + '" stroke-width="1"/>';
      } else {
        var X2 = px(d.x), Y2 = px(d.y), H = d.h * CELL;
        s += '<rect x="' + (X2 - ww / 2 - 1) + '" y="' + (Y2 + 3) + '" width="' + (ww + 2) + '" height="' + (H - 6) + '" fill="' + FLOOR + '"/>';
        s += '<rect x="' + (X2 - 2.5) + '" y="' + (Y2 + 3) + '" width="5" height="' + (H - 6) + '" fill="' + col + '" stroke="' + WALL + '" stroke-width="1"/>';
      }
    });

    // entrance steps + IN label
    if (er) {
      var sx = px(Math.round(er.x + er.w / 2 - 1)), sy = px(er.y + er.h + 2);
      for (var i = 0; i < 3; i++)
        s += '<line x1="' + (sx + 5) + '" y1="' + (sy + i * 7 + 4) + '" x2="' + (sx + 2 * CELL - 5) + '" y2="' + (sy + i * 7 + 4) + '" stroke="' + INK + '" stroke-width="2"/>';
      s += '<text x="' + (sx + CELL) + '" y="' + (sy + CELL + 6) + '" font-size="9" fill="' + INK + '" text-anchor="middle" letter-spacing="1">IN</text>';
    }

    // DM overlay
    if (mode === "dm") {
      D.rooms.forEach(function (r) {
        var rx = px(r.x), ry = px(r.y), rw = r.w * CELL, rh = r.h * CELL, cx = rx + rw / 2, cy = ry + rh / 2;
        var toks = tokensFor(r);
        if (toks.length) {
          var n = toks.length, gap = 34, startx = cx - (n - 1) * gap / 2;
          toks.forEach(function (m, i) {
            var big = m.cr >= 2, rr = big ? 15 : 11;
            s += '<circle cx="' + (startx + i * gap) + '" cy="' + cy + '" r="' + rr + '" fill="' + TOK.mon.f + '" stroke="#0e1a12" stroke-width="2"/>';
            s += '<text x="' + (startx + i * gap) + '" y="' + cy + '" font-size="' + (big ? 10 : 9) + '" fill="' + TOK.mon.s + '" text-anchor="middle" dominant-baseline="central" font-weight="700">' + esc(m.t) + '</text>';
          });
        }
        if (r.trap) s += '<text x="' + (rx + rw - 15) + '" y="' + (ry + 20) + '" font-size="18" fill="' + TOK.trap + '" text-anchor="middle">▲</text>';
        if (r.loot) s += '<text x="' + (rx + 15) + '" y="' + (ry + rh - 11) + '" font-size="16" fill="' + TOK.loot + '" text-anchor="middle">◆</text>';
        if (r.secret) s += '<text x="' + (rx + rw - 15) + '" y="' + (ry + rh - 11) + '" font-size="15" fill="' + TOK.sec + '" text-anchor="middle">✶</text>';
        s += '<text x="' + (rx + 10) + '" y="' + (ry + 15) + '" font-size="12" fill="' + WALL + '" opacity=".5" font-weight="700">' + esc(r.id) + '</text>';
      });
    }

    // hit rects + selection ring (last)
    D.rooms.forEach(function (r) {
      if (r.secret && mode === "player") return;
      var rx = px(r.x), ry = px(r.y), rw = r.w * CELL, rh = r.h * CELL;
      if (sel === r.id)
        s += '<rect x="' + (rx - 2) + '" y="' + (ry - 2) + '" width="' + (rw + 4) + '" height="' + (rh + 4) + '" fill="none" stroke="' + TOK.sel + '" stroke-width="3" rx="3"/>';
      s += '<rect class="bm-hit" data-room="' + esc(r.id) + '" fill="transparent" x="' + rx + '" y="' + ry + '" width="' + rw + '" height="' + rh + '"><title>' + esc(r.id) + '</title></rect>';
    });

    s += "</g>";
    return { inner: s, vb: vb };
  }

  function esc(x) {
    return String(x).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  // ---- feature glyph library (ink line-work on cream) -------------------
  var sk = 'stroke="' + INK + '" stroke-width="1.6" fill="none"';
  function anvil(x, y) {
    return '<path d="M' + (x - 9) + ',' + y + ' l18,0 l-3,4 l3,0 l-4,4 l-8,0 l0,4 l-4,0 l0,-4 l-4,0 l4,-4 l3,0 Z" fill="' + INK + '" opacity=".5" stroke="' + INK + '" stroke-width="1"/>';
  }
  // ---- polygon region helpers (normalized 0..1 points) ------------------
  // A room's clickable region is a polygon that traces its real shape on the
  // image. `poly` (array of [x,y]) is preferred; a legacy `img` rect becomes
  // its 4 corners. Everything downstream works on the polygon.
  function roomPoly(r) {
    if (r.poly && r.poly.length >= 3) return r.poly.map(function (p) { return { x: p[0], y: p[1] }; });
    var m = r.img || { x: 0, y: 0, w: 0.1, h: 0.1 };
    return [{ x: m.x, y: m.y }, { x: m.x + m.w, y: m.y }, { x: m.x + m.w, y: m.y + m.h }, { x: m.x, y: m.y + m.h }];
  }
  function polyBBox(pts) {
    var mnx = Infinity, mny = Infinity, mxx = -Infinity, mxy = -Infinity;
    pts.forEach(function (p) { mnx = Math.min(mnx, p.x); mny = Math.min(mny, p.y); mxx = Math.max(mxx, p.x); mxy = Math.max(mxy, p.y); });
    return { x: mnx, y: mny, w: mxx - mnx, h: mxy - mny };
  }
  function polyCentroid(pts) { var x = 0, y = 0; pts.forEach(function (p) { x += p.x; y += p.y; }); return { x: x / pts.length, y: y / pts.length }; }
  function ptsAttr(pts, W, H) { return pts.map(function (p) { return (p.x * W).toFixed(1) + "," + (p.y * H).toFixed(1); }).join(" "); }

  // ---- image-backed renderer: the user's exact map + polygon overlays ----
  function renderImageMapSVG(D, mode, sel) {
    var aspect = D.meta.imageAspect || 0.72;
    var W = 1000, H = Math.round(1000 * aspect);
    var op = (D.meta.imageOpacity != null ? D.meta.imageOpacity : 1);
    var s = '<g font-family="Cinzel, \'Crimson Pro\', serif">';
    s += '<image href="' + D.meta.image + '" x="0" y="0" width="' + W + '" height="' + H + '" opacity="' + op + '" preserveAspectRatio="none"/>';

    // player mode: cover secret rooms (their exact shape) so the handout hides them
    if (mode === "player") {
      D.rooms.forEach(function (r) {
        if (!r.secret) return; var pts = roomPoly(r), pa = ptsAttr(pts, W, H), c = polyCentroid(pts), bb = polyBBox(pts);
        s += '<polygon points="' + pa + '" fill="#161011"/>';
        s += '<polygon points="' + pa + '" fill="none" stroke="#0c0809" stroke-width="2"/>';
        s += '<text x="' + (c.x * W) + '" y="' + (c.y * H) + '" font-size="' + (Math.min(bb.w * W, bb.h * H) * 0.5) + '" fill="#3a2e28" text-anchor="middle" dominant-baseline="central">?</text>';
      });
    }

    // DM overlays: polygon tint + outline, tokens at centroid, markers at bbox, id label
    if (mode === "dm") {
      var ms = W * 0.02;
      D.rooms.forEach(function (r) {
        var pts = roomPoly(r), pa = ptsAttr(pts, W, H), c = polyCentroid(pts), bb = polyBBox(pts);
        var cx = c.x * W, cy = c.y * H, bx = bb.x * W, by = bb.y * H, bw = bb.w * W, bh = bb.h * H;
        s += '<polygon points="' + pa + '" fill="' + (r.secret ? SECRET_TINT : TOK.sel) + '" opacity="' + (r.secret ? 0.16 : 0.05) + '"/>';
        s += '<polygon points="' + pa + '" fill="none" stroke="' + (r.secret ? TOK.sec : TOK.sel) + '" stroke-width="1.5" stroke-opacity=".7" stroke-dasharray="6 4"/>';
        var toks = tokensFor(r);
        if (toks.length) {
          var n = toks.length, gap = W * 0.03, startx = cx - (n - 1) * gap / 2;
          toks.forEach(function (m, i) {
            var big = m.cr >= 2, rr = big ? W * 0.017 : W * 0.013;
            s += '<circle cx="' + (startx + i * gap) + '" cy="' + cy + '" r="' + rr + '" fill="' + TOK.mon.f + '" stroke="#0e1a12" stroke-width="2"/>';
            s += '<text x="' + (startx + i * gap) + '" y="' + cy + '" font-size="' + (big ? W * 0.012 : W * 0.0095) + '" fill="' + TOK.mon.s + '" text-anchor="middle" dominant-baseline="central" font-weight="700">' + esc(m.t) + '</text>';
          });
        }
        if (r.trap) s += marker(bx + bw - ms * 0.8, by + ms, ms, TOK.trap, "▲");
        if (r.loot) s += marker(bx + ms * 0.8, by + bh - ms * 0.7, ms * 0.9, TOK.loot, "◆");
        if (r.secret) s += marker(bx + bw - ms * 0.8, by + bh - ms * 0.7, ms * 0.85, TOK.sec, "✶");
        s += '<text x="' + (bx + ms * 0.5) + '" y="' + (by + ms) + '" font-size="' + (ms * 0.8) + '" fill="#ffffff" stroke="#000000" stroke-width="' + (ms * 0.06) + '" paint-order="stroke" font-weight="700">' + esc(r.id) + '</text>';
      });
    }

    // selection outline + polygon hit areas (skip secret rooms in player mode)
    D.rooms.forEach(function (r) {
      if (mode === "player" && r.secret) return; var pts = roomPoly(r), pa = ptsAttr(pts, W, H);
      if (sel === r.id) s += '<polygon points="' + pa + '" fill="none" stroke="' + TOK.sel + '" stroke-width="3"/>';
      s += '<polygon class="bm-hit" data-room="' + esc(r.id) + '" fill="transparent" points="' + pa + '"><title>' + esc(r.id) + '</title></polygon>';
    });

    s += "</g>";
    return { inner: s, vb: "0 0 " + W + " " + H };
  }
  function marker(x, y, size, color, glyph) {
    return '<text x="' + x + '" y="' + y + '" font-size="' + size + '" fill="' + color + '" stroke="#000" stroke-width="' + (size * 0.05) + '" paint-order="stroke" text-anchor="middle" dominant-baseline="central">' + glyph + '</text>';
  }

  function feat(ft, rx, ry, rw, rh, cx, cy) {
    switch (ft) {
      case "looms": { var o = ""; for (var i = 0; i < 3; i++) { var lx = rx + 18 + i * ((rw - 46) / 2); o += '<rect x="' + lx + '" y="' + (ry + 16) + '" width="16" height="' + (rh - 34) + '" ' + sk + '/>'; for (var t = 1; t < 4; t++) o += '<line x1="' + (lx + t * 4) + '" y1="' + (ry + 18) + '" x2="' + (lx + t * 4) + '" y2="' + (ry + rh - 20) + '" stroke="' + INK + '" stroke-width=".7"/>'; } return o; }
      case "tapestry": return '<rect x="' + (rx + rw - 18) + '" y="' + (ry + 12) + '" width="9" height="' + (rh - 24) + '" fill="' + INK + '" opacity=".22" stroke="' + INK + '" stroke-width="1.2"/>';
      case "kiln": { var o2 = '<circle cx="' + (rx + rw - 26) + '" cy="' + cy + '" r="17" fill="' + FIRE + '" opacity=".16" stroke="' + INK + '" stroke-width="1.8"/>'; o2 += '<path d="M' + (rx + rw - 26) + ',' + (cy + 7) + ' q-6,-9 0,-16 q6,7 0,16 Z" fill="' + FIRE + '" opacity=".6"/>'; return o2; }
      case "anvil": return anvil(rx + 28, cy - 10);
      case "anvil2": return anvil(rx + 28, cy + 18);
      case "bellows": return '<path d="M' + (rx + rw - 48) + ',' + (ry + 16) + ' l13,4 l-13,4 Z" ' + sk + '/>';
      case "benches": { var o3 = ""; for (var j = 0; j < 2; j++) o3 += '<rect x="' + (rx + 14) + '" y="' + (ry + 16 + j * ((rh - 34) / 1.5)) + '" width="' + (rw - 54) + '" height="11" ' + sk + '/>'; return o3; }
      case "lathe": return '<circle cx="' + (rx + rw - 24) + '" cy="' + cy + '" r="9" ' + sk + '/><line x1="' + (rx + rw - 33) + '" y1="' + cy + '" x2="' + (rx + rw - 15) + '" y2="' + cy + '" stroke="' + INK + '" stroke-width="1.6"/>';
      case "shelves": return '<rect x="' + (rx + 8) + '" y="' + (ry + 8) + '" width="' + (rw - 16) + '" height="7" fill="' + INK + '" opacity=".28"/><rect x="' + (rx + 8) + '" y="' + (ry + 19) + '" width="' + (rw - 16) + '" height="7" fill="' + INK + '" opacity=".28"/>';
      case "crates": { var o4 = ""; [[rx + 14, ry + rh - 24], [rx + 30, ry + rh - 24], [rx + 22, ry + rh - 40]].forEach(function (p) { o4 += '<rect x="' + p[0] + '" y="' + p[1] + '" width="12" height="12" ' + sk + '/>'; }); return o4; }
      case "vat": return '<circle cx="' + (rx + rw - 20) + '" cy="' + (cy + 5) + '" r="11" fill="' + ACID + '" opacity=".5" stroke="' + INK + '" stroke-width="1.6"/>';
      case "crest": return '<circle cx="' + cx + '" cy="' + cy + '" r="15" ' + sk + '/><path d="M' + (cx - 7) + ',' + (cy - 5) + ' l7,-4 l7,4 l0,9 l-7,5 l-7,-5 Z" ' + sk + '/>';
      case "desk": return '<rect x="' + (cx - 22) + '" y="' + (ry + 10) + '" width="44" height="11" ' + sk + '/>';
      case "cases": { var o5 = ""; [[rx + 10, ry + rh - 18], [rx + rw - 22, ry + rh - 18]].forEach(function (p) { o5 += '<rect x="' + p[0] + '" y="' + p[1] + '" width="12" height="10" ' + sk + '/>'; }); return o5; }
      case "columns": { var o6 = ""; [[0.2, 0.28], [0.8, 0.28], [0.2, 0.72], [0.8, 0.72]].forEach(function (p) { o6 += '<circle cx="' + (rx + rw * p[0]) + '" cy="' + (ry + rh * p[1]) + '" r="7" fill="' + FLOOR + '" stroke="' + INK + '" stroke-width="1.6"/>'; }); return o6; }
      case "plinth": return '<circle cx="' + cx + '" cy="' + cy + '" r="13" fill="' + METAL + '" opacity=".28" stroke="' + INK + '" stroke-width="2"/><rect x="' + (cx - 6) + '" y="' + (cy - 6) + '" width="12" height="12" fill="' + METAL + '" opacity=".5" stroke="' + INK + '" stroke-width="1.4"/>';
      case "deskbig": return '<rect x="' + (rx + 12) + '" y="' + (cy - 8) + '" width="' + (rw - 24) + '" height="15" ' + sk + '/>';
      case "bookshelf": return '<rect x="' + (rx + 8) + '" y="' + (ry + 8) + '" width="' + (rw - 16) + '" height="7" fill="' + INK + '" opacity=".28"/>';
      case "safe": return '<rect x="' + (rx + rw - 24) + '" y="' + (ry + rh - 22) + '" width="15" height="15" fill="' + METAL + '" opacity=".32" stroke="' + INK + '" stroke-width="1.6"/><circle cx="' + (rx + rw - 16.5) + '" cy="' + (ry + rh - 14.5) + '" r="3" ' + sk + '/>';
      // extra generic glyphs used by the generator's non-craft themes
      case "altar": return '<rect x="' + (cx - 16) + '" y="' + (cy - 7) + '" width="32" height="14" ' + sk + '/><line x1="' + (cx - 10) + '" y1="' + cy + '" x2="' + (cx + 10) + '" y2="' + cy + '" stroke="' + INK + '" stroke-width="1.2"/>';
      case "sarcophagus": return '<rect x="' + (cx - 10) + '" y="' + (ry + 14) + '" width="20" height="' + (rh - 28) + '" rx="8" ' + sk + '/><line x1="' + cx + '" y1="' + (ry + 20) + '" x2="' + cx + '" y2="' + (ry + rh - 20) + '" stroke="' + INK + '" stroke-width="1"/>';
      case "pool": return '<ellipse cx="' + cx + '" cy="' + cy + '" rx="' + (rw * 0.28) + '" ry="' + (rh * 0.26) + '" fill="' + ACID + '" opacity=".33" stroke="' + INK + '" stroke-width="1.4"/>';
      case "rubble": { var o7 = ""; [[rx + 16, ry + rh - 18], [rx + 26, ry + rh - 14], [rx + rw - 24, ry + 16]].forEach(function (p) { o7 += '<circle cx="' + p[0] + '" cy="' + p[1] + '" r="4" fill="' + INK + '" opacity=".4"/>'; }); return o7; }
      case "stalagmites": { var o8 = ""; [[0.25, 0.3], [0.7, 0.65], [0.5, 0.8]].forEach(function (p) { var mx = rx + rw * p[0], my = ry + rh * p[1]; o8 += '<path d="M' + (mx - 5) + ',' + (my + 6) + ' L' + mx + ',' + (my - 8) + ' L' + (mx + 5) + ',' + (my + 6) + ' Z" fill="' + INK + '" opacity=".3" stroke="' + INK + '" stroke-width="1"/>'; }); return o8; }
      case "throne": return '<rect x="' + (cx - 10) + '" y="' + (cy - 4) + '" width="20" height="16" ' + sk + '/><rect x="' + (cx - 10) + '" y="' + (cy - 18) + '" width="20" height="16" fill="' + INK + '" opacity=".18" stroke="' + INK + '" stroke-width="1.4"/>';
      case "table": return '<rect x="' + (cx - 20) + '" y="' + (cy - 8) + '" width="40" height="16" rx="3" ' + sk + '/>';
      case "beds": { var o9 = ""; for (var b = 0; b < 2; b++) o9 += '<rect x="' + (rx + 12) + '" y="' + (ry + 14 + b * 22) + '" width="22" height="14" rx="2" ' + sk + '/>'; return o9; }
      case "cauldron": return '<circle cx="' + cx + '" cy="' + cy + '" r="12" fill="' + FIRE + '" opacity=".18" stroke="' + INK + '" stroke-width="1.8"/><line x1="' + (cx - 14) + '" y1="' + (cy + 12) + '" x2="' + (cx + 14) + '" y2="' + (cy + 12) + '" stroke="' + INK + '" stroke-width="1.4"/>';
      case "barrels": { var o10 = ""; [[rx + 16, ry + 16], [rx + 30, ry + 16], [rx + 23, ry + 30]].forEach(function (p) { o10 += '<circle cx="' + p[0] + '" cy="' + p[1] + '" r="7" ' + sk + '/>'; }); return o10; }
      case "brazier": return '<circle cx="' + cx + '" cy="' + cy + '" r="8" fill="' + FIRE + '" opacity=".4" stroke="' + INK + '" stroke-width="1.6"/>';
    }
    return "";
  }

  var api = {
    renderMapSVG: renderMapSVG, corridor: corridor, extent: extent,
    room: room, tokensFor: tokensFor, feat: feat, parseFrac: parseFrac,
    roomPoly: roomPoly, polyBBox: polyBBox, polyCentroid: polyCentroid,
    palette: { WALL: WALL, FLOOR: FLOOR, GRID: GRID, DOORC: DOORC, BG: BG, INK: INK, SECRET_TINT: SECRET_TINT, TOK: TOK }
  };
  root.DDG = root.DDG || {};
  for (var k in api) root.DDG[k] = api[k];
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
