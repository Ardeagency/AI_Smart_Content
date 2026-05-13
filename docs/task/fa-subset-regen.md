# Pendiente: script para regenerar Font Awesome subset

Cuando alguien agregue un `<i class="fas fa-NUEVO">` en el código, el ícono NO
va a renderizar (no está en el subset). Hay que regenerar `css/fa-subset.css`
y los woff2.

## Pasos manuales hasta que haya script

```bash
cd "/Users/ardeagency/Documents/ARDE AGENCY/WEB/AI Smart Content"

# 1) Listar íconos usados
grep -rhoE 'fa-[a-z0-9-]+' --include="*.js" --include="*.html" --include="*.css" . | \
  grep -vE 'fa-(solid|regular|brands|light|duotone|sharp|thin|2x|3x|lg|sm|xs|xl|2xl|fw|spin|pulse|pull|stack|inverse|rotate|flip|border|li|ul|w-)$' | \
  grep -vE '^fa-[0-9]+x$' | sort -u > /tmp/fa_icons.txt

# 2) Bajar FA Free 6.4.0 woff2 originales
mkdir -p /tmp/fa_src
curl -sL -o /tmp/fa_src/solid.woff2 "https://cdn.jsdelivr.net/npm/@fortawesome/fontawesome-free@6.4.0/webfonts/fa-solid-900.woff2"
curl -sL -o /tmp/fa_src/brands.woff2 "https://cdn.jsdelivr.net/npm/@fortawesome/fontawesome-free@6.4.0/webfonts/fa-brands-400.woff2"
curl -sL -o /tmp/fa-all.css "https://cdn.jsdelivr.net/npm/@fortawesome/fontawesome-free@6.4.0/css/all.min.css"

# 3) Generar codepoints + subset (necesita: pip3 install fonttools brotli)
python3 -c "
import re
with open('/tmp/fa-all.css') as f: css = f.read()
with open('/tmp/fa_icons.txt') as f: icons = [l.strip() for l in f if l.strip()]
mapping = {}
for m in re.finditer(r'((?:\.fa-[a-z0-9-]+:before,?)+)\{content:\"\\\\([0-9a-f]+)\"', css):
    for cls in re.findall(r'\.fa-[a-z0-9-]+', m.group(1)):
        mapping[cls.lstrip('.')] = m.group(2)
brand_icons = {'fa-facebook','fa-google','fa-instagram','fa-meta','fa-shopify','fa-twitter','fa-linkedin','fa-youtube','fa-tiktok','fa-whatsapp'}
brand_cp = sorted({mapping[i] for i in icons if i in mapping and i in brand_icons})
solid_cp = sorted({mapping[i] for i in icons if i in mapping and i not in brand_icons})
open('/tmp/fa_brand_codepoints.txt','w').write(','.join(f'U+{c}' for c in brand_cp))
open('/tmp/fa_solid_codepoints.txt','w').write(','.join(f'U+{c}' for c in solid_cp))
# Save unicode map for CSS gen
with open('/tmp/fa_unicode_map.txt','w') as f:
    for i in icons:
        if i in mapping: f.write(f'{i}\t{mapping[i]}\n')
"

pyftsubset /tmp/fa_src/solid.woff2 --unicodes-file=/tmp/fa_solid_codepoints.txt \
  --output-file=recursos/fonts/fa/solid.subset.woff2 --flavor=woff2 \
  --no-hinting --desubroutinize --no-layout-closure

pyftsubset /tmp/fa_src/brands.woff2 --unicodes-file=/tmp/fa_brand_codepoints.txt \
  --output-file=recursos/fonts/fa/brands.subset.woff2 --flavor=woff2 \
  --no-hinting --desubroutinize --no-layout-closure

# 4) Regenerar CSS (ver commit ba344926 para el formato actual)
# El CSS final está en css/fa-subset.css con @font-face + base classes + rules :before.
```

## Cuando esté listo el script
- Crear `scripts/fa-subset.sh` o `scripts/fa-subset.py` que ejecute lo anterior.
- Posible hook pre-commit / CI que lo corra si detecta cambios en íconos.
- Borrar este archivo (regla [[feedback_tech_debt_task_folder]]).

## Nota: íconos NO disponibles en FA Free 6.4.0
- `fa-sparkles` (Pro) — usar `fa-wand-magic-sparkles`
- Cualquier `far fa-X` excepto `far fa-clipboard` — sustituir por `fas` o agregar regular subset.
