# HANDOFF — Cartógrafo de Mazmorras (`mazmorra.html`)

> **Léeme primero para retomar en una conversación nueva.**
> **Estado: enviable y estable.** App de una sola página, funcional de punta a punta,
> con verificación automatizada en verde. No está "a medias": lo que existe funciona.
> Lo que sigue son features nuevas, no arreglos pendientes.

---

## 1. Lo esencial de contexto

| | |
|---|---|
| **Proyecto** | Cartógrafo de Mazmorras — creador de mapas de mazmorra estilo Dungeon Scrawl |
| **Dueño** | Francis (Francisco Quiroz) · marca **Entropy** · entropy.com.mx |
| **Entregable** | **UN archivo**: `mazmorra.html` (130,206 bytes · 1,643 líneas) |
| **Repo / git** | **NO HAY.** Ver "La regla de oro" abajo. |
| **Idioma de trabajo** | Español mexicano con Francis. **UI en español, comentarios del código en inglés.** Respeta esa división. |
| **Estilo de trato** | Directo y seco. Decisiones, no preguntas. Honestidad brutal sobre lo que no se verificó. Sin adulación. |

### ⚠️ La regla de oro: NO HAY REPOSITORIO

El contenedor **se borra entre conversaciones**. En esta sesión `/home/claude` amaneció
vacío: el código de trabajo y todos los harnesses de prueba se perdieron. Lo único que
sobrevivió fue el archivo entregado.

**Por lo tanto:**

1. La **única fuente de verdad** es el `mazmorra.html` que Francis tiene descargado.
2. Al empezar una sesión nueva, **Francis debe subir `mazmorra.html`** (y de preferencia
   la carpeta `herramientas/`). Sin eso no hay proyecto.
3. Lo primero que haces es copiarlo a `/home/claude/` y correr la verificación (§6).
4. Al terminar, **siempre** copiar a `/mnt/user-data/outputs/` y llamar `present_files`.
   Si no, el trabajo se pierde.

---

## 2. Qué es el proyecto

Un creador de mapas de mazmorra para TTRPG, en **un solo archivo HTML autocontenido**
(sin build, sin instalación, sin cuenta, sin servidor — se abre con doble clic y jala
offline). Estética Dungeon Scrawl: piso crema, tinta negra, puertas de caja hueca.

**La tesis del producto** (esto guía cada decisión de diseño):

> Piso de entrada tan bajo que un niño lo usa; techo tan alto que un DM profesional
> le saca provecho.

El mercado está partido en tres bandos y casi nadie los junta:

- **Generadores instantáneos** (Watabou) → rapidísimos, casi no se editan después.
- **Editores potentes** (Dungeondraft) → control total, pero de paga, se instala,
  y no trae fog of war ni tokens.
- **Listos-para-jugar** (Dungeon Scrawl) → capas, fog, export a VTT… pero lo bueno
  está tras suscripción Pro.

Esta app ya es **generador + editor** en un archivo, gratis y offline. La jugada
estratégica es sumarle lo *listo-para-jugar* (§8) para ser el único que junta los tres.

---

## 3. Estado actual — qué existe y está verificado

**11 herramientas** en el rail izquierdo:
`shape` (figura) · `pencil` (lápiz) · `eraser` (goma) · `bucket` (bote) · `wall` (muro) ·
`door` (puerta) · `stairs` (escaleras) · `object` (objeto) · `label` (etiqueta) ·
`measure` (regla) · `pan` (mover)

**Sistemas completos:**

- **Pintado**: figuras (rect/círculo/polígono), lápiz con grosor 2.5–15ft, terreno
  piso/agua, texturas importables por galería con mosaico ajustable.
- **Muros con doble comportamiento**: **dentro** de un cuarto pintado → línea recta;
  **fuera** (espacio vacío) → trazo en **escalera** alineado al grid. Se dibujan **en
  cadena** (cada clic continúa; clic derecho o botón flotante termina). Imán a vértices.
- **Autorelleno de encierro**: cerrar un loop rellena de piso **solo lo que ese muro
  acaba de encerrar** — compara la región con y sin el muro nuevo. Un hoyo que ya
  estaba encerrado no se toca. Funciona en triángulos y polígonos irregulares.
- **Prioridad del outline**: el contorno automático se dibuja **encima** de los muros
  manuales, así un muro manual sobre el borde del piso se lee como muro exterior.
