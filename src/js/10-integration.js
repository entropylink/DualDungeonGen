/* ============================================================
   DualDungeonGen — SHELL INTEGRATION (receive maps from Cartógrafo)
   The tab shell relays {type:"ddg-map", png, bounds, ppc, data} here.
   Flow:
     1. detect rooms EXACTLY from the Cartógrafo data (09 module) —
        the PNG is the map, polys align 1:1 by construction;
     2. load it immediately as an image-backed dungeon (clickable now);
     3. open the "describe the environment" dialog → AI writes ONLY
        the content (names, player/DM notes, monsters, traps, budget)
        via DDG.ai (bridge or BYOK) and it's merged room by room.
   ============================================================ */
(function (root) {
  "use strict";
  var DDG = root.DDG || (root.DDG = {});
  if (typeof document === "undefined") return;

  var lastRooms = null, lastAdjacency = null;

  var L = function () { return (DDG.app && DDG.app.lang && DDG.app.lang()) || "en"; };
  var T = {
    en: {
      received: "Map received from the Cartógrafo — %s rooms detected exactly.",
      dlgTitle: "Describe the environment", guide: "What is this dungeon? (theme, difficulty, mechanics, monsters or none…)",
      ph: "an abandoned dwarven mine reclaimed by kobolds, medium difficulty, a couple of traps, one mini-boss",
      size: "Party size", level: "Level", gen: "Generate notes with AI", geomOnly: "Geometry only (fill by hand)",
      tip: "Tip: rooms are split by doors and walls. One giant space? Add doors in the Cartógrafo and re-send.",
      working: "Writing the adventure…", genErr: "Generation failed: ", genOk: "Notes generated — click any room.",
      noprov: "No AI available: run the local bridge or save an API key in the AI panel.", roomN: "Room", cancel: "Cancel"
    },
    es: {
      received: "Mapa recibido del Cartógrafo — %s cuartos detectados exactamente.",
      dlgTitle: "Describe el ambiente", guide: "¿De qué va esta mazmorra? (tema, dificultad, mecánicas, monstruos o ninguno…)",
      ph: "una mina enana abandonada tomada por kobolds, dificultad media, un par de trampas, un mini-jefe",
      size: "Tamaño del grupo", level: "Nivel", gen: "Generar notas con IA", geomOnly: "Solo geometría (llenar a mano)",
      tip: "Tip: los cuartos se separan por puertas y muros. ¿Un solo espacio gigante? Pon puertas en el Cartógrafo y reenvía.",
      working: "Escribiendo la aventura…", genErr: "Falló la generación: ", genOk: "Notas generadas — haz clic en cualquier cuarto.",
      noprov: "Sin IA disponible: corre el puente local o guarda una clave API en el panel de IA.", roomN: "Sala", cancel: "Cancelar"
    }
  };
  function t(k) { return (T[L()] && T[L()][k]) || T.en[k]; }
  function fmt(s, v) { return s.replace("%s", v); }
  function esc(s) { return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }

  // ---- build the exact image-backed dungeon from a shell message --------
  function dungeonFromMessage(msg) {
    var det = DDG.roomsFromCartografo(msg.data, msg.bounds);
    lastRooms = det.rooms; lastAdjacency = det.adjacency;
    var w = msg.bounds.maxX - msg.bounds.minX, h = msg.bounds.maxY - msg.bounds.minY;
    var entry = null;
    det.rooms.forEach(function (r) { if (!entry && r.stairs) entry = r.id; });
    if (!entry && det.rooms.length) entry = det.rooms[0].id;
    var rooms = det.rooms.map(function (r) {
      var name = (r.labels && r.labels[0]) ? { en: r.labels[0], es: r.labels[0] }
        : { en: "Room " + r.id, es: "Sala " + r.id };
      return { id: r.id, poly: r.poly, secret: false, feats: [], name: name, see: { en: "", es: "" } };
    });
    return {
      format: "ddg-dungeon", version: 1,
      meta: {
        title: { en: "Cartógrafo Map", es: "Mapa del Cartógrafo" },
        subtitle: { en: "", es: "" }, theme: "custom",
        party: { size: 4, level: 3 }, cell: 26,
        badge: { en: "Exact Map", es: "Mapa Exacto" }, difficulty: "Medium",
        image: msg.png, imageAspect: h / w, imageOpacity: 1
      },
      entry: entry, rooms: rooms, corridors: [],
      overview: { en: "", es: "" }, notes: { en: [], es: [] }, budget: []
    };
  }

  function handleMap(msg) {
    try {
      var D = DDG.importers.coerce(dungeonFromMessage(msg));
      DDG.app.setD(D);
      DDG.app.status(fmt(t("received"), D.rooms.length));
      if (DDG.ai && DDG.ai.refreshPanel) DDG.ai.refreshPanel();
      openDescribe();
    } catch (e) {
      DDG.app.status("Import error: " + e.message);
    }
  }

  // ---- describe dialog ----------------------------------------------------
  function openDescribe() {
    var D = DDG.app.D; if (!D) return;
    if (DDG.ai && DDG.ai.probe) DDG.ai.probe(); // pick up a just-started local bridge
    var party = D.meta.party || { size: 4, level: 3 };
    var body =
      '<label class="fld"><span>' + t("guide") + '</span>' +
      '<textarea id="dscGuide" rows="4" placeholder="' + esc(t("ph")) + '"></textarea></label>' +
      '<div class="fld-row">' +
      '<label class="fld"><span>' + t("size") + '</span><input id="dscSize" type="number" min="1" max="12" value="' + party.size + '"></label>' +
      '<label class="fld"><span>' + t("level") + '</span><input id="dscLevel" type="number" min="1" max="20" value="' + party.level + '"></label>' +
      "</div>" +
      '<p class="modal-note">' + t("tip") + "</p>" +
      '<p class="tool-hint" id="dscStatus"></p>';
    DDG.app.modal(t("dlgTitle"), body, [
      { label: t("geomOnly"), onClick: function () { DDG.app.closeModal(); } },
      { label: t("gen"), primary: true, onClick: runGeneration }
    ]);
  }

  function runGeneration() {
    var D = DDG.app.D; if (!D) return;
    if (!DDG.ai || !DDG.ai.status().ready) { setDlgStatus(t("noprov"), true); return; }
    if (!lastRooms) { // dungeon didn't come from the Cartógrafo this session — derive facts from D
      lastRooms = D.rooms.map(function (r) {
        return { id: r.id, sizeFt2: 0, water: false, stairs: 0, props: [], labels: [DDG.app.tx(r.name)].filter(Boolean) };
      });
      lastAdjacency = [];
    }
    var guidance = (document.getElementById("dscGuide").value || "").trim();
    var party = {
      size: parseInt(document.getElementById("dscSize").value, 10) || 4,
      level: parseInt(document.getElementById("dscLevel").value, 10) || 3
    };
    D.meta.party = party;
    var t0 = Date.now();
    var tick = setInterval(function () { setDlgStatus(t("working") + " (" + Math.round((Date.now() - t0) / 1000) + "s)"); }, 1000);
    setDlgStatus(t("working"));
    lockDlg(true);
    DDG.ai.generateContent({ rooms: lastRooms, adjacency: lastAdjacency, guidance: guidance, party: party })
      .then(function (content) {
        clearInterval(tick);
        mergeContent(D, content);
        DDG.app.closeModal();
        DDG.app.render();
        DDG.app.status(t("genOk") + " (" + Math.round((Date.now() - t0) / 1000) + "s)");
      })
      .catch(function (e) {
        clearInterval(tick); lockDlg(false);
        setDlgStatus(t("genErr") + (e.message === "no-provider" ? t("noprov") : e.message), true);
      });
  }
  function setDlgStatus(msg, isErr) {
    var el = document.getElementById("dscStatus"); if (!el) return;
    el.textContent = msg; el.style.color = isErr ? "var(--crimson)" : "var(--gold)";
  }
  function lockDlg(on) {
    document.querySelectorAll("#modalFoot .btn").forEach(function (b) { b.disabled = on; });
  }

  // ---- merge AI content into the geometric dungeon ------------------------
  function bil(x) {
    if (x == null) return null;
    if (typeof x === "string") return { en: x, es: x };
    return { en: x.en != null ? x.en : x.es, es: x.es != null ? x.es : x.en };
  }
  function mergeContent(D, c) {
    if (!c || typeof c !== "object") throw new Error("bad content JSON");
    if (c.meta) {
      if (c.meta.title) D.meta.title = bil(c.meta.title);
      if (c.meta.subtitle) D.meta.subtitle = bil(c.meta.subtitle);
      if (c.meta.badge) D.meta.badge = bil(c.meta.badge);
      if (c.meta.difficulty) D.meta.difficulty = c.meta.difficulty;
    }
    if (c.overview) D.overview = bil(c.overview);
    if (c.notes) D.notes = { en: c.notes.en || c.notes.es || [], es: c.notes.es || c.notes.en || [] };
    if (Array.isArray(c.budget)) {
      D.budget = c.budget.map(function (row) {
        return [row[0], bil(row[1]) || { en: "", es: "" }, bil(row[2]) || { en: "", es: "" }, row[3] || "—", row[4] || "—"];
      });
    }
    var cr = c.rooms || {};
    D.rooms.forEach(function (r) {
      var x = cr[r.id]; if (!x) return;
      if (x.name) r.name = bil(x.name);
      if (x.see) r.see = bil(x.see);
      if (x.trap) r.trap = bil(x.trap); else delete r.trap;
      if (x.loot) r.loot = bil(x.loot); else delete r.loot;
      if (x.tac) r.tac = bil(x.tac); else delete r.tac;
      if (typeof x.secret === "boolean") r.secret = x.secret;
      if (x.mon && (x.mon.en || x.mon.es || Array.isArray(x.mon))) {
        var en = Array.isArray(x.mon) ? x.mon : (x.mon.en || x.mon.es || []);
        var es = Array.isArray(x.mon) ? x.mon : (x.mon.es || x.mon.en || []);
        if (en.length) { r.mon = { en: en, es: es }; r.tokens = DDG.tokensFor({ mon: en }); }
        else { delete r.mon; delete r.tokens; }
      } else { delete r.mon; delete r.tokens; }
    });
  }

  // ---- shell wiring --------------------------------------------------------
  // A map is only accepted from OUR shell: we must be embedded and the
  // message must come from the direct parent window (the shell relays the
  // Cartógrafo's map to us). This blocks a hostile page that embeds the
  // studio, or a sibling/opener, from injecting a map/image.
  var shellOrigin = null;
  window.addEventListener("message", function (e) {
    var d = e.data;
    if (!d || typeof d !== "object") return;
    if (d.type === "ddg-shell-hello" && e.source === window.parent) { shellOrigin = e.origin; return; }
    if (d.type === "ddg-map") {
      if (window.parent === window || e.source !== window.parent) return;      // not from our shell
      if (shellOrigin !== null && e.origin !== shellOrigin) return;            // origin drift
      if (d.data && d.bounds && d.png) handleMap(d);
    }
  });
  function announceReady() {
    if (window.parent !== window) {
      try { window.parent.postMessage({ type: "ddg-studio-ready" }, "*"); } catch (e) {}
    }
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", announceReady); else announceReady();

  DDG.integration = { openDescribe: openDescribe, mergeContent: mergeContent, dungeonFromMessage: dungeonFromMessage, _handleMap: handleMap };
})(typeof window !== "undefined" ? window : globalThis);
