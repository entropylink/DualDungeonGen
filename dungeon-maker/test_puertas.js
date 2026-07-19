// test_puertas.js — regresión del bug "puertas volando".
// Cada puerta generada debe estar en un pellizco REAL de 1 unidad (5ft):
//   piso a ambos lados, y roca flanqueando la línea de la puerta.
// Si el hueco continúa a un lado, ahí no hay muro -> no debe haber puerta.
const { leerScript, grab } = require("./extraer");
const js = leerScript();

function pk(k) { const i = k.indexOf(","); return [+k.slice(0, i), +k.slice(i + 1)]; }
eval(grab(js, "makeRng"));
eval(grab(js, "genRooms"));
const GEN_SIZES = eval("(" + js.match(/const GEN_SIZES\s*=\s*(\{[\s\S]*?\});/)[1] + ")");

// una unidad de 5ft es piso si su celda ancla está en el set (el generador escala x2)
const uf = (floor, ux, uy) => floor.has((ux * 2) + "," + (uy * 2));

function puertaValida(d, floor) {
  if (d.x1 === d.x2) {                      // puerta vertical
    const uy = d.y1 / 2, uL = d.x1 / 2 - 1, uR = d.x1 / 2;
    if (!(uf(floor, uL, uy) && uf(floor, uR, uy))) return "sin-piso-en-ambos-lados";
    if (uf(floor, uL, uy + 1) && uf(floor, uR, uy + 1)) return "el-hueco-sigue-abajo";
    if (uf(floor, uL, uy - 1) && uf(floor, uR, uy - 1)) return "el-hueco-sigue-arriba";
  } else {                                   // puerta horizontal
    const ux = d.x1 / 2, uT = d.y1 / 2 - 1, uB = d.y1 / 2;
    if (!(uf(floor, ux, uT) && uf(floor, ux, uB))) return "sin-piso-en-ambos-lados";
    if (uf(floor, ux + 1, uT) && uf(floor, ux + 1, uB)) return "el-hueco-sigue-a-la-derecha";
    if (uf(floor, ux - 1, uT) && uf(floor, ux - 1, uB)) return "el-hueco-sigue-a-la-izquierda";
  }
  return null;
}

const TRIALS = +(process.env.TRIALS || 25);
let fallas = 0, totalPuertas = 0, corridas = 0;

for (const size of ["s", "m", "l"]) {
  for (let t = 0; t < TRIALS; t++) {
    const r = genRooms(Object.assign({}, GEN_SIZES[size], { water: true }), makeRng(42 + t * 97 + size.charCodeAt(0) * 13));
    if (!r) continue;
    corridas++; totalPuertas += r.doors.length;
    for (const d of r.doors) {
      const mal = puertaValida(d, r.floor);
      if (mal) { console.log("FALLA", size, t, mal, JSON.stringify(d)); fallas++; }
    }
    const vistos = new Set();
    for (const d of r.doors) {
      const k = [d.x1, d.y1, d.x2, d.y2].join("|");
      if (vistos.has(k)) { console.log("FALLA puerta duplicada", size, t); fallas++; }
      vistos.add(k);
    }
  }
}

console.log("mazmorras:", corridas, "| promedio de puertas:", (totalPuertas / corridas).toFixed(1));
console.log(fallas === 0
  ? "OK — todas las puertas en pellizcos válidos de 1 unidad, sin flotantes ni duplicadas"
  : "FALLAS: " + fallas);
process.exit(fallas ? 1 : 0);