- **Goma unificada**: objetivo (Piso / Objetos / Todo) × forma (libre / rect / círculo /
  polígono) × tamaño 2.5–20ft.
- **Bote**: repinta a un color; modos Todo / Entre muros.
- **Rueda de color contextual**: se abre sola al elegir cualquier herramienta que pinta,
  y se queda fija. HSV + hex + RGB + paleta. (Matemática validada: 14/14 roundtrips.)
- **Etiquetas** (`label`): texto en el mapa, editable, movible, con giro/tamaño/color.
  **Es el módulo de referencia del sistema EXT** (§4) — cópialo para features nuevas.
- **Regla** (`measure`): distancia en ft en vivo.
- **9 props incluidos** (cofre, mesa, silla, barril, cama, pilar, altar, antorcha,
  trampa) como SVG embebidos — el usuario nuevo no tiene que importar nada.
- **Generador aleatorio**: 3 tipos (salas+pasillos, cuevas, laberinto) × 3 tamaños ×
  agua sí/no. Coloca puertas y escaleras solo.
- **Deshacer/Rehacer** (50 pasos), guardar/abrir `.json` editable, arrastrar-y-soltar.
- **Exports**: PNG (render completo) · SVG · PDF (ambos vectoriales, con **texto real
  seleccionable**, acentos incluidos) · JSON editable.

**Números de la verificación** (todo en verde hoy):

- 108 mazmorras generadas: 100% conectadas, escaleras siempre en piso seco.
- 75 mazmorras validadas puerta por puerta: cero flotantes, cero duplicadas.
  Promedio 9.7 puertas/mazmorra.
- Smoke de runtime: cada herramienta + generador ×3 + deshacer/rehacer + 4 exports,
  cero errores.

**Lo que NO existe** (sé honesto con Francis, no lo vendas como hecho):
capas · fog of war / vista de jugador · export a VTT (.uvtt) · llave numerada de salas ·
tipos/estados de puerta · iluminación · rejilla hex o isométrica · multi-nivel ·
selección múltiple / copiar-pegar · autoguardado (prohibido, ver §7).

---

## 4. Cómo funciona (arquitectura)

Un solo archivo: `<style>` (~223 líneas) + HTML + un `<script>` (~98k chars, ~1,142
líneas) envuelto en **IIFE con `"use strict"`**.

> **Ojo:** por el IIFE, el estado `S` es **privado** — no se asoma a `window`. Es a
> propósito. Las pruebas **no pueden leer `S`**; deben observar desde afuera (capturando
> los `Blob` que exporta). El smoke test ya hace esto.

### Sistema de coordenadas (la base de todo)

- Celda base = **2.5 ft** = 21 px a zoom 1 (`S.base=21`, `cs()=base*zoom`).
- **5 ft = 2×2 celdas.** La rejilla de 5ft cae en coordenadas **pares**.
- `snap(wx,wy,five)` redondea a entero (2.5ft) o a par (5ft, con Shift).
- Celdas se llavean como string `"x,y"`; `pk(k)` la parte de vuelta a `[x,y]`.

### Estado `S`

```js
S.cells   // Map "x,y" -> {t:'floor'|'water', col, tex, tile}   color/textura horneados al pintar
S.walls   // [{x1,y1,x2,y2,col,tex,tile}]  segmentos manuales (aceptan diagonal)
S.doors   // [{x1,y1,x2,y2,col}]
S.stairs  // [{x1,y1,x2,y2,x3,y3,x4,y4,col}]   4 puntos
S.objects // [{el,_a,x,y,cw,ratio,rot,tint,flip}]
S.labels  // [{x,y,text,size,col,rot}]
S.col     // colores del PINCEL (lo nuevo) + .fill (el del bote) + .bg global
```

Regla clave: **el color/textura se hornea en cada elemento al crearlo.** Cambiar el
pincel no repinta lo existente — para eso está el bote.

### 🔌 EXT — el sistema de módulos (úsalo)

```js
const EXT = { draw:[], save:[], load:[], clear:[], snapshot:[], restore:[] };
```

Una feature nueva se engancha a render, guardado, carga, limpiar y deshacer **sin tocar
el núcleo**. Se llaman desde: `drawScene` (draw), `saveMap` (save), `applyMap` (load),
botón Limpiar + generador (clear), `snapshot`/`restore` (undo).

**El módulo de etiquetas es el ejemplo canónico** — son ~35 líneas que registran los 4
ganchos. Cópialo tal cual para la siguiente feature.

