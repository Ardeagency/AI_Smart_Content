#!/bin/bash
#
# build-css.sh — Genera css/bundle-v1.css (legacy) concatenando los CSS de css/legacy/.
# El bundle activo es css/bundle.css (estilo unificado v2). No sobrescribir bundle.css.
# Ejecutar desde la raiz:  bash scripts/build-css.sh
#

set -e

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CSS="$ROOT/css/legacy"
OUT="$ROOT/css/bundle-v1.css"

FILES=(
  "base.css"
  "app.css"
  "navigation.css"
  "landing.css"
  "signin.css"
  "planes.css"
  "hogar.css"
  "brands.css"
  "audiences.css"
  "create.css"
  "content.css"
  "settings.css"
  "living.css"
  "studio.css"
  "flow-catalog.css"
  "products.css"
  "product-detail.css"
  "form-record.css"
  "organization.css"
  "developer.css"
  "payment-modal.css"
  "login.css"
  "style.css"
)

echo "/* ============================================================" > "$OUT"
echo "   AI Smart Content — CSS Bundle v1 / Legacy (generado por build-css.sh)" >> "$OUT"
echo "   Bundle activo de la app: css/bundle.css (v2 unificado)" >> "$OUT"
echo "   ============================================================ */" >> "$OUT"
echo "" >> "$OUT"

TOTAL=0

for FILE in "${FILES[@]}"; do
  SRC="$CSS/$FILE"
  if [ ! -f "$SRC" ]; then
    echo "  WARN: $FILE no encontrado, saltando."
    continue
  fi
  LINES=$(wc -l < "$SRC" | tr -d ' ')
  TOTAL=$((TOTAL + LINES))
  echo "" >> "$OUT"
  echo "/* ========== $FILE ($LINES lineas) ========== */" >> "$OUT"
  echo "" >> "$OUT"
  cat "$SRC" >> "$OUT"
  echo "" >> "$OUT"
done

BUNDLE_LINES=$(wc -l < "$OUT" | tr -d ' ')
echo ""
echo "bundle-v1.css (legacy) generado: $BUNDLE_LINES lineas ($TOTAL de fuentes)"
echo "Archivos incluidos: ${#FILES[@]}"
echo "Salida: $OUT"
