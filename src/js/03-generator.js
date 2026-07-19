/* ============================================================
   DualDungeonGen — GENERATOR
   Procedurally builds a full `dungeon` object from parameters:
   { theme, party:{size,level}, rooms:N, difficulty, seed }.
   Layout uses a hub-and-arms lattice: every arm room is centred on
   its parent's axis, so the renderer's corridor router always draws
   a STRAIGHT corridor (skill hard-rule). Encounters are scaled to
   the party's 5e XP thresholds.
   ============================================================ */
(function (root) {
  "use strict";
  var DDG = root.DDG || (root.DDG = {});

  // Adjectives to fill "{ord}" in theme titles. Avoid words that already
  // appear in a base name (Broken/Ashen/Hollow/Gullet) to prevent clashes.
  var ORD = [
    { en: "Silent", m: "Silencioso", f: "Silenciosa" },
    { en: "Forgotten", m: "Olvidado", f: "Olvidada" },
    { en: "Sunken", m: "Hundido", f: "Hundida" },
    { en: "Whispering", m: "Susurrante", f: "Susurrante" },
    { en: "Wretched", m: "Mísero", f: "Mísera" },
    { en: "Buried", m: "Enterrado", f: "Enterrada" }
  ];
  var GENDER = { crafters: "m", crypt: "f", cave: "f", cult: "m" };

  // Per-theme note extras (clever link + non-violent out), bilingual.
  var NOTES_EXTRA = {
    crafters: {
      link: { en: "The Smithy's kiln anchors the animating force. Dousing it (holy water, cold, <i>dispel magic</i>) stops the fire-threat reforming AND gives the climax guardian disadvantage. Reward the table that connects the two.", es: "El horno de la Fragua ancla la fuerza animadora. Apagarlo (agua bendita, frío, <i>disipar magia</i>) impide que la amenaza de fuego se reforme Y da desventaja al guardián del clímax. Premia a la mesa que lo deduzca." },
      out: { en: "Speaking to or freeing the bound spirit can still every animation at once — a full win for a talky table.", es: "Hablar con o liberar al espíritu atado puede detener toda animación a la vez — una victoria plena para una mesa dialogante." }
    },
    crypt: {
      link: { en: "Disrupting the ritual sigils in the work rooms weakens the grave-lord's rite, so it can't call reinforcements at the climax.", es: "Interrumpir los sigilos rituales en las salas de trabajo debilita el rito del señor de las tumbas, que no podrá llamar refuerzos en el clímax." },
      out: { en: "Laying the grave-lord to rest with its true name (from the hidden reliquary) ends the undead without a final fight.", es: "Dar descanso al señor de las tumbas con su nombre verdadero (del relicario oculto) acaba con los no-muertos sin combate final." }
    },
    cave: {
      link: { en: "Thinning the pack in the work rooms leaves the deep-den brute to fight alone — burning the webs and using the cavern ledges turns the terrain against it.", es: "Diezmar la manada en las salas de trabajo deja al bruto de la guarida honda peleando solo — quemar las telas y usar los salientes vuelve el terreno en su contra." },
      out: { en: "Driving the beast off with fire or a bigger threat (rather than killing it) is a valid resolution — and the hoard stays.", es: "Ahuyentar a la bestia con fuego o una amenaza mayor (en vez de matarla) es una resolución válida — y el tesoro se queda." }
    },
    cult: {
      link: { en: "Learning the rite's true name (Scriptorium) or dumping the cauldron lets a PC interrupt the celebrant and stop the rite cold at the climax.", es: "Aprender el nombre verdadero del rito (Escritorio) o volcar el caldero permite a un PJ interrumpir al oficiante y detener el rito en seco en el clímax." },
      out: { en: "Freeing the prisoner and shattering the focus ends the rite without cutting down the whole choir.", es: "Liberar al prisionero y destrozar el foco acaba el rito sin abatir a todo el coro." }
    }
  };

  // ---- layout: hub + 4 arms, all arm rooms centred on parent axis -------
  function layout(rng, N) {
    var GAP = 2;
    function size(role) {
      if (role === "climax") return { w: rng.int(7, 9), h: rng.int(6, 7) };
      if (role === "entry") return { w: rng.int(5, 7), h: rng.int(4, 5) };
      if (role === "hub") return { w: rng.int(6, 8), h: rng.int(5, 6) };
      if (role === "secret") return { w: rng.int(5, 6), h: 4 };
      return { w: rng.int(5, 7), h: rng.int(4, 6) };
    }
    // distribute N-1 non-hub rooms across arms; up>=2 (climax far), down>=1 (entry)
    var rest = N - 1;
    var up = 2, down = 1, left = 0, rightN = 0;
    rest -= (up + down);
    var order = ["left", "rightN", "up", "down"];
    var i = 0;
    while (rest > 0) {
      var a = order[i % order.length];
      if (a === "left") left++; else if (a === "rightN") rightN++;
      else if (a === "up") up = Math.min(up + 1, 3); else down = Math.min(down + 1, 2);
      // guard against runaway if caps hit
      if (a === "up" && up >= 3 && rest > 0) { i++; if (i > 40) break; else { rest--; continue; } }
      rest--; i++;
      if (i > 60) break;
    }

    var rooms = [];
    var hub = size("hub"); hub.x = 0; hub.y = 0; hub.id = "H"; hub.role = "work";
    rooms.push(hub);
    var hcx = hub.x + hub.w / 2, hcy = hub.y + hub.h / 2;

    function armVertical(count, dir /* -1 up, +1 down */, terminalRole, prefix) {
      var parent = hub, made = [];
      var frontier = dir < 0 ? hub.y : hub.y + hub.h; // edge to grow from
      for (var k = 0; k < count; k++) {
        var role = (k === count - 1) ? terminalRole : "work";
        var s = size(role);
        s.x = Math.round(hcx - s.w / 2);
        if (dir < 0) { s.y = frontier - GAP - s.h; frontier = s.y; }
        else { s.y = frontier + GAP; frontier = s.y + s.h; }
        s.id = prefix + (k + 1); s.role = role;
        rooms.push(s); made.push(s); parent = s;
      }
      return made;
    }
    function armHorizontal(count, dir, prefix) {
      var made = [];
      var frontier = dir < 0 ? hub.x : hub.x + hub.w;
      for (var k = 0; k < count; k++) {
        var s = size("work");
        s.y = Math.round(hcy - s.h / 2);
        if (dir < 0) { s.x = frontier - GAP - s.w; frontier = s.x; }
        else { s.x = frontier + GAP; frontier = s.x + s.w; }
        s.id = prefix + (k + 1); s.role = "work";
        rooms.push(s); made.push(s);
      }
      return made;
    }

    var upArm = armVertical(up, -1, "climax", "U");
    var downArm = armVertical(down, 1, "entry", "D");
    var leftArm = left ? armHorizontal(left, -1, "L") : [];
    var rightArm = rightN ? armHorizontal(rightN, 1, "R") : [];

    // corridors: each arm room connects to its parent
    var cor = [];
    function chain(parentId, arm) {
      var prev = parentId;
      arm.forEach(function (r) { cor.push([prev, r.id]); prev = r.id; });
    }
    chain("H", upArm); chain("H", downArm); chain("H", leftArm); chain("H", rightArm);

    // one of the left/right terminals becomes a "hazard" for pacing variety
    var sideRooms = leftArm.concat(rightArm);
    if (sideRooms.length) { var hz = rng.pick(sideRooms); hz.role = "hazard"; }

    // secret room: east of the first up-arm room (open quadrant), hidden corridor
    var parentForSecret = upArm[0] || hub;
    var sec = size("secret");
    sec.y = Math.round(parentForSecret.y + parentForSecret.h / 2 - sec.h / 2);
    sec.x = parentForSecret.x + parentForSecret.w + GAP;
    sec.id = "S1"; sec.role = "secret"; sec.secret = true;
    rooms.push(sec);
    cor.push([parentForSecret.id, "S1", { secret: true }]);

    var entry = downArm.length ? downArm[downArm.length - 1] : hub;
    var climax = upArm[upArm.length - 1];

    // normalise to positive coords (start at 2,2)
    var minX = Infinity, minY = Infinity;
    rooms.forEach(function (r) { minX = Math.min(minX, r.x); minY = Math.min(minY, r.y); });
    rooms.forEach(function (r) { r.x += 2 - minX; r.y += 2 - minY; });

    return { rooms: rooms, cor: cor, entryId: entry.id, climaxId: climax.id, secretId: "S1" };
  }

  // ---- encounter scaling ------------------------------------------------
  function fillEncounter(rng, pool, band, size, level) {
    if (band === "none" || !pool || !pool.length) return null;
    var t = DDG.thresholds(size, level);
    var target = { Easy: t.easy, Medium: t.med, Hard: t.hard, Deadly: t.deadly }[band] || t.med;
    var best = null;
    rng.shuffle(pool).forEach(function (id) {
      var cr = DDG.MON[id].cr, xp = DDG.crXp(cr);
      for (var n = 1; n <= 6; n++) {
        var adj = xp * n * DDG.encMultiplier(n, size);
        var over = adj > t.deadly * 1.4 ? (adj - t.deadly * 1.4) * 3 : 0;
        var score = Math.abs(adj - target) + over;
        if (!best || score < best.score) best = { id: id, n: n, score: score, raw: xp * n };
      }
    });
    return best ? { id: best.id, count: best.n, raw: best.raw } : null;
  }

  function monStrings(enc) {
    var m = DDG.MON[enc.id];
    var pfx = enc.count > 1 ? enc.count + "× " : "";
    return {
      en: pfx + m.en + " (CR " + DDG.crLabel(m.cr) + ")",
      es: pfx + m.es + " (VD " + DDG.crLabel(m.cr) + ")",
      tokens: (function () { var a = []; for (var i = 0; i < Math.min(4, enc.count); i++) a.push({ t: m.tok, cr: m.cr }); return a; })()
    };
  }

  function bandForRole(role, difficulty) {
    if (role === "entry") return "Easy";
    if (role === "hazard") return "Easy";
    if (role === "secret") return "none";
    if (role === "climax") return difficulty === "deadly" ? "Deadly" : "Hard";
    return "Medium"; // work / hub
  }

  function generate(params) {
    params = params || {};
    var theme = params.theme || "crafters";
    if (!DDG.THEMES[theme]) theme = "crafters";
    var size = Math.max(1, Math.min(12, params.party && params.party.size || 5));
    var level = Math.max(1, Math.min(20, params.party && params.party.level || 4));
    var N = Math.max(5, Math.min(9, params.rooms || 7));
    var difficulty = params.difficulty || "hard";
    var seed = params.seed != null ? params.seed : Math.floor(Math.random() * 1e9);
    var rng = DDG.makeRng(theme + "|" + size + "|" + level + "|" + N + "|" + difficulty + "|" + seed);

    var TH = DDG.THEMES[theme], PROSE = DDG.ROLE_PROSE[theme];
    // layout builds hub+arms; the secret room is added on top, so ask for
    // N-1 here to make the total (incl. secret) equal the requested count.
    var lay = layout(rng, Math.max(4, N - 1));

    // shuffle work prose blocks so repeats are rare
    var workProse = rng.shuffle(PROSE.work);
    var wi = 0;

    var rooms = lay.rooms.map(function (r) {
      var role = r.role;
      var block;
      if (role === "entry") block = PROSE.entry[0];
      else if (role === "climax") block = PROSE.climax[0];
      else if (role === "secret") block = PROSE.secret[0];
      else if (role === "hazard") block = PROSE.hazard[0];
      else { block = workProse[wi % workProse.length]; wi++; }

      var out = {
        id: r.id, x: r.x, y: r.y, w: r.w, h: r.h,
        role: role, secret: !!r.secret,
        feats: pickFeats(rng, TH, role),
        name: block.name, see: block.see
      };
      // encounter
      var band = bandForRole(role, difficulty);
      var pool = TH.pools[role === "hub" ? "work" : (role === "hazard" ? "hazard" : (role === "climax" ? "climax" : (role === "entry" ? "entry" : "work")))];
      var enc = fillEncounter(rng, pool, band, size, level);
      if (enc) { var ms = monStrings(enc); out.mon = [ms.en]; out.mon_es = [ms.es]; out.tokens = ms.tokens; out._enc = enc; }
      if (block.trap) out.trap = block.trap;
      if (block.loot) out.loot = block.loot;
      if (block.tac) out.tac = block.tac;
      return out;
    });

    // bilingual mon: renderer/panel read mon[lang]; store as {en,es}
    rooms.forEach(function (r) {
      if (r.mon) { r.mon = { en: r.mon, es: r.mon_es }; delete r.mon_es; }
    });

    // title + meta
    var ord = rng.pick(ORD), g = GENDER[theme] || "m";
    var title = {
      en: TH.name.en.replace("{ord}", ord.en),
      es: TH.name.es.replace("{ord}", g === "f" ? ord.f : ord.m)
    };
    var overview = rng.pick(TH.overview);

    // budget table + notes
    var budget = [];
    rooms.forEach(function (r) {
      if (r.role === "secret") return;
      var contents, xpText = "—", diff = "—";
      if (r._enc) {
        contents = { en: r.mon.en[0], es: r.mon.es[0] };
        xpText = "~" + fmt(r._enc.raw) + " XP";
        diff = DDG.classify(r._enc.raw, r._enc.count, size, level);
      } else if (r.trap) { contents = { en: "Trap / hazard only", es: "Solo trampa / peligro" }; diff = "Easy"; }
      else { contents = { en: "—", es: "—" }; }
      budget.push([r.id, r.name, contents, xpText, diff]);
      delete r._enc;
    });

    var t = DDG.thresholds(size, level);
    var secRoom = rooms.filter(function (r) { return r.role === "secret"; })[0];
    var climaxRoom = rooms.filter(function (r) { return r.role === "climax"; })[0];
    var extra = NOTES_EXTRA[theme];
    var notes = {
      en: [
        "<b>Party:</b> " + size + " PCs, level " + level + ". Thresholds — Medium " + fmt(t.med) + " · Hard " + fmt(t.hard) + " · Deadly " + fmt(t.deadly) + " XP.",
        "<b>Pacing:</b> the entry room is a warm-up; the climax (<b>" + climaxRoom.name.en + "</b>) is the spike. Offer short-rest beats after the mid work rooms.",
        "<b>Clever link:</b> " + extra.link.en,
        "<b>Secret:</b> the <b>" + (secRoom ? secRoom.name.en : "hidden room") + "</b> holds the ‘why’ and the key — story, not combat.",
        "<b>Non-violent out:</b> " + extra.out.en
      ],
      es: [
        "<b>Grupo:</b> " + size + " PJs, nivel " + level + ". Umbrales — Media " + fmt(t.med) + " · Difícil " + fmt(t.hard) + " · Mortal " + fmt(t.deadly) + " PX.",
        "<b>Ritmo:</b> la sala de entrada es calentamiento; el clímax (<b>" + climaxRoom.name.es + "</b>) es el pico. Ofrece descansos cortos tras las salas de trabajo intermedias.",
        "<b>Vínculo astuto:</b> " + extra.link.es,
        "<b>Secreto:</b> el <b>" + (secRoom ? secRoom.name.es : "cuarto oculto") + "</b> guarda el ‘porqué’ y la llave — historia, no combate.",
        "<b>Salida no violenta:</b> " + extra.out.es
      ]
    };

    // strip helper fields
    rooms.forEach(function (r) { delete r.role; });

    return {
      format: "ddg-dungeon", version: 1,
      meta: {
        title: title, subtitle: TH.subtitle, theme: theme,
        badge: TH.badge, party: { size: size, level: level }, cell: 26,
        difficulty: capitalize(difficulty), seed: seed
      },
      entry: lay.entryId,
      rooms: rooms,
      corridors: lay.cor,
      overview: overview,
      notes: notes,
      budget: budget
    };
  }

  function pickFeats(rng, TH, role) {
    var f = TH.feats[role === "hub" ? "work" : role] || TH.feats.work;
    if (Array.isArray(f) && f.length && Array.isArray(f[0])) return rng.pick(f).slice();
    return (f || []).slice();
  }
  function fmt(n) { return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ","); }
  function capitalize(s) { return s ? s[0].toUpperCase() + s.slice(1) : s; }

  DDG.generate = generate;
  DDG.layout = layout;
  if (typeof module !== "undefined" && module.exports) module.exports = { generate: generate };
})(typeof window !== "undefined" ? window : globalThis);
