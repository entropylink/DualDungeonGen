/* ============================================================
   DualDungeonGen — AI PROVIDERS + AI PANEL
   Two ways to generate, in priority order:

   1. **Claude Code bridge** (localhost:8824) — only exists when the
      person viewing the page runs `node ddg-server.js` on their own
      machine with their own logged-in Claude Code. On the public
      website this simply isn't reachable, so the site can never use
      the owner's Claude Code.

   2. **BYOK (bring your own key)** — Anthropic / OpenAI / Gemini.
      The key is entered by the user, stored ONLY in this browser's
      localStorage, and every request goes DIRECTLY from the browser
      to the provider (no server of ours ever sees or proxies it).
      Each user spends only their own key, only from their own browser.

   Two generation modes:
   - generateContent: geometry is FIXED (exact rooms already detected);
     the AI only writes the bilingual adventure content.
   - generateFromImage: arbitrary uploaded map image → full dungeon
     with poly outlines (vision).
   ============================================================ */
(function (root) {
  "use strict";
  var DDG = root.DDG || (root.DDG = {});
  if (typeof document === "undefined") return;

  var LS_KEY = "ddg_byok_v1";
  var BRIDGE = "http://localhost:8824";

  // ---------------- storage (local-only, per browser) --------------------
  function loadCfg() {
    try { return JSON.parse(localStorage.getItem(LS_KEY)) || {}; } catch (e) { return {}; }
  }
  function saveCfg(cfg) { try { localStorage.setItem(LS_KEY, JSON.stringify(cfg)); } catch (e) {} }
  function defaults() {
    return {
      provider: "anthropic",
      keys: {},           // {anthropic:"sk-...", openai:"sk-...", gemini:"AI..."}
      models: { anthropic: "claude-sonnet-5", openai: "gpt-4o", gemini: "gemini-2.5-flash" }
    };
  }
  // Curated, callable models per provider (chat/vision + JSON output). The
  // dropdown offers these; "Custom…" still lets power users type any id.
  // [id, label]; first entry per provider is the recommended default.
  var PROVIDER_MODELS = {
    anthropic: [
      ["claude-sonnet-5", "Claude Sonnet 5 — recomendado"],
      ["claude-opus-4-8", "Claude Opus 4.8 — máxima calidad"],
      ["claude-haiku-4-5-20251001", "Claude Haiku 4.5 — rápido y barato"]
    ],
    openai: [
      ["gpt-4o", "GPT-4o — recomendado"],
      ["gpt-4o-mini", "GPT-4o mini — barato"],
      ["gpt-4.1", "GPT-4.1"],
      ["gpt-4.1-mini", "GPT-4.1 mini"]
    ],
    gemini: [
      ["gemini-2.5-flash", "Gemini 2.5 Flash — recomendado"],
      ["gemini-2.5-pro", "Gemini 2.5 Pro — mejor calidad"],
      ["gemini-2.0-flash", "Gemini 2.0 Flash"]
    ]
  };
  function modelList(p) { return PROVIDER_MODELS[p] || []; }
  function isKnownModel(p, m) { return modelList(p).some(function (x) { return x[0] === m; }); }

  var cfg = Object.assign(defaults(), loadCfg());
  cfg.models = Object.assign(defaults().models, cfg.models || {});
  cfg.keys = cfg.keys || {};

  var bridgeUp = false;

  // ---------------- prompt builders --------------------------------------
  function contentPrompt(rooms, adjacency, guidance, party) {
    var facts = rooms.map(function (r) {
      var f = [r.id + ": ~" + r.sizeFt2 + " ft²"];
      if (r.water) f.push("has water");
      if (r.stairs) f.push(r.stairs + " stair(s) — likely an entrance/exit");
      if (r.props && r.props.length) f.push("props: " + r.props.join(", "));
      if (r.labels && r.labels.length) f.push('user labeled it: "' + r.labels.join('", "') + '"');
      return "- " + f.join(" · ");
    }).join("\n");
    return [
      "You are generating TTRPG adventure content for a dungeon whose GEOMETRY IS FIXED.",
      "Do NOT invent, remove, merge or move rooms. Use EXACTLY these room ids and nothing else.",
      "",
      "ROOMS (detected from the user's own map):",
      facts,
      adjacency && adjacency.length ? "\nDOOR CONNECTIONS (rooms joined by a door): " + adjacency.join(", ") : "",
      "",
      "PARTY: " + party.size + " PCs, level " + party.level + " (D&D 5e).",
      "USER'S DESCRIPTION OF THE ENVIRONMENT (honor it literally — theme, difficulty, mechanics, monsters or lack of them):",
      '"' + (guidance || "a classic dungeon crawl") + '"',
      "",
      "Write bilingual content (en + es; the Spanish must be natural Mexican-Spanish RPG prose using PJ/PX, CD, VD, Percepción...).",
      "Rules: `see` is sensory-only player text — NEVER name a monster, reveal a trap or spoil a secret in `see`.",
      "`tac` is 2nd-person DM advice (behavior + one tactical note). Use SRD monsters with CR, scaled to the party",
      "(if the user asked for empty/no monsters, omit `mon`). 1 thematic trap max per room where it fits the description.",
      "Mark at most one fitting room `secret:true` ONLY if the user's description implies hidden areas.",
      "",
      "Reply with ONLY this JSON (no prose, no fences):",
      '{"meta":{"title":{"en","es"},"subtitle":{"en","es"},"badge":{"en","es"},"difficulty":"Easy|Medium|Hard|Deadly"},',
      ' "overview":{"en","es"},',
      ' "notes":{"en":["<b>...</b> 5 DM bullets: party math, pacing, a clever link, the secret hook, a non-violent out"],"es":[...]},',
      ' "budget":[["<roomId>",{"en","es"},{"en":"contents","es":"..."},"~120 XP","Easy"],...],',
      ' "rooms":{"<roomId>":{"name":{"en","es"},"see":{"en","es"},"mon":{"en":["2× Goblin (CR ¼)"],"es":["2× Trasgo (VD ¼)"]},"trap":{"en","es"},"loot":{"en","es"},"tac":{"en","es"},"secret":false}, ...}}',
      "Every roomId listed above MUST appear in rooms. Omit mon/trap/loot per-room when they don't apply."
    ].join("\n");
  }

  function visionPrompt(guidance, party) {
    return [
      "You are looking at a dungeon/battle map image. The image itself IS the map — do not redraw it.",
      "Trace ONLY the 6-14 major rooms/chambers as polygons of normalized [x,y] points (0..1 fractions of the image,",
      "origin top-left), hugging each room's real walls. 4 points for rectangular rooms, 5-12 for irregular ones.",
      "NEVER box individual grid tiles or thin corridors as rooms.",
      "",
      "PARTY: " + party.size + " PCs, level " + party.level + " (D&D 5e).",
      "USER'S DESCRIPTION (honor it literally): \"" + (guidance || "a classic dungeon crawl") + '"',
      "",
      "Then write bilingual (en+es, natural Spanish) adventure content for those rooms. `see` = sensory player text,",
      "no spoilers. `tac` = 2nd-person DM advice. SRD monsters with CR scaled to the party. Do NOT output meta.image.",
      "",
      "Reply with ONLY this JSON (no prose, no fences):",
      '{"meta":{"title":{"en","es"},"subtitle":{"en","es"},"badge":{"en","es"},"party":{"size":' + party.size + ',"level":' + party.level + '},"difficulty":"Medium"},',
      ' "entry":"A",',
      ' "rooms":[{"id":"A","poly":[[0.06,0.42],[0.26,0.42],[0.26,0.60],[0.06,0.60]],"secret":false,"name":{"en","es"},"see":{"en","es"},"mon":{"en":[],"es":[]},"trap":{"en","es"},"loot":{"en","es"},"tac":{"en","es"}},...],',
      ' "overview":{"en","es"},"notes":{"en":[...5 bullets],"es":[...]},"budget":[["A",{"en","es"},{"en","es"},"~XP","Easy"],...]}'
    ].join("\n");
  }

  // ---------------- JSON extraction ---------------------------------------
  function truncMsg() {
    return L() === "es"
      ? "respuesta truncada (mapa muy grande para el límite del modelo) — usa menos cuartos o un modelo con más salida"
      : "response truncated (map too large for the model's token limit) — try fewer rooms or a higher-output model";
  }
  function extractJSON(text) {
    if (!text) throw new Error("empty AI response");
    var t = String(text).trim().replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
    var a = t.indexOf("{"), b = t.lastIndexOf("}");
    if (a < 0 || b <= a) throw new Error("no JSON in response");
    return JSON.parse(t.slice(a, b + 1));
  }

  // ---------------- provider calls (direct from the browser) --------------
  function callAnthropic(key, model, prompt, imageDataUrl) {
    var content = [];
    if (imageDataUrl) {
      var m = /^data:(image\/\w+);base64,(.*)$/.exec(imageDataUrl);
      if (m) content.push({ type: "image", source: { type: "base64", media_type: m[1], data: m[2] } });
    }
    content.push({ type: "text", text: prompt });
    return fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
        "anthropic-dangerous-direct-browser-access": "true"
      },
      body: JSON.stringify({ model: model, max_tokens: 16000, messages: [{ role: "user", content: content }] })
    }).then(handleHttp).then(function (j) {
      if (j.stop_reason === "max_tokens") throw new Error(truncMsg());
      var txt = (j.content || []).map(function (c) { return c.text || ""; }).join("");
      return extractJSON(txt);
    });
  }

  function callOpenAI(key, model, prompt, imageDataUrl) {
    var user = imageDataUrl
      ? [{ type: "text", text: prompt }, { type: "image_url", image_url: { url: imageDataUrl } }]
      : prompt;
    return fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "content-type": "application/json", "authorization": "Bearer " + key },
      body: JSON.stringify({
        model: model, max_tokens: 16000,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: "You reply with a single valid JSON object and nothing else." },
          { role: "user", content: user }
        ]
      })
    }).then(handleHttp).then(function (j) {
      var ch = j.choices && j.choices[0];
      if (ch && ch.finish_reason === "length") throw new Error(truncMsg());
      return extractJSON(ch && ch.message && ch.message.content);
    });
  }

  function callGemini(key, model, prompt, imageDataUrl) {
    var parts = [{ text: prompt }];
    if (imageDataUrl) {
      var m = /^data:(image\/\w+);base64,(.*)$/.exec(imageDataUrl);
      if (m) parts.push({ inline_data: { mime_type: m[1], data: m[2] } });
    }
    return fetch("https://generativelanguage.googleapis.com/v1beta/models/" + encodeURIComponent(model) + ":generateContent?key=" + encodeURIComponent(key), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: parts }],
        // 2.0-flash caps at 8192; 2.5 models allow much more (helps big maps)
        generationConfig: { responseMimeType: "application/json", maxOutputTokens: /2\.5|1\.5-pro/.test(model) ? 16000 : 8192 }
      })
    }).then(handleHttp).then(function (j) {
      var cand = j.candidates && j.candidates[0];
      if (cand && cand.finishReason === "MAX_TOKENS") throw new Error(truncMsg());
      var txt = cand && cand.content && cand.content.parts ? cand.content.parts.map(function (p) { return p.text || ""; }).join("") : "";
      return extractJSON(txt);
    });
  }

  function handleHttp(r) {
    return r.text().then(function (t) {
      var j; try { j = JSON.parse(t); } catch (e) { j = null; }
      if (!r.ok) {
        var msg = (j && (j.error && (j.error.message || j.error.type) || j.message)) || (r.status + " " + r.statusText);
        throw new Error(msg);
      }
      return j;
    });
  }

  function callBridge(body) {
    return fetch(BRIDGE + "/generate", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify(body)
    }).then(function (r) { return r.json().then(function (j) { if (!r.ok || j.error) throw new Error(j.error || ("bridge " + r.status)); return j.dungeon; }); });
  }

  // ---------------- public API --------------------------------------------
  function activeByok() {
    var p = cfg.provider;
    return (p && cfg.keys[p]) ? { provider: p, key: cfg.keys[p], model: cfg.models[p] } : null;
  }
  function callByok(b, prompt, image) {
    if (b.provider === "anthropic") return callAnthropic(b.key, b.model, prompt, image);
    if (b.provider === "openai") return callOpenAI(b.key, b.model, prompt, image);
    if (b.provider === "gemini") return callGemini(b.key, b.model, prompt, image);
    return Promise.reject(new Error("unknown provider " + b.provider));
  }

  // Bridge first (the user's own Claude Code, no per-call cost); if the
  // bridge call itself fails mid-flight, fall back to the saved key.
  function generateContent(opts) { // {rooms, adjacency, guidance, party}
    var prompt = contentPrompt(opts.rooms, opts.adjacency, opts.guidance, opts.party);
    var b = activeByok();
    if (bridgeUp) return callBridge({ mode: "content", prompt: prompt })
      .catch(function (e) { if (b) return callByok(b, prompt, null); throw e; });
    if (b) return callByok(b, prompt, null);
    return Promise.reject(new Error("no-provider"));
  }

  function generateFromImage(opts) { // {image, guidance, party}
    var b = activeByok();
    if (bridgeUp) return callBridge({ guidance: opts.guidance, image: opts.image, party: opts.party })
      .catch(function (e) { if (b) return callByok(b, visionPrompt(opts.guidance, opts.party), opts.image); throw e; });
    if (b) return callByok(b, visionPrompt(opts.guidance, opts.party), opts.image);
    return Promise.reject(new Error("no-provider"));
  }

  function status() {
    var b = activeByok();
    return { bridge: bridgeUp, byok: b ? b.provider : null, ready: bridgeUp || !!b };
  }

  DDG.ai = {
    status: status, generateContent: generateContent, generateFromImage: generateFromImage,
    getCfg: function () { return cfg; },
    setKey: function (prov, key) { if (key) cfg.keys[prov] = key; else delete cfg.keys[prov]; saveCfg(cfg); refreshPanel(); },
    setProvider: function (p) { cfg.provider = p; saveCfg(cfg); refreshPanel(); },
    setModel: function (prov, m) { if (m) cfg.models[prov] = m; saveCfg(cfg); },
    onReady: null // set by the panel/integration to re-render when the bridge probe lands
  };

  // ---------------- AI panel (left sidebar) --------------------------------
  var L = function () { return (DDG.app && DDG.app.lang && DDG.app.lang()) || "en"; };
  var T = {
    en: {
      h: "AI Generation", st_bridge_ok: "Claude Code (local): available ✓", st_bridge_no: "Claude Code (local): not running",
      st_key: "Key saved for", st_nokey: "No API key saved",
      prov: "Provider", model: "Model", custom: "Custom…", customPh: "model id", key: "API key", save: "Save key", del: "Delete",
      keynote: "Your key is stored ONLY in this browser (localStorage) and calls go straight to the provider — it never touches our server.",
      curmap: "Current map", describeBtn: "Describe + generate notes for this map",
      upload: "Or upload a map image", drop: "Click or drop an image", guide: "What is this dungeon?",
      ph: "a flooded goblin cavern, medium difficulty, lots of traps, one boss",
      size: "Party", level: "Level", gen: "Generate from image", working: "Generating…",
      done: "Generated ", err: "Failed: ", clear: "clear",
      noprov: "Run the local bridge (node ddg-server.js) or save an API key below."
    },
    es: {
      h: "Generación con IA", st_bridge_ok: "Claude Code (local): disponible ✓", st_bridge_no: "Claude Code (local): no está corriendo",
      st_key: "Clave guardada para", st_nokey: "Sin clave API guardada",
      prov: "Proveedor", model: "Modelo", custom: "Personalizado…", customPh: "id del modelo", key: "Clave API", save: "Guardar clave", del: "Borrar",
      keynote: "Tu clave se guarda SOLO en este navegador (localStorage) y las llamadas van directo al proveedor — nunca pasa por nuestro servidor.",
      curmap: "Mapa actual", describeBtn: "Describir y generar notas de este mapa",
      upload: "O sube una imagen de mapa", drop: "Haz clic o suelta una imagen", guide: "¿De qué va esta mazmorra?",
      ph: "una cueva de trasgos inundada, dificultad media, muchas trampas, un jefe",
      size: "Grupo", level: "Nivel", gen: "Generar desde imagen", working: "Generando…",
      done: "Generada ", err: "Error: ", clear: "quitar",
      noprov: "Corre el puente local (node ddg-server.js) o guarda una clave API abajo."
    }
  };
  function t(k) { return (T[L()] && T[L()][k]) || T.en[k]; }
  function esc(s) { return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }

  var imageData = null, imgAspect = 0.72;

  function currentMapEligible() {
    var D = DDG.app && DDG.app.D;
    return !!(D && D.meta && D.meta.image && D.rooms && D.rooms.length);
  }

  function modelIsCustom() { var m = cfg.models[cfg.provider]; return !!m && !isKnownModel(cfg.provider, m); }
  function modelSelectHTML() {
    var cur = cfg.models[cfg.provider], custom = modelIsCustom();
    var opts = modelList(cfg.provider).map(function (x) {
      return '<option value="' + esc(x[0]) + '"' + (!custom && x[0] === cur ? " selected" : "") + ">" + esc(x[1]) + "</option>";
    }).join("");
    opts += '<option value="__custom__"' + (custom ? " selected" : "") + ">" + esc(t("custom")) + "</option>";
    return '<select id="aiModel">' + opts + "</select>";
  }
  function panelHTML() {
    var s = status();
    var provs = [["anthropic", "Anthropic (Claude)"], ["openai", "OpenAI"], ["gemini", "Google Gemini"]];
    var hasKey = !!cfg.keys[cfg.provider];
    return '<section class="pane" id="aiPane"><h3>' + t("h") + "</h3>" +
      '<p class="tool-hint" style="margin:0 0 4px;color:' + (s.bridge ? "var(--ok)" : "var(--dim)") + '">' + (s.bridge ? t("st_bridge_ok") : t("st_bridge_no")) + "</p>" +
      '<p class="tool-hint" style="margin:0 0 8px">' + (s.byok ? t("st_key") + " <b>" + esc(s.byok) + "</b>" : t("st_nokey")) + "</p>" +
      (!s.ready ? '<p class="tool-hint" style="color:var(--crimson)">' + t("noprov") + "</p>" : "") +

      '<label class="fld"><span>' + t("prov") + '</span><select id="aiProv">' +
      provs.map(function (p) { return '<option value="' + p[0] + '"' + (cfg.provider === p[0] ? " selected" : "") + ">" + p[1] + (cfg.keys[p[0]] ? " ✓" : "") + "</option>"; }).join("") +
      "</select></label>" +
      '<label class="fld"><span>' + t("key") + '</span><div class="fld-row seedrow">' +
      '<input id="aiKey" type="password" autocomplete="off" placeholder="' + (hasKey ? "••••••••••" : "sk-…") + '">' +
      '<button class="btn tiny" id="aiKeySave">' + t("save") + "</button>" +
      (hasKey ? '<button class="btn tiny" id="aiKeyDel">' + t("del") + "</button>" : "") +
      "</div></label>" +
      '<label class="fld"><span>' + t("model") + "</span>" + modelSelectHTML() + "</label>" +
      '<input id="aiModelCustom" type="text" class="fld" style="margin-top:-4px' + (modelIsCustom() ? "" : ";display:none") + '" placeholder="' + esc(t("customPh")) + '" value="' + esc(modelIsCustom() ? (cfg.models[cfg.provider] || "") : "") + '">' +
      '<p class="tool-hint" style="font-size:11.5px">' + t("keynote") + "</p>" +
      "<hr style='border:0;border-top:1px solid var(--line2);margin:10px 0'>" +

      (currentMapEligible() ? '<button class="btn primary block" id="aiDescribe">' + t("describeBtn") + "</button>" +
        "<hr style='border:0;border-top:1px solid var(--line2);margin:10px 0'>" : "") +

      '<label class="fld"><span>' + t("upload") + "</span></label>" +
      '<div class="drop" id="aiDrop" style="padding:14px">' + t("drop") + "</div>" +
      '<div id="aiThumb" hidden style="margin-top:8px"></div>' +
      '<input type="file" id="aiFile" accept="image/*" hidden>' +
      '<label class="fld" style="margin-top:8px"><span>' + t("guide") + '</span>' +
      '<textarea id="aiGuide" rows="3" placeholder="' + esc(t("ph")) + '"></textarea></label>' +
      '<div class="fld-row">' +
      '<label class="fld"><span>' + t("size") + '</span><input id="aiSize" type="number" min="1" max="12" value="4"></label>' +
      '<label class="fld"><span>' + t("level") + '</span><input id="aiLevel" type="number" min="1" max="20" value="3"></label>' +
      "</div>" +
      '<button class="btn block" id="aiGen">' + t("gen") + "</button>" +
      '<p class="tool-hint" id="aiStatus" style="margin-top:8px"></p></section>';
  }

  function refreshPanel() {
    var old = document.getElementById("aiPane"); if (old) old.remove();
    var side = document.querySelector(".sidebar.left"); if (!side) return;
    var wrap = document.createElement("div");
    wrap.innerHTML = panelHTML();
    side.insertBefore(wrap.firstChild, side.firstChild);
    wire();
  }

  function wire() {
    var provSel = document.getElementById("aiProv");
    provSel.onchange = function () { cfg.provider = provSel.value; saveCfg(cfg); refreshPanel(); };
    var modelSel = document.getElementById("aiModel");
    var modelCustom = document.getElementById("aiModelCustom");
    modelSel.onchange = function () {
      if (modelSel.value === "__custom__") {
        modelCustom.style.display = "";
        modelCustom.focus();
        if (modelCustom.value.trim()) DDG.ai.setModel(cfg.provider, modelCustom.value.trim());
      } else {
        modelCustom.style.display = "none";
        DDG.ai.setModel(cfg.provider, modelSel.value);
      }
    };
    modelCustom.oninput = function () { if (modelSel.value === "__custom__") DDG.ai.setModel(cfg.provider, modelCustom.value.trim()); };
    document.getElementById("aiKeySave").onclick = function () {
      var v = document.getElementById("aiKey").value.trim();
      if (v) DDG.ai.setKey(cfg.provider, v);
    };
    var del = document.getElementById("aiKeyDel");
    if (del) del.onclick = function () { DDG.ai.setKey(cfg.provider, null); };

    var describe = document.getElementById("aiDescribe");
    if (describe) describe.onclick = function () { if (DDG.integration) DDG.integration.openDescribe(); };

    var drop = document.getElementById("aiDrop"), file = document.getElementById("aiFile");
    drop.onclick = function () { file.click(); };
    drop.ondragover = function (e) { e.preventDefault(); drop.style.borderColor = "#b89857"; };
    drop.ondragleave = function () { drop.style.borderColor = ""; };
    drop.ondrop = function (e) { e.preventDefault(); drop.style.borderColor = ""; if (e.dataTransfer.files[0]) readImg(e.dataTransfer.files[0]); };
    file.onchange = function () { if (file.files[0]) readImg(file.files[0]); };
    document.getElementById("aiGen").onclick = genFromImage;
  }

  function readImg(f) {
    var rd = new FileReader();
    rd.onload = function () {
      imageData = rd.result;
      var im = new Image(); im.onload = function () { imgAspect = im.naturalHeight / im.naturalWidth || 0.72; }; im.src = imageData;
      var th = document.getElementById("aiThumb");
      th.hidden = false;
      th.innerHTML = '<img src="' + imageData + '" style="max-width:100%;max-height:120px;border:1px solid var(--line);border-radius:6px"> ' +
        '<button class="btn tiny" id="aiClearImg">' + t("clear") + "</button>";
      document.getElementById("aiClearImg").onclick = function () { imageData = null; th.hidden = true; th.innerHTML = ""; };
    };
    rd.readAsDataURL(f);
  }

  function setStatus(msg, isErr) {
    var el = document.getElementById("aiStatus"); if (!el) return;
    el.textContent = msg; el.style.color = isErr ? "var(--crimson)" : "var(--gold)";
  }

  function genFromImage() {
    var guidance = (document.getElementById("aiGuide").value || "").trim();
    if (!imageData) { setStatus(L() === "es" ? "Sube una imagen primero." : "Add an image first.", true); return; }
    if (!status().ready) { setStatus(t("noprov"), true); return; }
    var party = { size: parseInt(document.getElementById("aiSize").value, 10) || 4, level: parseInt(document.getElementById("aiLevel").value, 10) || 3 };
    var btn = document.getElementById("aiGen"); btn.disabled = true;
    var t0 = Date.now();
    var tick = setInterval(function () { setStatus(t("working") + " (" + Math.round((Date.now() - t0) / 1000) + "s)"); }, 1000);
    DDG.ai.generateFromImage({ image: imageData, guidance: guidance, party: party })
      .then(function (dungeon) {
        clearInterval(tick); btn.disabled = false;
        dungeon.meta = dungeon.meta || {};
        dungeon.meta.image = imageData; dungeon.meta.imageAspect = imgAspect; dungeon.meta.imageOpacity = 1;
        var D = DDG.importers.coerce(dungeon);
        DDG.app.setD(D);
        setStatus(t("done") + DDG.app.tx(D.meta.title) + " · " + Math.round((Date.now() - t0) / 1000) + "s");
      })
      .catch(function (e) { clearInterval(tick); btn.disabled = false; setStatus(t("err") + e.message, true); });
  }

  // ---------------- bridge probe + boot ------------------------------------
  function probe() {
    fetch(BRIDGE + "/health", { cache: "no-store" })
      .then(function (r) { return r.ok ? r.json() : Promise.reject(); })
      .then(function (h) { bridgeUp = !!(h && h.claude); refreshPanel(); if (DDG.ai.onReady) DDG.ai.onReady(); })
      .catch(function () { bridgeUp = false; refreshPanel(); if (DDG.ai.onReady) DDG.ai.onReady(); });
  }

  function boot() {
    probe();
    var lt = document.getElementById("langToggle");
    if (lt) lt.addEventListener("click", function () { setTimeout(refreshPanel, 0); });
    // the user may start/stop the local bridge while the page is open
    window.addEventListener("focus", probe);
  }
  DDG.ai.refreshPanel = refreshPanel;
  DDG.ai.probe = probe;
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot); else boot();
})(typeof window !== "undefined" ? window : globalThis);
