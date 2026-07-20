/* ============================================================
   DualDungeonGen — IMPORTERS
   "Receive a map (json / grid / image / blank), read it, produce the
   dual DM/Player interactive map." JSON is the lossless path (the app's
   own export format). ASCII parses a letter-grid into rooms. Image loads
   as a tracing underlay for the Draw tool.
   ============================================================ */
(function (root) {
  "use strict";
  var DDG = root.DDG || (root.DDG = {});
  if (typeof document === "undefined") return;
  var app = null;
  function init(a) { app = a; }

  // ---- bilingual coercion ----------------------------------------------
  function bil(x) {
    if (x == null) return { en: "", es: "" };
    if (typeof x === "string") return { en: x, es: x };
    if (typeof x === "object") return { en: x.en != null ? x.en : (x.es != null ? x.es : ""), es: x.es != null ? x.es : (x.en != null ? x.en : "") };
    return { en: String(x), es: String(x) };
  }
  function bilArr(x) {
    if (!x) return null;
    if (Array.isArray(x)) return { en: x.slice(), es: x.slice() };
    if (typeof x === "object") return { en: x.en || x.es || [], es: x.es || x.en || [] };
    return null;
  }
  function num(v, d) { v = Number(v); return isFinite(v) ? v : d; }
  // Only accept an image reference that is an inline data:image payload or an
  // https URL. Anything else (javascript:, data:text/html, arbitrary markup,
  // http:) is dropped so a hostile import can't inject into the <image href>.
  function safeImage(v) {
    return (typeof v === "string" && (/^data:image\//i.test(v) || /^https:/i.test(v))) ? v : "";
  }

  function coerceRoom(r) {
    if (!r || r.id == null) throw new Error("room missing id");
    var out = {
      id: String(r.id), x: num(r.x, 0), y: num(r.y, 0), w: Math.max(2, num(r.w, 5)), h: Math.max(2, num(r.h, 4)),
      secret: !!r.secret, feats: Array.isArray(r.feats) ? r.feats.slice() : []
    };
    out.name = bil(r.name || out.id); out.see = bil(r.see || "");
    var mon = bilArr(r.mon); if (mon) out.mon = mon;
    if (r.tokens) out.tokens = r.tokens; else if (out.mon) out.tokens = DDG.tokensFor({ mon: out.mon.en });
    if (r.trap) out.trap = bil(r.trap);
    if (r.loot) out.loot = bil(r.loot);
    if (r.tac) out.tac = bil(r.tac);
    if (Array.isArray(r.poly) && r.poly.length >= 3) {
      out.poly = r.poly.filter(function (p) { return Array.isArray(p) && p.length >= 2; }).map(function (p) { return [num(p[0], 0), num(p[1], 0)]; });
    } else if (r.img) {
      out.img = { x: num(r.img.x, 0), y: num(r.img.y, 0), w: Math.max(0.01, num(r.img.w, 0.1)), h: Math.max(0.01, num(r.img.h, 0.1)) };
    }
    return out;
  }
  function coerceBudget(b) {
    if (!Array.isArray(b)) return [];
    return b.map(function (row) {
      return [row[0], (row[1] && typeof row[1] === "object") ? row[1] : bil(row[1]),
        (row[2] && typeof row[2] === "object") ? row[2] : bil(row[2]), row[3] || "—", row[4] || "—"];
    });
  }
  function coerce(obj) {
    if (!obj || typeof obj !== "object") throw new Error("not an object");
    var rooms = (obj.rooms || []).map(coerceRoom);
    if (!rooms.length) throw new Error("no rooms");
    var meta = obj.meta || {};
    var img = safeImage(meta.image);
    var D = {
      format: "ddg-dungeon", version: 1,
      meta: {
        title: bil(meta.title || obj.title || "Imported Dungeon"),
        subtitle: bil(meta.subtitle || ""),
        theme: meta.theme || "crafters",
        party: { size: num(meta.party && meta.party.size, 5), level: num(meta.party && meta.party.level, 4) },
        cell: num(meta.cell, 26),
        badge: meta.badge ? bil(meta.badge) : { en: "Custom", es: "Personalizada" },
        difficulty: meta.difficulty || "Hard",
        seed: meta.seed,
        image: img || undefined,
        imageAspect: img ? num(meta.imageAspect, 0.72) : undefined,
        imageOpacity: img ? (meta.imageOpacity != null ? num(meta.imageOpacity, 1) : 1) : undefined
      },
      rooms: rooms,
      corridors: Array.isArray(obj.corridors) ? obj.corridors : (Array.isArray(obj.cor) ? obj.cor : []),
      overview: bil(obj.overview || ""),
      notes: obj.notes ? { en: (obj.notes.en || obj.notes.es || []), es: (obj.notes.es || obj.notes.en || []) } : { en: [], es: [] },
      budget: coerceBudget(obj.budget)
    };
    var ids = {}; rooms.forEach(function (r) { ids[r.id] = 1; });
    if (!obj.entry || !ids[obj.entry]) D.entry = rooms[0].id; else D.entry = obj.entry;
    // drop corridors pointing at missing rooms
    D.corridors = D.corridors.filter(function (c) { return ids[c[0]] && ids[c[1]]; });
    return D;
  }

  // ---- blank ------------------------------------------------------------
  function blankDungeon() {
    return {
      format: "ddg-dungeon", version: 1,
      meta: { title: { en: "New Dungeon", es: "Nueva mazmorra" }, subtitle: { en: "", es: "" }, theme: "crafters",
        party: { size: 5, level: 4 }, cell: 26, badge: { en: "Custom", es: "Personalizada" }, difficulty: "Hard" },
      entry: "A",
      rooms: [{ id: "A", x: 6, y: 12, w: 6, h: 5, secret: false, feats: [], name: { en: "Entrance", es: "Entrada" }, see: { en: "", es: "" } }],
      corridors: [], overview: { en: "", es: "" }, notes: { en: [], es: [] }, budget: []
    };
  }

  // ---- image-backed: the user's EXACT map as the base ------------------
  function imageDungeon(dataUrl, aspect, title) {
    return {
      format: "ddg-dungeon", version: 1,
      meta: { title: bil(title || "Imported Map"), subtitle: { en: "", es: "" }, theme: "custom",
        party: { size: 4, level: 3 }, cell: 26, badge: { en: "Traced Map", es: "Mapa trazado" }, difficulty: "Medium",
        image: dataUrl, imageAspect: aspect || 0.72, imageOpacity: 1 },
      entry: null, rooms: [], corridors: [], overview: { en: "", es: "" }, notes: { en: [], es: [] }, budget: []
    };
  }

  // ---- ASCII grid -> rooms ---------------------------------------------
  function parseAscii(text) {
    var lines = text.replace(/\t/g, " ").split(/\r?\n/);
    var cells = {}; // letter -> {minx,miny,maxx,maxy}
    for (var y = 0; y < lines.length; y++) {
      var line = lines[y];
      for (var x = 0; x < line.length; x++) {
        var ch = line[x];
        if (/[A-Za-z0-9]/.test(ch)) {
          var c = cells[ch] || (cells[ch] = { minx: x, miny: y, maxx: x, maxy: y });
          c.minx = Math.min(c.minx, x); c.miny = Math.min(c.miny, y);
          c.maxx = Math.max(c.maxx, x); c.maxy = Math.max(c.maxy, y);
        }
      }
    }
    var keys = Object.keys(cells);
    if (!keys.length) throw new Error("no room letters found");
    var rooms = keys.map(function (k) {
      var c = cells[k];
      return { id: k, x: c.minx, y: c.miny, w: Math.max(2, c.maxx - c.minx + 1), h: Math.max(2, c.maxy - c.miny + 1),
        secret: false, feats: [], name: bil(k), see: { en: "", es: "" } };
    });
    // normalise to start near (2,2)
    var mnx = Infinity, mny = Infinity; rooms.forEach(function (r) { mnx = Math.min(mnx, r.x); mny = Math.min(mny, r.y); });
    rooms.forEach(function (r) { r.x += 2 - mnx; r.y += 2 - mny; });
    var cor = autoConnect(rooms);
    return {
      format: "ddg-dungeon", version: 1,
      meta: { title: { en: "Traced Dungeon", es: "Mazmorra trazada" }, subtitle: { en: "", es: "" }, theme: "crafters",
        party: { size: 5, level: 4 }, cell: 26, badge: { en: "Custom", es: "Personalizada" }, difficulty: "Hard" },
      entry: rooms[0].id, rooms: rooms, corridors: cor, overview: { en: "", es: "" }, notes: { en: [], es: [] }, budget: []
    };
  }
  // connect each room to its nearest axis-aligned neighbour right & below
  function autoConnect(rooms) {
    var cor = [], seen = {};
    function add(a, b) { var k = [a, b].sort().join("|"); if (!seen[k]) { seen[k] = 1; cor.push([a, b]); } }
    rooms.forEach(function (A) {
      var bestR = null, bestB = null, dR = 1e9, dB = 1e9;
      rooms.forEach(function (B) {
        if (A === B) return;
        var oy = Math.min(A.y + A.h, B.y + B.h) - Math.max(A.y, B.y);
        var ox = Math.min(A.x + A.w, B.x + B.w) - Math.max(A.x, B.x);
        if (oy >= 1 && B.x > A.x) { var g = B.x - (A.x + A.w); if (g >= -1 && g < dR) { dR = g; bestR = B; } }
        if (ox >= 1 && B.y > A.y) { var g2 = B.y - (A.y + A.h); if (g2 >= -1 && g2 < dB) { dB = g2; bestB = B; } }
      });
      if (bestR && dR <= 8) add(A.id, bestR.id);
      if (bestB && dB <= 8) add(A.id, bestB.id);
    });
    return cor;
  }

  // ---- modals -----------------------------------------------------------
  function jsonModal() {
    var body = '<p class="modal-note">' + (app.lang() === "es"
      ? "Pega un JSON de DualDungeonGen (o sube un archivo). También acepta un formato mínimo con rooms/corridors/entry."
      : "Paste a DualDungeonGen JSON (or upload a file). A minimal rooms/corridors/entry object also works.") + "</p>" +
      '<input type="file" id="jsonFile" accept=".json,application/json" style="margin-bottom:10px">' +
      '<textarea id="jsonText" placeholder=\'{ "rooms": [...], "corridors": [...], "entry": "A" }\'></textarea>';
    app.modal(app.lang() === "es" ? "Importar JSON" : "Import JSON", body, [
      { label: app.lang() === "es" ? "Cancelar" : "Cancel", onClick: app.closeModal },
      { label: app.lang() === "es" ? "Importar" : "Import", primary: true, onClick: function () {
          try {
            var txt = document.getElementById("jsonText").value.trim();
            if (!txt) { app.status(app.t("bad_json")); return; }
            var D = coerce(JSON.parse(txt));
            app.setD(D); app.closeModal(); app.status(app.t("imported"));
          } catch (e) { app.status(app.t("bad_json") + " (" + e.message + ")"); }
        } }
    ]);
    var f = document.getElementById("jsonFile");
    f.onchange = function () { var file = f.files[0]; if (!file) return; var rd = new FileReader(); rd.onload = function () { document.getElementById("jsonText").value = rd.result; }; rd.readAsText(file); };
  }

  function asciiModal() {
    var sample = "AAAA  BBBB\nAAAA##BBBB\nAAAA  BBBB\n  ##\nCCCCCC\nCCCCCC";
    var body = '<p class="modal-note">' + (app.lang() === "es"
      ? "Cada bloque de una misma letra es una sala (su rectángulo). Usa # para marcar pasillos. Se auto-conectan las salas alineadas; ajusta con la herramienta Conectar."
      : "Each block of one letter is a room (its bounding box). Use # to sketch corridors. Aligned rooms auto-connect; fine-tune with the Connect tool.") + "</p>" +
      '<textarea id="asciiText" spellcheck="false">' + sample + "</textarea>";
    app.modal(app.lang() === "es" ? "Pegar cuadrícula" : "Paste grid", body, [
      { label: app.lang() === "es" ? "Cancelar" : "Cancel", onClick: app.closeModal },
      { label: app.lang() === "es" ? "Crear mapa" : "Create map", primary: true, onClick: function () {
          try { var D = parseAscii(document.getElementById("asciiText").value); app.setD(D); app.closeModal(); app.status(app.t("imported")); if (DDG.editor) DDG.editor.setTool("select"); }
          catch (e) { app.status((app.lang() === "es" ? "No se pudo leer la cuadrícula: " : "Could not read grid: ") + e.message); }
        } }
    ]);
  }

  function imageModal() {
    var body = '<p class="modal-note">' + (app.lang() === "es"
      ? "Sube una imagen de mapa. Se usa como el mapa EXACTO (no se redibuja); marca las salas encima con la herramienta Dibujar. Para rellenar el contenido automáticamente, usa el panel «Generar con IA»."
      : "Upload a map image. It becomes the EXACT map (no redraw); mark rooms on top with the Draw tool. To fill the content automatically, use the ‘AI Generate’ panel.") + "</p>" +
      '<div class="drop" id="imgDrop">' + (app.lang() === "es" ? "Haz clic o suelta una imagen aquí" : "Click or drop an image here") + "</div>" +
      '<input type="file" id="imgFile" accept="image/*" hidden>';
    app.modal(app.lang() === "es" ? "Desde imagen" : "From image", body, [
      { label: app.lang() === "es" ? "Cerrar" : "Close", onClick: app.closeModal }
    ]);
    var drop = document.getElementById("imgDrop"), file = document.getElementById("imgFile");
    drop.onclick = function () { file.click(); };
    drop.ondragover = function (e) { e.preventDefault(); drop.style.borderColor = "#b89857"; };
    drop.ondragleave = function () { drop.style.borderColor = ""; };
    drop.ondrop = function (e) { e.preventDefault(); if (e.dataTransfer.files[0]) load(e.dataTransfer.files[0]); };
    file.onchange = function () { if (file.files[0]) load(file.files[0]); };
    function load(f) {
      loadImageAsDungeon(f, f.name ? f.name.replace(/\.[a-z]+$/i, "") : "Imported Map", function () {
        app.closeModal();
        if (DDG.editor) DDG.editor.setTool("draw");
        app.status(app.lang() === "es" ? "Mapa cargado — marca las salas encima o usa «Generar con IA»." : "Map loaded — mark rooms on top, or use ‘AI Generate’.");
      });
    }
  }

  // read a File → image-backed dungeon (measures aspect), then setD + cb
  function loadImageAsDungeon(file, title, cb) {
    var rd = new FileReader();
    rd.onload = function () {
      var url = rd.result, im = new Image();
      im.onload = function () {
        var aspect = im.naturalHeight / im.naturalWidth || 0.72;
        app.setD(imageDungeon(url, aspect, title));
        if (cb) cb();
      };
      im.onerror = function () { app.status("Could not read that image."); };
      im.src = url;
    };
    rd.readAsDataURL(file);
  }

  function start(kind) {
    if (kind === "json") jsonModal();
    else if (kind === "ascii") asciiModal();
    else if (kind === "image") imageModal();
    else if (kind === "blank") { app.setD(blankDungeon()); if (DDG.editor) DDG.editor.setTool("draw"); app.status(app.lang() === "es" ? "Lienzo en blanco — dibuja tu primera sala." : "Blank canvas — draw your first room."); }
  }

  DDG.importers = { init: init, start: start, coerce: coerce, parseAscii: parseAscii, blankDungeon: blankDungeon, imageDungeon: imageDungeon };
})(typeof window !== "undefined" ? window : globalThis);
