#!/usr/bin/env bash
# verificar.sh — corre TODA la verificación de mazmorra.html.
# Uso:  bash herramientas/verificar.sh            (usa ../mazmorra.html)
#       MAZMORRA_HTML=/ruta/x.html bash herramientas/verificar.sh
#
# No hay navegador en el contenedor: por eso se valida así.
set -uo pipefail
cd "$(dirname "$0")"
HTML="${MAZMORRA_HTML:-$(cd .. && pwd)/mazmorra.html}"
export MAZMORRA_HTML="$HTML"
fallas=0

echo "=== archivo: $HTML"
[ -f "$HTML" ] || { echo "NO EXISTE"; exit 2; }

echo "=== 1/5 sintaxis JS (node --check) ==="
python3 - <<'EOF' || exit 2
import re, os
src = open(os.environ["MAZMORRA_HTML"]).read()
js = re.findall(r'<script>(.*?)</script>', src, re.DOTALL)[-1]
open('/tmp/app.js', 'w').write(js)
print("  script extraído:", len(js), "chars")
EOF
node --check /tmp/app.js && echo "  OK" || { echo "  FALLA"; fallas=$((fallas+1)); }

echo "=== 2/5 IDs del DOM referenciados vs definidos ==="
python3 - <<'EOF' || fallas=$((fallas+1))
import re, os, sys
src = open(os.environ["MAZMORRA_HTML"]).read()
js  = re.findall(r'<script>(.*?)</script>', src, re.DOTALL)[-1]
refs = set(re.findall(r'getElementById\("([^"]+)"\)', js))
ids  = set(re.findall(r'id="([^"]+)"', src))
falta = refs - ids
print("  FALTAN:", sorted(falta)) if falta else print("  OK — ninguno faltante")
sys.exit(1 if falta else 0)
EOF

echo "=== 3/5 invariantes del generador ==="
node test_generador.js || fallas=$((fallas+1))

echo "=== 4/5 colocación de puertas ==="
node test_puertas.js || fallas=$((fallas+1))

echo "=== 5/5 exports vectoriales ==="
node test_exports.js || fallas=$((fallas+1))
python3 - <<'EOF' || fallas=$((fallas+1))
import xml.dom.minidom as m, sys
d = m.parse('/tmp/prueba.svg')
print("  SVG bien formado |", len(d.getElementsByTagName('text')), "textos")
try:
    from pypdf import PdfReader
except ImportError:
    print("  (pypdf no instalado: pip install pypdf --break-system-packages  — salto validación PDF)")
    sys.exit(0)
r = PdfReader('/tmp/prueba.pdf'); t = r.pages[0].extract_text()
print("  PDF válido |", len(r.pages), "página | texto:", repr(t))
assert 'Drag' in t and 'Cripta' in t, "falta texto en el PDF"
print("  OK")
EOF

echo "=== smoke de runtime (jsdom) ==="
if node -e "require('jsdom')" 2>/dev/null; then
  node test_smoke.js || fallas=$((fallas+1))
else
  echo "  SALTADO — corre 'npm install jsdom' para habilitarlo (MUY recomendado)"
fi

echo
[ "$fallas" -eq 0 ] && echo "TODO VERDE ✓" || echo "$fallas BLOQUE(S) CON FALLAS ✗"
exit "$fallas"
