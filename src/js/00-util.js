/* ============================================================
   DualDungeonGen — UTILITIES
   Seeded RNG, id helpers, D&D 5e encounter math (from the skill's
   content.md tables). Loaded first; everything hangs off window.DDG.
   ============================================================ */
(function (root) {
  "use strict";
  var DDG = root.DDG || (root.DDG = {});

  // Deterministic RNG so a seed reproduces a dungeon exactly.
  function xmur3(str) {
    var h = 1779033703 ^ str.length;
    for (var i = 0; i < str.length; i++) {
      h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
      h = (h << 13) | (h >>> 19);
    }
    return function () {
      h = Math.imul(h ^ (h >>> 16), 2246822507);
      h = Math.imul(h ^ (h >>> 13), 3266489909);
      h ^= h >>> 16; return h >>> 0;
    };
  }
  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function makeRng(seed) {
    var s = xmur3(String(seed));
    var r = mulberry32(s());
    return {
      next: r,
      int: function (a, b) { return a + Math.floor(r() * (b - a + 1)); },
      pick: function (arr) { return arr[Math.floor(r() * arr.length)]; },
      shuffle: function (arr) {
        var a = arr.slice();
        for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(r() * (i + 1)); var t = a[i]; a[i] = a[j]; a[j] = t; }
        return a;
      },
      chance: function (p) { return r() < p; }
    };
  }

  function slugify(s) {
    return String(s || "dungeon").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "").slice(0, 60) || "dungeon";
  }
  function clone(o) { return JSON.parse(JSON.stringify(o)); }

  // ---- 5e 2014 XP thresholds per character (Easy/Med/Hard/Deadly) -------
  var THRESH = {
    1: [25, 50, 75, 100], 2: [50, 100, 150, 200], 3: [75, 150, 225, 400],
    4: [125, 250, 375, 500], 5: [250, 500, 750, 1100], 6: [300, 600, 900, 1400],
    7: [350, 750, 1100, 1700], 8: [450, 900, 1400, 2100], 9: [550, 1100, 1600, 2400],
    10: [600, 1200, 1900, 2800], 11: [800, 1600, 2400, 3600], 12: [1000, 2000, 3000, 4500],
    13: [1100, 2200, 3400, 5100], 14: [1250, 2500, 3800, 5700], 15: [1400, 2800, 4300, 6400],
    16: [1600, 3200, 4800, 7200], 17: [2000, 3900, 5900, 8800], 18: [2100, 4200, 6300, 9500],
    19: [2400, 4900, 7300, 10900], 20: [2800, 5700, 8500, 12700]
  };
  function thresholds(size, level) {
    var lv = THRESH[Math.max(1, Math.min(20, level))] || THRESH[4];
    return { easy: lv[0] * size, med: lv[1] * size, hard: lv[2] * size, deadly: lv[3] * size };
  }
  // Adjusted-XP multiplier by monster count, shifted for party size.
  function encMultiplier(count, partySize) {
    var band = count <= 1 ? 1 : count === 2 ? 1.5 : count <= 6 ? 2 : count <= 10 ? 2.5 : 3;
    var steps = [1, 1.5, 2, 2.5, 3, 4];
    var idx = steps.indexOf(band);
    if (partySize >= 6) idx = Math.max(0, idx - 1);
    else if (partySize <= 2) idx = Math.min(steps.length - 1, idx + 1);
    return steps[idx];
  }
  // Classify a room's raw XP against party thresholds -> label.
  function classify(rawXp, count, size, level) {
    var t = thresholds(size, level);
    var adj = rawXp * encMultiplier(count, size);
    if (adj >= t.deadly) return "Deadly";
    if (adj >= t.hard) return "Hard";
    if (adj >= t.med) return "Medium";
    if (adj > 0) return "Easy";
    return "—";
  }
  var CR_XP = { 0: 10, 0.125: 25, 0.25: 50, 0.5: 100, 1: 200, 2: 450, 3: 700, 4: 1100, 5: 1800, 6: 2300, 7: 2900, 8: 3900, 9: 5000, 10: 5900, 11: 7200, 12: 8400, 13: 10000 };
  function crXp(cr) { return CR_XP[cr] != null ? CR_XP[cr] : 200; }
  function crLabel(cr) {
    if (cr === 0.125) return "⅛"; if (cr === 0.25) return "¼"; if (cr === 0.5) return "½";
    return String(cr);
  }

  DDG.makeRng = makeRng;
  DDG.slugify = slugify;
  DDG.clone = clone;
  DDG.thresholds = thresholds;
  DDG.encMultiplier = encMultiplier;
  DDG.classify = classify;
  DDG.crXp = crXp;
  DDG.crLabel = crLabel;
  if (typeof module !== "undefined" && module.exports) module.exports = DDG;
})(typeof window !== "undefined" ? window : globalThis);
