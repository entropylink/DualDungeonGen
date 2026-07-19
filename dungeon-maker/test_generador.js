// test_generador.js — invariantes del generador aleatorio.
// Corre los 3 tipos × 3 tamaños × N intentos y verifica que lo generado sea jugable.
const { leerScript, grab } = require("./extraer");
const js = leerScript();

function pk(k) { const i = k.indexOf(","); return [+k.slice(0, i), +k.slice(i + 1)]; }
eval(grab(js, "makeRng"));
eval(grab(js, "genRooms"));
eval(grab(js, "genCaves"));
eval(grab(js, "genMaze"));

// GEN_SIZES se lee de la app para no desincronizarse.
const GEN_SIZES = eval("(" + js.match(/const GEN_SIZES\s*=\s*(\{[\s\S]*?\});/)[1] + ")");

// ¿Todo el piso es alcanzable desde cualquier celda de piso? (4-conectado)
function conectado(floor) {
  if (!floor.size) return false;
  const inicio = floor.values().next().value;
  const q = [inicio], visto = new Set([inicio]);
  while (q.length) {
    const [x, y] = pk(q.pop());
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const k = (x + dx) + "," + (y + dy);
      if (floor.has(k) && !visto.has(k)) { visto.add(k); q.push(k); }
    }
  }
  return visto.size === floor.size;
}

const TRIALS = +(process.env.TRIALS || 12);
let fallas = 0, corridas = 0;

for (const size of ["s", "m", "l"]) {
  for (let t = 0; t < TRIALS; t++) {
    // --- salas y pasillos ---
    const r = genRooms(Object.assign({}, GEN_SIZES[size], { water: true }), makeRng(1000 + t * 37 + size.charCodeAt(0)));
    if (r) {
      corridas++;
      if (!conectado(r.floor)) { console.log("FALLA salas: no conectado", size, t); fallas++; }
      if (r.stairs.length !== 2) { console.log("FALLA salas: escaleras", size, t, r.stairs.length); fallas++; }
      for (const st of r.stairs) {
        let ok = true;
        for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) if (!r.floor.has((st.cx + i) + "," + (st.cy + j))) ok = false;
        if (!ok) { console.log("FALLA salas: escalera fuera del piso", size, t); fallas++; break; }
      }
    }
    // --- cuevas ---
    const cv = genCaves(Object.assign({}, GEN_SIZES[size], { water: true }), makeRng(5000 + t * 101 + size.charCodeAt(0)));
    if (cv) {
      corridas++;
      if (!conectado(cv.floor)) { console.log("FALLA cuevas: no conectado", size, t); fallas++; }
      for (const k of cv.water) if (!cv.floor.has(k)) { console.log("FALLA cuevas: agua fuera del piso", size, t); fallas++; break; }
    }
    // --- laberinto ---
    const mz = genMaze(Object.assign({}, GEN_SIZES[size], { water: false }), makeRng(9000 + t * 13 + size.charCodeAt(0)));
    corridas++;
    if (!conectado(mz.floor)) { console.log("FALLA laberinto: no conectado", size, t); fallas++; }
    if (mz.stairs.length === 2) {
      const d = Math.abs(mz.stairs[0].cx - mz.stairs[1].cx) + Math.abs(mz.stairs[0].cy - mz.stairs[1].cy);
      if (d < 3) { console.log("FALLA laberinto: escaleras encimadas", size, t); fallas++; }
    }
    // los pasillos del laberinto deben ser bloques completos de 5ft (2x2 celdas)
    let malos = 0;
    mz.floor.forEach(k => {
      const [x, y] = pk(k), ax = x - ((x % 2) + 2) % 2, ay = y - ((y % 2) + 2) % 2;
      for (let j = 0; j < 2; j++) for (let i = 0; i < 2; i++) if (!mz.floor.has((ax + i) + "," + (ay + j))) malos++;
    });
    if (malos) { console.log("FALLA laberinto: bloques de 5ft incompletos", size, t, malos); fallas++; }
  }
}

console.log("corridas:", corridas);
console.log(fallas === 0
  ? "OK — invariantes del generador (3 tipos x 3 tamaños x " + TRIALS + " intentos)"
  : "FALLAS: " + fallas);
process.exit(fallas ? 1 : 0);
