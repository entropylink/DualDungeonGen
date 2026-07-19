/* Build: inline src/shell.html + src/styles.css + src/js/*.js (sorted)
   into a single self-contained file at dist/dungeon-studio.html. */
var fs = require("fs"), path = require("path");
var ROOT = __dirname, SRC = path.join(ROOT, "src"), JS = path.join(SRC, "js");

var shell = fs.readFileSync(path.join(SRC, "shell.html"), "utf8");
var css = fs.readFileSync(path.join(SRC, "styles.css"), "utf8");
var files = fs.readdirSync(JS).filter(function (f) { return /\.js$/.test(f); }).sort();
var js = files.map(function (f) {
  return "/* ===== " + f + " ===== */\n" + fs.readFileSync(path.join(JS, f), "utf8");
}).join("\n\n");

// Build the standalone VIEWER skeleton (renderer injected, data placeholder
// left in). The studio embeds it base64-encoded; the exporter injects the
// current dungeon's JSON at download time.
var viewerTpl = fs.readFileSync(path.join(SRC, "viewer-template.html"), "utf8");
var rendererSrc = fs.readFileSync(path.join(JS, "01-renderer.js"), "utf8");
var viewerSkeleton = viewerTpl.replace("/*__RENDERER__*/", function () { return rendererSrc; });
var viewerB64 = Buffer.from(viewerSkeleton, "utf8").toString("base64");
js = "window.__DDG_VIEWER_B64__ = \"" + viewerB64 + "\";\n\n" + js;

// Guard: script content must not contain a literal </script> that would close the block early.
if (/<\/script>/i.test(js)) { console.error("ERROR: a source file contains </script>"); process.exit(1); }

var out = shell
  .replace("/* DDG:CSS */", function () { return css; })
  .replace("/* DDG:JS */", function () { return js; });

var distDir = path.join(ROOT, "dist");
if (!fs.existsSync(distDir)) fs.mkdirSync(distDir);
var outPath = path.join(distDir, "dungeon-studio.html");
fs.writeFileSync(outPath, out);
var kb = (Buffer.byteLength(out) / 1024).toFixed(1);
console.log("Built " + outPath + " (" + kb + " KB) from " + files.length + " js modules:");
files.forEach(function (f) { console.log("  - " + f); });

// index.html = the 2-tab shell (Cartógrafo + studio); cartografo.html is
// copied from the dungeon-maker folder (its source of truth).
fs.copyFileSync(path.join(SRC, "shell-tabs.html"), path.join(distDir, "index.html"));
var cartoSrc = path.join(ROOT, "dungeon-maker", "mazmorra.html");
if (fs.existsSync(cartoSrc)) {
  fs.copyFileSync(cartoSrc, path.join(distDir, "cartografo.html"));
  console.log("Shell -> index.html · Cartógrafo -> cartografo.html");
} else {
  console.warn("WARN: dungeon-maker/mazmorra.html not found — cartografo.html not updated");
}