### Pipeline de render

`render()` → `drawScene(g,c,ox,oy,w,h)`:
1. fondo → `renderCells` (color por lote, luego texturas por lote) → `drawGrid`
2. `drawWalls`: sombra → **muros manuales** agrupados por estilo → **perímetro ENCIMA**
   (← esto es la prioridad del outline; el orden importa)
3. puertas → escaleras → objetos → **`EXT.draw`**
4. `drawOverlays` (previews, regla, selección)

`perimSegments()` deriva el contorno **solo de celdas de piso** (agua no genera muro).
`chain()` une segmentos en polilíneas para que las esquinas se vean continuas.

### Export vectorial

`buildPrimitives(b)` → lista de `{op:"rect"|"seg"|"poly"|"text"}` → `primitivesToSVG` o
`primitivesToPDF`. **El PDF está hecho a mano** (`%PDF-1.4`, 5 objetos, xref de 20 bytes,
fuente Helvetica-Bold, `WinAnsiEncoding`). Es frágil: solo latin-1, y si le agregas un
objeto tienes que cuadrar el xref. PNG va por otro lado (`drawScene` a un canvas oculto).

### Detalles que ya costaron trabajo (no los rompas)

- `crossesWall(ax,ay,bx,by,walls?)` — bloquea el flood si el segmento centro-a-centro
  **cruza** un muro. Es lo que hace que el autorelleno funcione con diagonales.
- `enclosedFillSegs(segs)` — rellena solo lo **recién** encerrado (compara antes/después).
  Si parte un vacío en dos, rellena el **más chico**; si quedan 50/50, ninguno.
- `buildStair(a,b)` — trazo ortogonal en escalera; pasos de 5ft si ambos extremos caen
  en grid par, si no de 2.5ft.
- **Puertas del generador**: solo en **pellizcos reales de 1 unidad** (roca flanqueando
  ambos lados). Si el cuarto y el pasillo se funden en ancho >1, ahí **no hay muro** →
  no va puerta (ése era el bug de "puertas volando"). Luego poda: un tramo de pasillo
  que conecta 2 bocas y mide **≤ `LONGC`=14 unidades (70 ft)** conserva **una sola**
  puerta. Ese 14 es la perilla si Francis lo quiere más generoso.

---

## 5. Estructura de archivos

```
mazmorra.html            ← EL PROYECTO. Fuente de verdad y entregable, todo en uno.
HANDOFF.md               ← este documento
herramientas/            ← verificación (reconstruida; se auto-extrae del HTML)
├── README.md            ← cómo correrla
├── verificar.sh         ← ▶ UN COMANDO corre todo
├── extraer.js           ← saca el <script> y funciones sueltas del HTML
├── test_generador.js    ← invariantes del generador (conectividad, escaleras, agua)
├── test_puertas.js      ← regresión del bug de puertas flotantes
├── test_exports.js      ← escribe SVG/PDF de prueba (con acentos)
└── test_smoke.js        ← ▶ LA MÁS IMPORTANTE: corre la app entera en jsdom
```

Las pruebas **se auto-extraen del HTML en tiempo de ejecución**, así que siguen sirviendo
aunque la app cambie. No tienen copias pegadas del código que se desincronicen.

---

## 6. Cómo verificar (no hay navegador en el contenedor)

Ésta es **la** disciplina del proyecto. Nunca digas "funciona" sin correr esto.

```bash
# preparación en una sesión nueva
cp /mnt/user-data/uploads/mazmorra.html /home/claude/
cp -r /mnt/user-data/uploads/herramientas /home/claude/   # si Francis las subió
cd /home/claude
npm install jsdom@24 --no-fund --no-audit --loglevel=error   # para el smoke
pip install pypdf --break-system-packages -q                 # para validar PDF

# ▶ todo de un jalón
bash herramientas/verificar.sh
```

Corre 6 bloques: sintaxis JS · IDs del DOM referenciados vs definidos · invariantes del
generador · colocación de puertas · exports (SVG con minidom, PDF con pypdf) · smoke de
runtime. Termina en `TODO VERDE ✓` o te dice qué bloque falló.

```bash
# ▶ enviar (SIEMPRE al terminar)
cp /home/claude/mazmorra.html /mnt/user-data/outputs/mazmorra.html
# ... luego llama a la tool present_files
```

**Ciclo de trabajo por cada cambio:** editar → `verificar.sh` → `cp` a outputs →
`present_files` → resumen conciso en español.

