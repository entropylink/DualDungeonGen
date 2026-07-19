/* ============================================================
   DualDungeonGen — MAP EDITOR (geometry)
   Pointer-driven editing on the DM map: select+move, corner-resize,
   draw new rooms, connect/disconnect corridors, toggle secret, delete.
   Reads the current tool from the app state; mutates app.D and re-renders.
   Also owns the reference-image underlay used for tracing.
   ============================================================ */
(function (root) {
  "use strict";
  var DDG = root.DDG || (root.DDG = {});
  if (typeof document === "undefined") return;
  var app = null, svg = null, wrap = null;
  var drag = null;          // active move/resize/draw gesture
  var connectFirst = null;  // first room picked with the Connect tool
  var overlay = null;       // temp element while drawing
  var polyDraft = null;     // array of [x,y] (normalized) while tracing a polygon
  var raf = 0;

  function init(a) {
    app = a; svg = document.getElementById("mapDM"); wrap = document.getElementById("wrapDM");
    svg.addEventListener("pointerdown", onDown);
    svg.addEventListener("pointermove", onMove);
    svg.addEventListener("pointerup", onUp);
    svg.addEventListener("pointercancel", onUp);
    svg.addEventListener("click", onClick, true); // capture: run before app's selection handler for non-select tools
    svg.addEventListener("dblclick", function (e) { if (polyDraft) { e.preventDefault(); finishDraft(); } });
    document.addEventListener("keydown", function (e) {
      if (!polyDraft) return;
      if (e.key === "Enter") { finishDraft(); }
      else if (e.key === "Escape") { cancelDraft(); }
      else if (e.key === "Backspace") { polyDraft.pts.pop(); if (!polyDraft.pts.length) cancelDraft(); else renderDraft(); }
    });
  }

  function tool() { return app.state.tool; }
  function cell() { return (app.D.meta && app.D.meta.cell) || 26; }

  // ---- coordinate abstraction: gestures work in SVG units; a room's
  // geometry is stored as grid cells (drawn maps) OR normalized fractions
  // of the image (image-backed maps). rectSvg/setRectSvg bridge the two.
  function vbArr() { return svg.getAttribute("viewBox").split(" ").map(Number); }
  function toSvg(e) {
    var rect = svg.getBoundingClientRect(), v = vbArr();
    return { x: v[0] + (e.clientX - rect.left) / rect.width * v[2], y: v[1] + (e.clientY - rect.top) / rect.height * v[3] };
  }
  function isImg() { return !!(app.D.meta && app.D.meta.image); }
  function dims() { var v = vbArr(); return { W: v[2], H: v[3] }; }
  function clamp01(v) { return Math.max(0, Math.min(1, v)); }
  function minSvg() { return isImg() ? dims().W * 0.03 : 2 * cell(); }
  function rectSvg(r) {
    if (isImg()) { var d = dims(), m = r.img || { x: 0, y: 0, w: 0, h: 0 }; return { x: m.x * d.W, y: m.y * d.H, w: m.w * d.W, h: m.h * d.H }; }
    var c = cell(); return { x: r.x * c, y: r.y * c, w: r.w * c, h: r.h * c };
  }
  function setRectSvg(r, x, y, w, h) {
    if (isImg()) { var d = dims(); if (!r.img) r.img = {}; r.img.x = clamp01(x / d.W); r.img.y = clamp01(y / d.H);
      r.img.w = Math.max(0.01, Math.min(1 - r.img.x, w / d.W)); r.img.h = Math.max(0.01, Math.min(1 - r.img.y, h / d.H)); }
    else { var c = cell(); r.x = Math.max(0, Math.round(x / c)); r.y = Math.max(0, Math.round(y / c)); r.w = Math.max(2, Math.round(w / c)); r.h = Math.max(2, Math.round(h / c)); }
  }
  function roomAt(e) { var el = e.target.closest && e.target.closest("[data-room]"); return el ? el.getAttribute("data-room") : null; }
  var NS = "http://www.w3.org/2000/svg";

  // ---- polygon helpers (image mode) ------------------------------------
  function nrm(p) { var d = dims(); return [clamp01(p.x / d.W), clamp01(p.y / d.H)]; }
  function ensurePoly(r) { // materialise a poly so vertices can be edited
    if (!r.poly || r.poly.length < 3) { r.poly = DDG.roomPoly(r).map(function (p) { return [p.x, p.y]; }); delete r.img; }
  }
  function addVertex(p) {
    var d = dims();
    if (!polyDraft) polyDraft = { pts: [] };
    var pts = polyDraft.pts;
    if (pts.length >= 3) { var f = pts[0]; if (Math.hypot(p.x - f[0] * d.W, p.y - f[1] * d.H) < d.W * 0.02) { finishDraft(); return; } }
    pts.push(nrm(p)); renderDraft();
  }
  function finishDraft() {
    if (polyDraft && polyDraft.pts.length >= 3) {
      var pts = polyDraft.pts.filter(function (p, i, a) { if (i === 0) return true; var q = a[i - 1]; return Math.hypot(p[0] - q[0], p[1] - q[1]) > 0.005; });
      if (pts.length >= 3) {
        var id = nextId();
        app.D.rooms.push({ id: id, secret: false, feats: [], name: { en: "Room " + id, es: "Sala " + id }, see: { en: "", es: "" }, poly: pts });
        if (!app.D.entry) app.D.entry = id;
        polyDraft = null; removeOverlay(); app.select(id); return;
      }
    }
    cancelDraft();
  }
  function cancelDraft() { polyDraft = null; removeOverlay(); if (app.state) { app.renderMaps(); } }
  function renderDraft() {
    removeOverlay();
    if (!polyDraft || !polyDraft.pts.length) return;
    var d = dims(), g = document.createElementNS(NS, "g");
    var pa = polyDraft.pts.map(function (p) { return (p[0] * d.W) + "," + (p[1] * d.H); }).join(" ");
    var pl = document.createElementNS(NS, "polyline");
    pl.setAttribute("points", pa); pl.setAttribute("fill", "rgba(199,154,58,.15)");
    pl.setAttribute("stroke", "#c79a3a"); pl.setAttribute("stroke-width", "3"); pl.setAttribute("stroke-dasharray", "9 6");
    g.appendChild(pl);
    polyDraft.pts.forEach(function (p, i) {
      var c = document.createElementNS(NS, "circle");
      c.setAttribute("cx", p[0] * d.W); c.setAttribute("cy", p[1] * d.H); c.setAttribute("r", i === 0 ? d.W * 0.013 : d.W * 0.008);
      c.setAttribute("fill", i === 0 ? "#e8dcc6" : "#c79a3a"); c.setAttribute("stroke", "#1a1206"); c.setAttribute("stroke-width", "1.5");
      g.appendChild(c);
    });
    svg.appendChild(g); overlay = g;
  }

  // ---------- pointer gestures (select-move / resize / draw) -------------
  function onDown(e) {
    var tl = tool();
    if (tl === "select") {
      var handle = e.target.getAttribute && e.target.getAttribute("data-handle");
      if (handle) {
        var r = DDG.room(app.D, app.state.selected); if (!r) return;
        if (handle[0] === "v") { ensurePoly(r); drag = { type: "vertex", r: r, idx: parseInt(handle.slice(1), 10) }; try { svg.setPointerCapture(e.pointerId); } catch (_) {} e.preventDefault(); return; }
        drag = { type: "resize", handle: handle, r: r, start: toSvg(e), o: rectSvg(r) };
        try { svg.setPointerCapture(e.pointerId); } catch (_) {} e.preventDefault(); return;
      }
      var rid = roomAt(e);
      if (rid) {
        app.select(rid);
        var rr = DDG.room(app.D, rid);
        if (isImg()) { ensurePoly(rr); drag = { type: "polymove", r: rr, start: toSvg(e), o: rr.poly.map(function (p) { return p.slice(); }) }; }
        else { drag = { type: "move", r: rr, start: toSvg(e), o: rectSvg(rr) }; }
        try { svg.setPointerCapture(e.pointerId); } catch (_) {} e.preventDefault();
      }
    } else if (tl === "draw") {
      if (isImg()) { addVertex(toSvg(e)); e.preventDefault(); return; } // trace a polygon, click by click
      var p = toSvg(e);
      drag = { type: "draw", start: p, cur: p };
      try { svg.setPointerCapture(e.pointerId); } catch (_) {} e.preventDefault();
      drawOverlay(p, p);
    }
  }

  function onMove(e) {
    if (!drag) return;
    var p = toSvg(e), o = drag.o, r = drag.r, d = dims();
    if (drag.type === "vertex") {
      r.poly[drag.idx] = nrm(p); scheduleRender();
    } else if (drag.type === "polymove") {
      var dnx = (p.x - drag.start.x) / d.W, dny = (p.y - drag.start.y) / d.H;
      r.poly = o.map(function (pt) { return [clamp01(pt[0] + dnx), clamp01(pt[1] + dny)]; }); scheduleRender();
    } else if (drag.type === "move") {
      setRectSvg(r, o.x + (p.x - drag.start.x), o.y + (p.y - drag.start.y), o.w, o.h); scheduleRender();
    } else if (drag.type === "resize") {
      var dx = p.x - drag.start.x, dy = p.y - drag.start.y, h = drag.handle, mn = minSvg();
      var x1 = o.x, y1 = o.y, x2 = o.x + o.w, y2 = o.y + o.h;
      if (h.indexOf("w") >= 0) x1 = Math.min(x2 - mn, o.x + dx);
      if (h.indexOf("e") >= 0) x2 = Math.max(x1 + mn, o.x + o.w + dx);
      if (h.indexOf("n") >= 0) y1 = Math.min(y2 - mn, o.y + dy);
      if (h.indexOf("s") >= 0) y2 = Math.max(y1 + mn, o.y + o.h + dy);
      setRectSvg(r, x1, y1, x2 - x1, y2 - y1); scheduleRender();
    } else if (drag.type === "draw") {
      drag.cur = p; drawOverlay(drag.start, p);
    }
  }

  function onUp(e) {
    if (!drag) return;
    if (drag.type === "draw") {
      var a = drag.start, b = drag.cur;
      var x = Math.min(a.x, b.x), y = Math.min(a.y, b.y), w = Math.abs(b.x - a.x), h = Math.abs(b.y - a.y);
      removeOverlay();
      if (w >= minSvg() && h >= minSvg()) {
        var id = nextId();
        var room = { id: id, secret: false, feats: [], name: { en: "Room " + id, es: "Sala " + id }, see: { en: "", es: "" } };
        setRectSvg(room, x, y, w, h);
        app.D.rooms.push(room);
        if (!app.D.entry) app.D.entry = id;
        app.select(id);
      }
    }
    if (drag.type === "move" || drag.type === "resize" || drag.type === "vertex" || drag.type === "polymove") { app.renderInspector(); }
    drag = null;
    try { svg.releasePointerCapture(e.pointerId); } catch (_) {}
  }

  function scheduleRender() { if (raf) return; raf = requestAnimationFrame(function () { raf = 0; app.renderMaps(); }); }

  // ---------- click tools (connect / secret / delete) -------------------
  function onClick(e) {
    var tl = tool();
    if (tl === "select" || tl === "draw") return; // handled by pointer / app
    e.stopPropagation();
    var rid = roomAt(e); if (!rid) return;
    if (tl === "secret") {
      var r = DDG.room(app.D, rid); if (r) { r.secret = !r.secret; app.renderMaps(); app.renderInspector(); }
    } else if (tl === "delete") {
      app.D.rooms = app.D.rooms.filter(function (x) { return x.id !== rid; });
      app.D.corridors = app.D.corridors.filter(function (c) { return c[0] !== rid && c[1] !== rid; });
      if (app.D.entry === rid) app.D.entry = app.D.rooms[0] ? app.D.rooms[0].id : null;
      if (app.state.selected === rid) app.state.selected = null;
      app.renderMaps(); app.renderInspector();
    } else if (tl === "connect") {
      if (!connectFirst) { connectFirst = rid; app.status(app.lang() === "es" ? "Selecciona la segunda sala…" : "Now click the second room…"); highlight(rid, true); }
      else if (connectFirst === rid) { highlight(rid, false); connectFirst = null; }
      else { toggleCorridor(connectFirst, rid); highlight(connectFirst, false); connectFirst = null; app.renderMaps(); }
    }
  }

  function toggleCorridor(a, b) {
    var cor = app.D.corridors, idx = -1;
    for (var i = 0; i < cor.length; i++) { if ((cor[i][0] === a && cor[i][1] === b) || (cor[i][0] === b && cor[i][1] === a)) { idx = i; break; } }
    if (idx >= 0) { cor.splice(idx, 1); app.status(app.lang() === "es" ? "Pasillo eliminado." : "Corridor removed."); }
    else {
      // warn if rooms don't overlap on an axis (corridor won't be straight)
      var A = DDG.room(app.D, a), B = DDG.room(app.D, b);
      var ox = Math.min(A.x + A.w, B.x + B.w) - Math.max(A.x, B.x);
      var oy = Math.min(A.y + A.h, B.y + B.h) - Math.max(A.y, B.y);
      cor.push([a, b]);
      if (ox < 1 && oy < 1) app.status(app.lang() === "es" ? "Salas no alineadas: mueve una para un pasillo recto." : "Rooms not aligned — move one for a straight corridor.");
      else app.status(app.lang() === "es" ? "Pasillo añadido." : "Corridor added.");
    }
  }

  function highlight(rid, on) {
    var el = svg.querySelector('[data-room="' + rid + '"]');
    if (el) el.style.fill = on ? "rgba(199,154,58,.25)" : "transparent";
  }

  function onTool(tl) { if (connectFirst) { highlight(connectFirst, false); connectFirst = null; } polyDraft = null; removeOverlay(); }

  // ---------- overlays: draw box + resize handles -----------------------
  function drawOverlay(a, b) {
    removeOverlay();
    var x = Math.min(a.x, b.x), y = Math.min(a.y, b.y), w = Math.abs(b.x - a.x), h = Math.abs(b.y - a.y);
    overlay = document.createElementNS("http://www.w3.org/2000/svg", "rect");
    overlay.setAttribute("x", x); overlay.setAttribute("y", y); overlay.setAttribute("width", w); overlay.setAttribute("height", h);
    overlay.setAttribute("fill", "rgba(199,154,58,.2)"); overlay.setAttribute("stroke", "#c79a3a");
    overlay.setAttribute("stroke-width", isImg() ? "3" : "2"); overlay.setAttribute("stroke-dasharray", isImg() ? "9 6" : "5 4");
    svg.appendChild(overlay);
  }
  function removeOverlay() { if (overlay && overlay.parentNode) overlay.parentNode.removeChild(overlay); overlay = null; }

  function afterRender() {
    if (tool() !== "select" || !app.state.selected) return;
    var r = DDG.room(app.D, app.state.selected); if (!r) return;
    if (isImg()) {
      // one draggable handle per polygon vertex (rect rooms show their 4 corners)
      var d = dims(), pts = DDG.roomPoly(r), sz = d.W * 0.013;
      pts.forEach(function (p, i) {
        var rc = document.createElementNS(NS, "rect");
        rc.setAttribute("data-handle", "v" + i); rc.setAttribute("x", p.x * d.W - sz / 2); rc.setAttribute("y", p.y * d.H - sz / 2);
        rc.setAttribute("width", sz); rc.setAttribute("height", sz); rc.setAttribute("fill", "#c79a3a");
        rc.setAttribute("stroke", "#1a1206"); rc.setAttribute("stroke-width", "1.5"); rc.style.cursor = "move";
        svg.appendChild(rc);
      });
      return;
    }
    var g = rectSvg(r), s = 9;
    [["nw", g.x, g.y], ["ne", g.x + g.w, g.y], ["sw", g.x, g.y + g.h], ["se", g.x + g.w, g.y + g.h]].forEach(function (hd) {
      var hx = hd[1], hy = hd[2];
      var rc = document.createElementNS(NS, "rect");
      rc.setAttribute("data-handle", hd[0]); rc.setAttribute("x", hx - s / 2); rc.setAttribute("y", hy - s / 2);
      rc.setAttribute("width", s); rc.setAttribute("height", s); rc.setAttribute("fill", "#c79a3a");
      rc.setAttribute("stroke", "#1a1206"); rc.setAttribute("stroke-width", "1.5");
      rc.style.cursor = (hd[0] === "nw" || hd[0] === "se") ? "nwse-resize" : "nesw-resize";
      svg.appendChild(rc);
    });
  }

  function nextId() {
    var used = {}; app.D.rooms.forEach(function (r) { used[r.id] = 1; });
    for (var i = 0; i < 26; i++) { var ch = String.fromCharCode(65 + i); if (!used[ch]) return ch; }
    var n = 1; while (used["R" + n]) n++; return "R" + n;
  }

  // ---------- reference image -------------------------------------------
  function setImage(dataUrl) {
    var img = document.getElementById("refImg");
    img.src = dataUrl; img.hidden = false;
    img.style.opacity = document.getElementById("imgOpacity").value / 100;
    document.getElementById("imgOpacityWrap").hidden = false;
    document.getElementById("btnClearImg").hidden = false;
  }
  function clearImage() {
    var img = document.getElementById("refImg");
    img.hidden = true; img.src = "";
    document.getElementById("imgOpacityWrap").hidden = true;
    document.getElementById("btnClearImg").hidden = true;
    app.status(app.lang() === "es" ? "Imagen de referencia quitada." : "Reference image removed.");
  }

  DDG.editor = { init: init, afterRender: afterRender, onTool: onTool, handleMapClick: true,
    setImage: setImage, clearImage: clearImage, setTool: function (t) { app.setTool(t); } };
})(typeof window !== "undefined" ? window : globalThis);
