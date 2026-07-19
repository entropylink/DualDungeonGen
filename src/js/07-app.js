/* ============================================================
   DualDungeonGen — APP (state, dual preview, inspector, wiring)
   Owns the single source of truth `state.D` (a dungeon object) and
   re-renders both maps + the inspector from it. Geometry editing is
   delegated to DDG.editor; import/export to DDG.importers/exporter.
   ============================================================ */
(function (root) {
  "use strict";
  var DDG = root.DDG || (root.DDG = {});
  if (typeof document === "undefined") return; // node harness: skip UI

  // ---------- bilingual app chrome --------------------------------------
  var UI = {
    en: {
      generate: "Generate", reroll: "Re-roll seed", import: "Import ▾", export: "Export ▾",
      imp_json: "From JSON…", imp_image: "From image…", imp_ascii: "Paste grid…", imp_blank: "Blank canvas",
      exp_html: "Interactive HTML", exp_json: "JSON (re-importable)", exp_png_dm: "PNG · DM map", exp_png_pl: "PNG · Player map",
      params_h: "Parameters", p_theme: "Theme", p_size: "Party size", p_level: "Level", p_rooms: "Rooms",
      p_diff: "Climax", diff_hard: "Hard", diff_deadly: "Deadly", p_seed: "Seed", random: "Random",
      generate_full: "Generate dungeon", tools_h: "Map editor",
      tool_select: "Select / move", tool_draw: "Draw room", tool_connect: "Connect rooms", tool_secret: "Toggle secret", tool_delete: "Delete room",
      hint_select: "Click a room to select it, then drag to move. Drag a corner handle to resize.",
      hint_draw: "Drag on the grid to draw a new room.",
      hint_draw_poly: "Click around a room to trace its outline; click the first point (or Enter) to finish, Esc to cancel.",
      hint_select_poly: "Click a room to select it. Drag its interior to move, or drag a corner dot to reshape the outline.",
      hint_connect: "Click one room, then another, to link them with a corridor. Click a corridor to remove it.",
      hint_secret: "Click a room to toggle its secret flag (hidden on the Player map).",
      hint_delete: "Click a room to delete it.",
      img_opacity: "Map image opacity", img_clear: "Remove reference image",
      meta_h: "Dungeon info", m_title: "Title", m_sub: "Subtitle", m_overview: "Overview / hook",
      dm_map: "DM Map", player_map: "Player Map", click_hint: "Click a room for details", handout: "Clean handout",
      ready: "Ready.",
      overview_h: "The Job", dm_notes_h: "Running it", budget_h: "Encounter budget",
      see: "What you see", monsters: "Monsters", trap: "Trap", loot: "Loot", running: "Running it",
      edit: "Edit", done: "Done", deselect: "◂ Overview", entry_flag: "Entrance room", secret_flag: "Secret room",
      m_name: "Room name", m_mon: "Monsters (one per line, e.g. 2× Skeleton (CR ¼))", m_trap: "Trap", m_loot: "Loot", m_tac: "Tactics",
      feats: "Furniture", pos: "Grid position", make_entry: "Make entrance", no_room: "No content yet — select or draw a room.",
      copied: "Copied to clipboard.", generated: "Generated ", imported: "Imported dungeon.",
      badge_party: "%s × Level %s", badge_len: "one session",
      bad_json: "That doesn't look like a valid dungeon JSON.", room_count: "%s rooms"
    },
    es: {
      generate: "Generar", reroll: "Nueva semilla", import: "Importar ▾", export: "Exportar ▾",
      imp_json: "Desde JSON…", imp_image: "Desde imagen…", imp_ascii: "Pegar cuadrícula…", imp_blank: "Lienzo en blanco",
      exp_html: "HTML interactivo", exp_json: "JSON (reimportable)", exp_png_dm: "PNG · Mapa DM", exp_png_pl: "PNG · Mapa jugador",
      params_h: "Parámetros", p_theme: "Tema", p_size: "Tamaño del grupo", p_level: "Nivel", p_rooms: "Salas",
      p_diff: "Clímax", diff_hard: "Difícil", diff_deadly: "Mortal", p_seed: "Semilla", random: "Aleatoria",
      generate_full: "Generar mazmorra", tools_h: "Editor del mapa",
      tool_select: "Seleccionar / mover", tool_draw: "Dibujar sala", tool_connect: "Conectar salas", tool_secret: "Alternar secreto", tool_delete: "Borrar sala",
      hint_select: "Haz clic en una sala para seleccionarla y arrástrala para moverla. Arrastra una esquina para redimensionar.",
      hint_draw: "Arrastra sobre la cuadrícula para dibujar una sala nueva.",
      hint_draw_poly: "Haz clic alrededor de una sala para trazar su contorno; clic en el primer punto (o Enter) para terminar, Esc para cancelar.",
      hint_select_poly: "Haz clic en una sala para seleccionarla. Arrastra su interior para moverla, o un punto de esquina para reformar el contorno.",
      hint_connect: "Haz clic en una sala y luego en otra para unirlas con un pasillo. Haz clic en un pasillo para quitarlo.",
      hint_secret: "Haz clic en una sala para alternar su marca de secreto (oculta en el mapa del jugador).",
      hint_delete: "Haz clic en una sala para borrarla.",
      img_opacity: "Opacidad de la imagen del mapa", img_clear: "Quitar imagen de referencia",
      meta_h: "Info de la mazmorra", m_title: "Título", m_sub: "Subtítulo", m_overview: "Resumen / gancho",
      dm_map: "Mapa del DM", player_map: "Mapa del jugador", click_hint: "Haz clic en una sala para ver detalles", handout: "Copia limpia",
      ready: "Listo.",
      overview_h: "El encargo", dm_notes_h: "Cómo dirigirlo", budget_h: "Presupuesto de combate",
      see: "Lo que ves", monsters: "Monstruos", trap: "Trampa", loot: "Botín", running: "Cómo dirigirlo",
      edit: "Editar", done: "Listo", deselect: "◂ Resumen", entry_flag: "Sala de entrada", secret_flag: "Sala secreta",
      m_name: "Nombre de la sala", m_mon: "Monstruos (uno por línea, p. ej. 2× Esqueleto (VD ¼))", m_trap: "Trampa", m_loot: "Botín", m_tac: "Tácticas",
      feats: "Mobiliario", pos: "Posición en la cuadrícula", make_entry: "Marcar como entrada", no_room: "Sin contenido — selecciona o dibuja una sala.",
      copied: "Copiado al portapapeles.", generated: "Generada ", imported: "Mazmorra importada.",
      badge_party: "%s × Nivel %s", badge_len: "una sesión",
      bad_json: "Eso no parece un JSON de mazmorra válido.", room_count: "%s salas"
    }
  };

  var FEAT_LIST = ["looms", "tapestry", "kiln", "anvil", "anvil2", "bellows", "benches", "lathe",
    "shelves", "crates", "vat", "crest", "desk", "deskbig", "cases", "columns", "plinth", "bookshelf",
    "safe", "altar", "sarcophagus", "pool", "rubble", "stalagmites", "throne", "table", "beds",
    "cauldron", "barrels", "brazier"];

  var state = { D: null, lang: "en", selected: null, tool: "select", editRoom: false };

  // ---------- helpers ----------------------------------------------------
  function $(id) { return document.getElementById(id); }
  function t(k) { return (UI[state.lang] && UI[state.lang][k]) || UI.en[k] || k; }
  function tx(field) { if (!field) return ""; return field[state.lang] != null ? field[state.lang] : field.en; }
  function esc(s) { return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }
  function escAttr(s) { return esc(s).replace(/"/g, "&quot;"); }
  // overview/notes may carry intentional <b>/<i> from the AI or an imported
  // file — escape everything, then re-allow ONLY those inline tags (no
  // attributes survive, so <img onerror>/<script> stay inert). Kills the XSS.
  function san(s) {
    return esc(s).replace(/&lt;(\/?)(b|i|em|strong)&gt;/gi, "<$1$2>").replace(/&lt;br\s*\/?&gt;/gi, "<br>");
  }
  function fmt(str) { var a = Array.prototype.slice.call(arguments, 1); var i = 0; return str.replace(/%s/g, function () { return a[i++]; }); }
  function status(msg) { $("status").textContent = msg; }
  function isSecret(id) { var r = DDG.room(state.D, id); return r && r.secret; }

  // ---------- persistence (localStorage, debounced) ----------------------
  // Auto-saves the working dungeon so a reload doesn't lose it. Big base
  // images can blow the ~5MB quota — that's caught and reported, not fatal.
  var PERSIST_KEY = "ddg_studio_dungeon_v1";
  var persistTimer = null, persistBlocked = false;
  function persist() {
    if (persistBlocked) return;
    clearTimeout(persistTimer);
    persistTimer = setTimeout(function () {
      if (!state.D) return;
      try { localStorage.setItem(PERSIST_KEY, JSON.stringify(state.D)); }
      catch (e) { persistBlocked = true; status(state.lang === "es" ? "Mapa muy grande para autoguardado — exporta el JSON para no perderlo." : "Map too large to auto-save — export the JSON to keep it."); }
    }, 700);
  }
  function loadPersist() {
    try { var s = localStorage.getItem(PERSIST_KEY); if (!s) return null; var o = JSON.parse(s); return (o && o.rooms && o.rooms.length) ? o : null; }
    catch (e) { return null; }
  }
  function clearPersist() { try { localStorage.removeItem(PERSIST_KEY); } catch (e) {} persistBlocked = false; }

  // ---------- render -----------------------------------------------------
  function renderMaps() {
    var D = state.D; if (!D) return;
    var dm = DDG.renderMapSVG(D, "dm", state.selected);
    var plSel = (state.selected && !isSecret(state.selected)) ? state.selected : null;
    var pl = DDG.renderMapSVG(D, "player", plSel);
    var mDM = $("mapDM"), mPL = $("mapPL");
    mDM.setAttribute("viewBox", dm.vb); mDM.innerHTML = dm.inner;
    mPL.setAttribute("viewBox", pl.vb); mPL.innerHTML = pl.inner;
    if (DDG.editor && DDG.editor.afterRender) DDG.editor.afterRender();
    persist();
  }

  function buildLegend() {
    var items = [["lg-door", { en: "Door", es: "Puerta" }], ["lg-stairs", { en: "Entrance", es: "Entrada" }],
      ["lg-mon", { en: "Monster", es: "Monstruo" }], ["lg-trap", { en: "Trap", es: "Trampa" }],
      ["lg-loot", { en: "Loot", es: "Botín" }], ["lg-sec", { en: "Secret", es: "Secreto" }]];
    $("legend").innerHTML = items.map(function (it) { return '<span><i class="' + it[0] + '"></i>' + esc(tx(it[1])) + "</span>"; }).join("");
  }

  function headerCard() {
    var D = state.D, m = D.meta;
    var party = fmt(t("badge_party"), m.party.size, m.party.level);
    var diff = (m.difficulty || "") + " · " + t("badge_len");
    var theme = tx(m.badge || { en: m.theme, es: m.theme });
    return '<div class="card"><h2>' + esc(tx(m.title)) + "</h2>" +
      '<div class="muted" style="font-style:italic;font-size:13.5px">' + esc(tx(m.subtitle)) + "</div>" +
      '<div class="badges"><span class="badge">' + esc(party) + '</span><span class="badge">' + esc(diff) +
      '</span><span class="badge">' + esc(theme) + "</span></div></div>";
  }

  function overviewCard() {
    var D = state.D;
    return '<div class="card"><h2>' + t("overview_h") + "</h2><p>" + san(tx(D.overview)) + "</p></div>";
  }
  function notesCard() {
    var D = state.D, notes = (D.notes && D.notes[state.lang]) || (D.notes && D.notes.en) || [];
    return '<div class="notes"><h3>' + t("dm_notes_h") + "</h3><ul>" +
      notes.map(function (n) { return "<li>" + san(n) + "</li>"; }).join("") + "</ul></div>";
  }
  function budgetCard() {
    var D = state.D; if (!D.budget || !D.budget.length) return "";
    var rows = D.budget.map(function (b) {
      var name = b[1] && b[1][state.lang] != null ? b[1][state.lang] : (b[1] && b[1].en) || b[1];
      var cont = b[2] && b[2][state.lang] != null ? b[2][state.lang] : (b[2] && b[2].en) || b[2];
      return '<tr><td class="b-id">' + esc(b[0]) + "</td><td>" + esc(name) + "</td><td>" + esc(cont) +
        "</td><td>" + esc(b[3]) + '</td><td class="b-diff">' + esc(b[4]) + "</td></tr>";
    }).join("");
    return '<div class="notes" style="margin-top:13px"><h3>' + t("budget_h") + '</h3><table class="budget">' + rows + "</table></div>";
  }

  function roomView(id) {
    var r = DDG.room(state.D, id); if (!r) return "";
    var h = '<div class="card"><button class="btn tiny" id="btnDeselect" style="margin-bottom:8px">' + t("deselect") + "</button>" +
      '<button class="btn tiny toggle-edit" id="btnEditRoom">✎ ' + t("edit") + "</button>" +
      "<h2>" + esc(tx(r.name)) + ' <small>· ' + esc(r.id) + (r.secret ? " · " + t("secret_flag") : "") + (state.D.entry === r.id ? " · " + t("entry_flag") : "") + "</small></h2>";
    h += '<div class="row"><span class="lbl">' + t("see") + '</span><div class="read">' + esc(tx(r.see)) + "</div></div>";
    if (r.mon && (r.mon.en || r.mon.es)) {
      var mon = (r.mon[state.lang] || r.mon.en) || [];
      h += '<div class="row"><span class="lbl">' + t("monsters") + "</span>" + mon.map(function (m) { return '<span class="tag mon">' + esc(m) + "</span>"; }).join("") + "</div>";
    }
    if (r.trap) h += '<div class="row"><span class="lbl">' + t("trap") + '</span><div class="tac">' + esc(tx(r.trap)) + "</div></div>";
    if (r.loot) h += '<div class="row"><span class="lbl">' + t("loot") + '</span><div class="tac">' + esc(tx(r.loot)) + "</div></div>";
    if (r.tac) h += '<div class="row"><span class="lbl">' + t("running") + '</span><div class="tac">' + esc(tx(r.tac)) + "</div></div>";
    h += "</div>";
    return h;
  }

  function roomEdit(id) {
    var r = DDG.room(state.D, id); if (!r) return "";
    var L = state.lang;
    function ta(field, key, rows) { var v = r[field] ? (r[field][L] != null ? r[field][L] : r[field].en) : ""; return '<label class="fld"><span>' + t(key) + '</span><textarea rows="' + (rows || 2) + '" data-ef="' + field + '">' + esc(v) + "</textarea></label>"; }
    var monStr = r.mon ? ((r.mon[L] || r.mon.en) || []).join("\n") : "";
    var h = '<div class="card"><button class="btn tiny" id="btnDoneRoom" style="margin-bottom:8px">✓ ' + t("done") + "</button>" +
      '<h2 style="margin-bottom:8px">' + esc(r.id) + "</h2>";
    h += '<label class="fld"><span>' + t("m_name") + '</span><input type="text" data-ef="name" value="' + escAttr(tx(r.name)) + '"></label>';
    h += ta("see", "see", 3);
    h += '<label class="fld"><span>' + t("m_mon") + '</span><textarea rows="2" data-efmon="1">' + esc(monStr) + "</textarea></label>";
    h += ta("trap", "m_trap", 2) + ta("loot", "m_loot", 2) + ta("tac", "m_tac", 3);
    // pos
    h += '<div class="row"><span class="lbl">' + t("pos") + '</span><div class="edit-grid">' +
      posInput("x", r.x) + posInput("y", r.y) + posInput("w", r.w) + posInput("h", r.h) + "</div></div>";
    // flags
    h += '<div class="edit-actions"><label class="chip ' + (r.secret ? "on" : "") + '"><input type="checkbox" id="efSecret" ' + (r.secret ? "checked" : "") + ' style="display:none">✶ ' + t("secret_flag") + "</label>" +
      '<button class="btn tiny" id="efEntry">' + t("make_entry") + "</button></div>";
    // feats
    h += '<div class="row"><span class="lbl">' + t("feats") + '</span><div class="chips" id="featChips">' +
      FEAT_LIST.map(function (f) { var on = (r.feats || []).indexOf(f) >= 0; return '<span class="chip ' + (on ? "on" : "") + '" data-feat="' + f + '">' + f + "</span>"; }).join("") + "</div></div>";
    h += "</div>";
    return h;
  }
  function posInput(k, v) { return '<label class="fld"><span>' + k.toUpperCase() + '</span><input type="number" data-pos="' + k + '" value="' + v + '"></label>'; }

  function renderInspector() {
    var D = state.D, h = headerCard();
    if (state.selected && DDG.room(D, state.selected)) {
      h += state.editRoom ? roomEdit(state.selected) : roomView(state.selected);
    } else {
      state.selected = null;
      h += overviewCard() + notesCard() + budgetCard();
    }
    $("inspector").innerHTML = h;
    wireInspector();
  }

  function renderAll() { syncControls(); renderMaps(); buildLegend(); renderInspector(); }

  // ---------- inspector wiring ------------------------------------------
  function wireInspector() {
    var de = $("btnDeselect"); if (de) de.onclick = function () { select(null); };
    var ed = $("btnEditRoom"); if (ed) ed.onclick = function () { state.editRoom = true; renderInspector(); };
    var dn = $("btnDoneRoom"); if (dn) dn.onclick = function () { state.editRoom = false; renderInspector(); };
    if (!state.selected || !state.editRoom) return;
    var r = DDG.room(state.D, state.selected); if (!r) return;
    var L = state.lang;
    function setBil(field, val) { if (!r[field] || typeof r[field] !== "object") r[field] = { en: "", es: "" }; r[field][L] = val; }

    Array.prototype.forEach.call(document.querySelectorAll("#inspector [data-ef]"), function (el) {
      el.oninput = function () {
        var f = el.getAttribute("data-ef");
        if (f === "name") setBil("name", el.value); else setBil(f, el.value);
        if (f === "name") renderMaps();
        renderMaps();
      };
    });
    var monEl = document.querySelector("#inspector [data-efmon]");
    if (monEl) monEl.oninput = function () {
      var lines = monEl.value.split("\n").map(function (s) { return s.trim(); }).filter(Boolean);
      if (!r.mon) r.mon = { en: [], es: [] };
      r.mon[L] = lines;
      if (!r.mon.en) r.mon.en = lines; if (!r.mon.es) r.mon.es = lines;
      r.tokens = deriveTokens(lines);
      renderMaps();
    };
    Array.prototype.forEach.call(document.querySelectorAll("#inspector [data-pos]"), function (el) {
      el.onchange = function () { var k = el.getAttribute("data-pos"); var v = parseInt(el.value, 10); if (isFinite(v)) { r[k] = v; renderMaps(); } };
    });
    var sec = $("efSecret"); if (sec) sec.parentNode.onclick = function (e) { e.preventDefault(); r.secret = !r.secret; renderMaps(); renderInspector(); };
    var ent = $("efEntry"); if (ent) ent.onclick = function () { state.D.entry = r.id; renderMaps(); renderInspector(); };
    Array.prototype.forEach.call(document.querySelectorAll("#featChips .chip"), function (ch) {
      ch.onclick = function () {
        var f = ch.getAttribute("data-feat"); if (!r.feats) r.feats = [];
        var i = r.feats.indexOf(f); if (i >= 0) r.feats.splice(i, 1); else r.feats.push(f);
        ch.classList.toggle("on"); renderMaps();
      };
    });
  }

  function deriveTokens(lines) {
    var out = [];
    lines.forEach(function (s) {
      var count = 1, cm = s.match(/^\s*(\d+)\s*[x×]/i); if (cm) count = Math.min(4, parseInt(cm[1], 10));
      var cr = 1, crm = s.match(/(?:CR|VD)\s*([\d.¼½¾/⅛]+)/i); if (crm) cr = DDG.parseFrac(crm[1]);
      var name = s.replace(/^\s*\d+\s*[x×]\s*/i, "").replace(/\s*\(.*$/, "").trim();
      var tk = name.split(/\s+/).map(function (w) { return w[0] || ""; }).join("").slice(0, 3).toUpperCase() || "M";
      for (var i = 0; i < count; i++) out.push({ t: tk, cr: cr });
    });
    return out.slice(0, 4);
  }

  // ---------- selection --------------------------------------------------
  function select(id) { state.selected = id; state.editRoom = false; renderMaps(); renderInspector(); }
  DDG._select = select;

  // ---------- parameter <-> state sync ----------------------------------
  function readParams() {
    return {
      theme: $("pTheme").value,
      party: { size: clampInt($("pSize").value, 1, 12, 5), level: clampInt($("pLevel").value, 1, 20, 4) },
      rooms: clampInt($("pRooms").value, 5, 9, 7),
      difficulty: $("pDiff").value,
      seed: clampInt($("pSeed").value, 0, 1e9, 1)
    };
  }
  function clampInt(v, lo, hi, def) { v = parseInt(v, 10); if (!isFinite(v)) return def; return Math.max(lo, Math.min(hi, v)); }
  function syncControls() {
    var D = state.D; if (!D) return;
    if (D.meta.theme) $("pTheme").value = D.meta.theme;
    $("pSize").value = D.meta.party.size; $("pLevel").value = D.meta.party.level;
    if (D.meta.seed != null) $("pSeed").value = D.meta.seed;
    $("mTitle").value = tx(D.meta.title); $("mSub").value = tx(D.meta.subtitle);
    $("mOverview").value = tx(D.overview);
    updateImageControls();
  }
  function updateImageControls() {
    var D = state.D, img = D && D.meta && D.meta.image;
    $("imgOpacityWrap").hidden = !img;
    $("btnClearImg").hidden = true; // deprecated for image-backed maps
    if (img) $("imgOpacity").value = Math.round((D.meta.imageOpacity != null ? D.meta.imageOpacity : 1) * 100);
  }

  // ---------- generate ---------------------------------------------------
  function generate() {
    var p = readParams();
    state.D = DDG.generate(p);
    state.selected = null; state.editRoom = false;
    renderAll();
    status(t("generated") + tx(state.D.meta.title));
  }
  function reroll() { $("pSeed").value = Math.floor(Math.random() * 1e9); generate(); }

  // expose a small context for other modules
  DDG.app = {
    get state() { return state; }, get D() { return state.D; },
    setD: function (D) { state.D = D; state.selected = null; state.editRoom = false; renderAll(); },
    render: renderAll, renderMaps: renderMaps, renderInspector: renderInspector,
    select: select, status: status, t: t, tx: tx, lang: function () { return state.lang; },
    modal: modal, closeModal: closeModal, FEAT_LIST: FEAT_LIST, clearPersist: clearPersist
  };

  // ---------- modal ------------------------------------------------------
  function modal(title, bodyHTML, footButtons) {
    $("modalTitle").textContent = title;
    $("modalBody").innerHTML = bodyHTML;
    var foot = $("modalFoot"); foot.innerHTML = "";
    (footButtons || []).forEach(function (b) {
      var el = document.createElement("button"); el.className = "btn" + (b.primary ? " primary" : "");
      el.textContent = b.label; el.onclick = b.onClick; foot.appendChild(el);
    });
    $("modalBackdrop").hidden = false;
  }
  function closeModal() { $("modalBackdrop").hidden = true; $("modalBody").innerHTML = ""; }

  // ---------- static text + language ------------------------------------
  function applyStaticText() {
    Array.prototype.forEach.call(document.querySelectorAll("[data-t]"), function (el) { el.textContent = t(el.getAttribute("data-t")); });
    Array.prototype.forEach.call(document.querySelectorAll("[data-t-title]"), function (el) { el.title = t(el.getAttribute("data-t-title")); });
    document.documentElement.lang = state.lang;
    updateToolHint();
  }
  function setLang(l) {
    state.lang = l;
    Array.prototype.forEach.call(document.querySelectorAll("#langToggle button"), function (b) { b.classList.toggle("active", b.dataset.lang === l); });
    applyStaticText(); renderAll();
  }

  function updateToolHint() {
    var map = { select: "hint_select", draw: "hint_draw", connect: "hint_connect", secret: "hint_secret", delete: "hint_delete" };
    var key = map[state.tool] || "hint_select";
    var imgBacked = state.D && state.D.meta && state.D.meta.image;
    if (state.tool === "draw" && imgBacked) key = "hint_draw_poly";
    if (state.tool === "select" && imgBacked) key = "hint_select_poly";
    $("toolHint").textContent = t(key);
  }
  function setTool(tool) {
    state.tool = tool;
    Array.prototype.forEach.call(document.querySelectorAll("#toolbar .tool"), function (b) { b.classList.toggle("active", b.dataset.tool === tool); });
    var w = $("wrapDM"); w.className = w.className.replace(/\btool-\w+\b/g, "").trim() + " tool-" + tool;
    updateToolHint();
    if (DDG.editor && DDG.editor.onTool) DDG.editor.onTool(tool);
    renderMaps(); // reflect handles for the (de)selected room per current tool
  }
  DDG.app.setTool = setTool;

  // ---------- wiring -----------------------------------------------------
  function wire() {
    $("btnGenerate").onclick = generate;
    $("btnGenerate2").onclick = generate;
    $("btnReroll").onclick = reroll;
    $("btnRandSeed").onclick = function () { $("pSeed").value = Math.floor(Math.random() * 1e9); };
    $("langToggle").onclick = function (e) { var b = e.target.closest("button"); if (b) setLang(b.dataset.lang); };

    // toolbar
    $("toolbar").onclick = function (e) { var b = e.target.closest(".tool"); if (b) setTool(b.dataset.tool); };

    // menus
    document.querySelectorAll("[data-menu]").forEach(function (btn) {
      btn.onclick = function (e) { e.stopPropagation(); var m = $(btn.getAttribute("data-menu")); var open = !m.hidden; closeMenus(); m.hidden = open; };
    });
    document.addEventListener("click", closeMenus);
    $("importMenu").onclick = function (e) { var b = e.target.closest("[data-imp]"); if (b && DDG.importers) { closeMenus(); DDG.importers.start(b.dataset.imp); } };
    $("exportMenu").onclick = function (e) { var b = e.target.closest("[data-exp]"); if (b && DDG.exporter) { closeMenus(); DDG.exporter.run(b.dataset.exp); } };

    // meta inputs
    $("mTitle").oninput = function () { setMetaBil("title", $("mTitle").value); renderInspector(); };
    $("mSub").oninput = function () { setMetaBil("subtitle", $("mSub").value); renderInspector(); };
    $("mOverview").oninput = function () { var L = state.lang; if (!state.D.overview) state.D.overview = { en: "", es: "" }; state.D.overview[L] = $("mOverview").value; renderInspector(); };

    // image opacity
    $("imgOpacity").oninput = function () {
      var D = state.D; if (D && D.meta && D.meta.image) { D.meta.imageOpacity = (parseInt($("imgOpacity").value, 10) || 100) / 100; renderMaps(); }
    };
    $("btnClearImg").onclick = function () { /* deprecated for image-backed maps */ };

    // modal close
    $("modalClose").onclick = closeModal;
    $("modalBackdrop").onclick = function (e) { if (e.target === $("modalBackdrop")) closeModal(); };
    document.addEventListener("keydown", function (e) { if (e.key === "Escape") { closeModal(); closeMenus(); } });

    // map clicks (selection) — editor may intercept for geometry tools
    ["mapDM", "mapPL"].forEach(function (mid) {
      $(mid).addEventListener("click", function (e) {
        if (DDG.editor && DDG.editor.handleMapClick && mid === "mapDM" && state.tool !== "select") return; // editor handles
        var h = e.target.closest("[data-room]"); if (h) select(h.getAttribute("data-room"));
      });
    });
  }
  function setMetaBil(field, val) { var L = state.lang; if (!state.D.meta[field] || typeof state.D.meta[field] !== "object") state.D.meta[field] = { en: "", es: "" }; state.D.meta[field][L] = val; }
  function closeMenus() { document.querySelectorAll(".menu-list").forEach(function (m) { m.hidden = true; }); }

  // ---------- boot -------------------------------------------------------
  function boot() {
    wire();
    if (DDG.editor) DDG.editor.init(DDG.app);
    if (DDG.exporter) DDG.exporter.init(DDG.app);
    if (DDG.importers) DDG.importers.init(DDG.app);
    applyStaticText();
    // restore the last worked-on dungeon, else start from the example
    var saved = loadPersist();
    if (saved) {
      try { state.D = DDG.importers ? DDG.importers.coerce(saved) : saved; }
      catch (e) { state.D = DDG.generate({ theme: "crafters", party: { size: 5, level: 4 }, rooms: 7, difficulty: "hard", seed: 1 }); }
    } else {
      state.D = DDG.generate({ theme: "crafters", party: { size: 5, level: 4 }, rooms: 7, difficulty: "hard", seed: 1 });
    }
    renderAll();
    status(saved ? (state.lang === "es" ? "Sesión restaurada." : "Session restored.") : t("ready"));
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot); else boot();
})(typeof window !== "undefined" ? window : globalThis);