---

## 7. Convenciones, restricciones y trampas

**Restricciones del entorno (no negociables):**

- **Sin navegador** en el contenedor → de ahí toda la §6.
- **Prohibido `localStorage`/`sessionStorage`** (regla de artifacts). Hoy el archivo
  tiene **cero** — mantenlo así. Por eso no hay autoguardado; el guardado JSON +
  arrastrar-y-soltar lo cubre.
- Scripts externos solo desde `cdnjs.cloudflare.com`. **Hoy la única dependencia externa
  es Google Fonts** (Cinzel + IBM Plex Mono + Crimson Pro). Todo lo demás es propio.
- `create_file` **falla si el path ya existe** → usa `cp` para sobrescribir en outputs.
- El contenedor se borra entre sesiones (§1).

**Convenciones del código:**

- Un solo archivo, sin build, sin dependencias. Es el punto del producto — no lo partas.
- **UI en español, comentarios en inglés.**
- Estilo denso: funciones de una o dos líneas, mucho por línea. Es intencional; síguelo.
- Features nuevas → **por `EXT`**, no metiendo código al núcleo.
- Tema: Cinzel + Crimson Pro + IBM Plex Mono, espresso oscuro (`#0e0709`/`#b89857`),
  acento `#cf9a44`. Piso `#dccbab`, tinta `#16120c`.
- Sin `alert`/`confirm` — hay `toast()` propio.

**Trampas conocidas:**

- `S` es privada por el IIFE → las pruebas observan por `Blob`, no leyendo `S`.
- El orden en `drawWalls` **es** la feature de prioridad del outline. Si reordenas, la
  rompes.
- El PDF hecho a mano: agregar objetos exige recalcular el xref; solo latin-1.
- `wallOnEdge`/`segCovers` quedaron **sin uso** tras migrar a `crossesWall` (inofensivos).
- El "modo" del muro (recto vs escalera) se decide por **dónde pasa el trazo**, no por
  dónde empieza: gana la mayoría de celdas que cruza.

---

## 8. Qué sigue (investigado, priorizado)

Salió de un estudio del mercado (Dungeon Scrawl, Dungeondraft, Dungeon Alchemist,
Watabou). El combo ganador es el **Tier 1 completo**: te para junto a Dungeon Scrawl en
lo *jugable* y junto a Watabou en lo *rápido*, ganándoles en *gratis, sin instalar,
offline*.

**Orden sugerido** (Francis aún no eligió por cuál arrancar — pregúntale):

1. **Llave numerada + notas por sala** — lo más clásico de un dungeon y casi nadie lo
   integra bien al dibujo. Reusa el módulo de etiquetas → pin numerado + leyenda
   exportable. Alto valor, encaja en EXT, sin tocar el núcleo.
2. **Tipos/estados de puerta** — cerrada/abierta, con llave, secreta, doble, rastrillo.
   Barato (variaciones de dibujo sobre lo que ya hay), mucho sabor.
3. **Export UVTT/`.dd2vtt`** — el pedido #1 de la gente de Watabou. Ya tienes muros y
   puertas como datos: es poco código y diferenciador enorme (cae en Foundry/Roll20 con
   las paredes ya puestas).
4. **Capas** — habilitador de todo lo demás. ⚠️ Toca el modelo de datos: sesión dedicada.
5. **Fog of war + vista de jugador** (sobre capas) — para juego presencial en TV.
6. Techo: rejilla hex/isométrica · multi-nivel · presets de estilo de un clic ·
   iluminación dinámica (la más cara; ni Dungeon Scrawl la tiene terminada).

Ganancias rápidas si Francis quiere algo chico: brújula + barra de escala · más terrenos
(lava, abismo, escombro) · overlay de pergamino · impresión en póster multi-hoja a
escala real.

Los puntos 1–3 se hacen **sin reestructurar nada**. Los puntos 4–5 sí tocan el modelo de
datos y el pipeline de render — avísale a Francis antes de meterte.

---

## 9. Una línea para la siguiente sesión

> App de mazmorras de un solo archivo, estable y verificada (`mazmorra.html` + `herramientas/verificar.sh`); **no hay git, así que pídele a Francis que suba el HTML antes de tocar nada**, engancha features nuevas por `EXT` como hace el módulo de etiquetas, y siempre `cp` a `/mnt/user-data/outputs/` + `present_files` al terminar.
