/* ============================================================
   DualDungeonGen — EXPORT
   JSON (re-importable) · standalone interactive HTML viewer · PNG.
   The viewer skeleton is embedded at build time (window.__DDG_VIEWER_B64__)
   with the renderer already inlined; here we inject the current dungeon.
   ============================================================ */
(function (root) {
  "use strict";
  var DDG = root.DDG || (root.DDG = {});
  if (typeof document === "undefined") return;
  var app = null;

  function init(a) { app = a; }

  function download(blob, filename) {
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click();
    setTimeout(function () { document.body.removeChild(a); URL.revokeObjectURL(url); }, 100);
  }
  function b64ToUtf8(b64) {
    var bin = atob(b64), bytes = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new TextDecoder("utf-8").decode(bytes);
  }
  function slug() { return DDG.slugify(app.tx(app.D.meta.title) || "dungeon"); }
  function titleText() { return app.tx(app.D.meta.title) || "Dungeon"; }
  function escTitle(s) { return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }

  function exportJSON() {
    var data = JSON.stringify(app.D, null, 2);
    download(new Blob([data], { type: "application/json" }), slug() + ".json");
    app.status(app.t("copied") ? "JSON exported." : "JSON exported.");
  }

  function exportHTML() {
    if (!root.__DDG_VIEWER_B64__) { app.status("Viewer template missing."); return; }
    var skeleton = b64ToUtf8(root.__DDG_VIEWER_B64__);
    var jsonEmbed = JSON.stringify(app.D).replace(/</g, "\\u003c"); // escape < so no closing script tag can appear
    var html = skeleton
      .replace("__TITLE__", function () { return escTitle(titleText()); })
      .replace("/*__DATA__*/{}", function () { return jsonEmbed; });
    download(new Blob([html], { type: "text/html" }), slug() + ".html");
    app.status("Interactive HTML exported (" + (html.length / 1024).toFixed(0) + " KB).");
  }

  function exportPNG(mode) {
    var D = app.D;
    var r = DDG.renderMapSVG(D, mode, null);
    var vb = r.vb.split(" ").map(Number), scale = 2;
    var w = Math.round(vb[2] * scale), h = Math.round(vb[3] * scale);

    function drawOverlays(ctx, done) {
      // Chromium won't rasterize a nested <image href="data:…"> when an SVG
      // is drawn to canvas, so for image-backed maps the base is drawn
      // separately (below) and we strip it here — this SVG carries only the
      // vector overlays (rooms, tokens, labels).
      var inner = D.meta && D.meta.image ? r.inner.replace(/<image\b[^>]*>/i, "") : r.inner;
      var svg = '<svg xmlns="http://www.w3.org/2000/svg" width="' + w + '" height="' + h +
        '" viewBox="' + r.vb + '">' + inner + "</svg>";
      var url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml;charset=utf-8" }));
      var img = new Image();
      img.onload = function () { ctx.drawImage(img, 0, 0); URL.revokeObjectURL(url); done(true); };
      img.onerror = function () { URL.revokeObjectURL(url); done(false); };
      img.src = url;
    }
    function finish(c, ok) {
      if (!ok) { app.status("PNG export failed."); return; }
      c.toBlob(function (b) { download(b, slug() + "-" + mode + ".png"); app.status("PNG exported (" + w + "×" + h + ")."); }, "image/png");
    }

    var c = document.createElement("canvas"); c.width = w; c.height = h;
    var ctx = c.getContext("2d");

    if (D.meta && D.meta.image) {
      // 1) paint the user's exact base image to fill the canvas, then 2) the overlays on top
      var base = new Image();
      base.onload = function () { ctx.drawImage(base, 0, 0, w, h); drawOverlays(ctx, function (ok) { finish(c, ok); }); };
      base.onerror = function () { app.status("PNG export failed (base image)."); };
      base.src = D.meta.image;
    } else {
      drawOverlays(ctx, function (ok) { finish(c, ok); });
    }
  }

  function run(kind) {
    if (!app || !app.D) return;
    if (kind === "json") exportJSON();
    else if (kind === "html") exportHTML();
    else if (kind === "png-dm") exportPNG("dm");
    else if (kind === "png-pl") exportPNG("player");
  }

  DDG.exporter = { init: init, run: run };
})(typeof window !== "undefined" ? window : globalThis);
