// extraer.js — utilidades compartidas por las pruebas.
// Extrae el <script> de mazmorra.html y permite sacar funciones sueltas por nombre.
// Se auto-extrae del HTML, así que sigue funcionando aunque la app cambie.
const fs = require("fs");
const path = require("path");

const HTML = process.env.MAZMORRA_HTML || path.join(__dirname, "..", "mazmorra.html");

function leerHtml() {
  if (!fs.existsSync(HTML)) {
    console.error("No encuentro " + HTML + " — pon mazmorra.html junto a la carpeta herramientas/, o exporta MAZMORRA_HTML=/ruta/al/archivo.html");
    process.exit(2);
  }
  return fs.readFileSync(HTML, "utf8");
}

// El script de la app es el ÚLTIMO bloque <script> del archivo.
function leerScript() {
  const bloques = leerHtml().match(/<script>([\s\S]*?)<\/script>/g);
  if (!bloques || !bloques.length) { console.error("No hay bloque <script> en el HTML"); process.exit(2); }
  return bloques[bloques.length - 1].replace(/<\/?script>/g, "");
}

// Saca el texto de una función por nombre, balanceando llaves.
function grab(js, nombre) {
  const i = js.indexOf("function " + nombre);
  if (i < 0) throw new Error("función no encontrada en la app: " + nombre);
  let d = 0;
  const j = js.indexOf("{", i);
  for (let k = j; k < js.length; k++) {
    if (js[k] === "{") d++;
    if (js[k] === "}") { d--; if (!d) return js.slice(i, k + 1); }
  }
  throw new Error("llaves desbalanceadas en: " + nombre);
}

module.exports = { HTML, leerHtml, leerScript, grab };
