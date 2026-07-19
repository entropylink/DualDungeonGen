// test_exports.js — los serializadores vectoriales (SVG/PDF) hechos a mano.
// Escribe /tmp/prueba.svg y /tmp/prueba.pdf; valídalos con verificar.sh (minidom + pypdf).
// Incluye acentos y & < > para cazar problemas de escape.
const fs = require("fs");
const { leerScript, grab } = require("./extraer");
const js = leerScript();

function r3(n) { return Math.round(n * 1000) / 1000; }
eval(grab(js, "primitivesToSVG"));
eval(grab(js, "primitivesToPDF"));

const b = { minX: 0, minY: 0, maxX: 20, maxY: 14 };
const P = [
  { op: "rect", x: 0, y: 0, w: 20, h: 14, fill: "#2c2e33" },
  { op: "rect", x: 2, y: 2, w: 8, h: 6, fill: "#dccbab" },
  { op: "poly", pts: [[12, 2], [18, 2], [12, 8]], fill: "#dccbab" },
  { op: "seg", x1: 2, y1: 2, x2: 10, y2: 2, stroke: "#16120c", w: 0.4, cap: "round" },
  { op: "poly", pts: [[4, 8], [6, 8], [6, 8.6], [4, 8.6]], fill: "#f6f3ec", stroke: "#16120c", w: 0.28, round: true },
  { op: "text", x: 6, y: 5, text: "Sala del Dragón ñ <&>", size: 1.4, fill: "#241c12", rot: 0 },
  { op: "text", x: 14, y: 11, text: "Cripta", size: 1.1, fill: "#241c12", rot: 35 }
];

fs.writeFileSync("/tmp/prueba.svg", primitivesToSVG(P, b));
fs.writeFileSync("/tmp/prueba.pdf", primitivesToPDF(P, b), "latin1");
console.log("OK — escritos /tmp/prueba.svg y /tmp/prueba.pdf (valídalos con verificar.sh)");
