# dungeon-maker/ — verificación de `mazmorra.html`

**No hay navegador en el contenedor.** Por eso la app se verifica así. Nunca declares
que algo "funciona" sin correr esto. Ver `HANDOFF.md` §6.

## Correr todo (un comando)

Los tests viven **junto a** `mazmorra.html`, en esta misma carpeta. Desde aquí:

```bash
MAZMORRA_HTML="$PWD/mazmorra.html" bash verificar.sh
```

Espera `TODO VERDE ✓`. Ojo: por defecto los scripts todavía buscan `mazmorra.html`
**un nivel arriba** (herencia de cuando vivían en una subcarpeta `herramientas/`),
así que con el layout actual hay que pasar la ruta con la variable `MAZMORRA_HTML`
— la soportan tanto `verificar.sh` como `extraer.js`, y sirve igual para apuntar a
otro archivo. En Windows, para correr un test de Node directo desde PowerShell:

```powershell
$env:MAZMORRA_HTML = "$PWD\mazmorra.html"; node test_smoke.js
```

## Preparación (una vez por sesión)

```bash
npm install jsdom@24 --no-fund --no-audit --loglevel=error   # smoke test
pip install pypdf --break-system-packages -q                 # validación de PDF
```

Sin estos, `verificar.sh` no truena: salta esos bloques y lo avisa. Igual **instálalos**
— el smoke test es el que caza los bugs de verdad.

## Qué hace cada prueba

| archivo | qué verifica |
|---|---|
| `verificar.sh` | corre los 6 bloques y resume |
| `extraer.js` | helper: saca el `<script>` y funciones sueltas del HTML |
| `test_smoke.js` | **la más importante.** Corre la app entera en jsdom con canvas falso: clickea cada herramienta, el generador ×3, deshacer/rehacer y los 4 exports. Caza errores de cableado que `node --check` no ve. |
| `test_generador.js` | 3 tipos × 3 tamaños × 12 intentos: piso 100% conectado, escaleras en piso seco, agua sobre piso, pasillos del laberinto en bloques completos de 5ft |
| `test_puertas.js` | regresión del bug de "puertas volando": cada puerta en un pellizco real de 1 unidad, sin flotantes ni duplicadas (75 mazmorras) |
| `test_exports.js` | escribe `/tmp/prueba.svg` y `/tmp/prueba.pdf` con acentos y `& < >`; `verificar.sh` los valida con minidom y pypdf |

Sube el número de intentos: `TRIALS=50 node test_generador.js`

## Cómo están hechas

Las pruebas **se auto-extraen del HTML en tiempo de ejecución** (`extraer.js` → `grab()`),
no traen copias pegadas del código. Por eso siguen sirviendo cuando la app cambia.

⚠️ La app vive dentro de un IIFE, así que su estado `S` es **privado**. Las pruebas
**no pueden leer `S`** — observan desde afuera capturando los `Blob` que exporta
(`test_smoke.js` lo hace así). Si escribes una prueba nueva, sigue ese patrón.
