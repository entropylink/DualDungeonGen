// test_smoke.js — LA PRUEBA MÁS IMPORTANTE. Corre la app entera en un DOM simulado.
// Caza errores de cableado que `node --check` NO ve (IDs mal escritos, funciones
// no definidas al momento de usarse, handlers rotos).
// Requiere: npm install jsdom     (ver herramientas/README.md)
//
// Ejercita: cada herramienta del rail, el generador (3 tipos), deshacer/rehacer,
// los 4 exports, instrucciones, y los segmentos de goma/figura.
const fs = require("fs");
const { HTML } = require("./extraer");

let JSDOM;
try { ({ JSDOM } = require("jsdom")); }
catch (e) { console.error("Falta jsdom. Corre:  npm install jsdom"); process.exit(2); }

const html = fs.readFileSync(HTML, "utf8");
const errs = [];
const dom = new JSDOM(html, { runScripts: "outside-only", pretendToBeVisual: true });
const { window } = dom, { document } = window;

// ---- canvas falso: todo no-op, con retornos razonables ----
const grad = { addColorStop() {} };
function mkCtx() {
  return new Proxy({}, {
    get(t, p) {
      if (p === "measureText") return s => ({ width: (s ? String(s).length : 1) * 7 });
      if (p === "createLinearGradient") return () => grad;
      if (p === "createPattern") return () => ({ setTransform() {} });
      if (p === "getImageData") return () => ({ data: new Uint8ClampedArray(4) });
      if (p === "canvas") return { width: 800, height: 600 };
      if (typeof p === "string") return function () {};
      return undefined;
    },
    set() { return true; }
  });
}
window.HTMLCanvasElement.prototype.getContext = () => mkCtx();
window.HTMLCanvasElement.prototype.toBlob = cb => cb(new window.Blob(["x"]));
window.URL.createObjectURL = () => "blob:falso";
window.URL.revokeObjectURL = () => {};
window.addEventListener("error", e => errs.push("window error: " + e.message));

// La app vive dentro de un IIFE, así que su estado `S` es privado (a propósito).
// Para inspeccionarlo lo observamos desde afuera: capturamos los Blob que exporta.
const blobs = [];
const BlobReal = window.Blob;
window.Blob = function (partes, opts) { blobs.push({ partes, type: opts && opts.type }); return new BlobReal(partes, opts); };

const script = html.match(/<script>([\s\S]*?)<\/script>/g).pop().replace(/<\/?script>/g, "");
try { window.eval(script); } catch (e) { errs.push("eval del script: " + e.message); }

const click = sel => {
  const el = document.querySelector(sel);
  if (!el) { errs.push("falta el selector " + sel); return; }
  try { el.dispatchEvent(new window.MouseEvent("click", { bubbles: true })); }
  catch (e) { errs.push(sel + " click: " + e.message); }
};

// cada herramienta del rail (dispara setTool -> openToolColor -> rueda de color)
document.querySelectorAll(".tool").forEach(b => {
  try { b.dispatchEvent(new window.MouseEvent("click", { bubbles: true })); }
  catch (e) { errs.push("tool " + b.dataset.tool + ": " + e.message); }
});
// generador: los 3 tipos
click("#genBtn");
click('#genTypeSeg [data-gtype="rooms"]'); click('#genSizeSeg [data-gsize="s"]'); click("#genGo");
click('#genTypeSeg [data-gtype="caves"]'); click("#genGo");
click('#genTypeSeg [data-gtype="maze"]'); click("#genGo");
// deshacer / rehacer
click("#undoBtn"); click("#redoBtn"); click("#redoBtn"); click("#undoBtn");
// instrucciones
click("#instrBtn"); click("#instrBtn");
// segmentos contextuales
click('#eraserTargetSeg [data-etgt="all"]');
click('#eraserShapeSeg [data-eshape="circle"]');
click('#shapeSeg [data-shape="polygon"]');
// exports (ejercita los serializadores; PNG usa el toBlob falso)
click("#exportBtn");
document.querySelectorAll("#exportMenu button").forEach(b => {
  try { b.dispatchEvent(new window.MouseEvent("click", { bubbles: true })); }
  catch (e) { errs.push("export " + b.dataset.fmt + ": " + e.message); }
});

// Verifica el estado por observación: el .json exportado arriba trae el mapa entero.
const capJson = blobs.filter(b => b.type === "application/json").pop();
if (!capJson) errs.push("el export JSON no produjo un Blob");
else {
  const d = JSON.parse(capJson.partes.join(""));
  console.log("mapa exportado: v" + d.v, "| celdas:", d.cells.length, "| puertas:", d.doors.length,
              "| escaleras:", d.stairs.length, "| etiquetas:", (d.labels || []).length);
  if (d.v !== 4) errs.push("versión del mapa inesperada: " + d.v);
  if (!Array.isArray(d.labels)) errs.push("falta el campo labels en el guardado (gancho EXT.save roto)");
  if (!d.col || !d.col.label || !d.col.fill) errs.push("faltan colores nuevos (label/fill) en el guardado");
  // tras generar+deshacer/rehacer debe quedar una mazmorra con contenido real
  if (d.cells.length < 50) errs.push("el mapa quedó casi vacío tras generar (" + d.cells.length + " celdas)");
}
const capSvg = blobs.filter(b => b.type === "image/svg+xml").pop();
if (!capSvg) errs.push("el export SVG no produjo un Blob");

console.log(errs.length
  ? "ERRORES:\n" + errs.join("\n")
  : "OK — sin errores de runtime (herramientas, generador x3, deshacer/rehacer, exports, guardado)");
process.exit(errs.length ? 1 : 0);
