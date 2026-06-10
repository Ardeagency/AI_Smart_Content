#!/usr/bin/env python3
"""Regenera el subset local de Font Awesome (css/fa-subset.css + woff2).

Cierra docs/task/fa-subset-regen: automatiza los pasos manuales que habia que
correr a mano cada vez que se agregaba un `<i class="fas fa-NUEVO">`.

Que hace:
  1. Escanea el repo y junta todos los iconos `fa-*` usados (mismo filtro que la ficha).
  2. Descarga FA Free 6.5.2 (woff2 solid + brands + all.min.css con los codepoints).
  3. Mapea icono -> codepoint, separa solid vs brands.
  4. Subsetea los woff2 a recursos/fonts/fa/{solid,brands}.subset.woff2 (pyftsubset).
  5. Regenera css/fa-subset.css (font-face + clases base + reglas :before ordenadas).

Requisitos: python3, fonttools+brotli (`pip3 install fonttools brotli`), pyftsubset
en PATH, y acceso de red al CDN de jsdelivr.

Uso:  python3 scripts/fa-subset.py [--check]
  --check  no escribe nada: regenera en un tmp y falla (exit 1) si el resultado
           difiere de lo commiteado. Util para un hook/CI.
"""

import os
import re
import sys
import shutil
import subprocess
import tempfile
from pathlib import Path

FA_VERSION = "6.5.2"
CDN = f"https://cdn.jsdelivr.net/npm/@fortawesome/fontawesome-free@{FA_VERSION}"
REPO_ROOT = Path(__file__).resolve().parent.parent

# Iconos que viven en la fuente Brands (no en Solid). El resto va a Solid.
BRAND_ICONS = {
    "fa-facebook", "fa-facebook-f", "fa-facebook-messenger", "fa-google", "fa-instagram",
    "fa-meta", "fa-shopify", "fa-twitter", "fa-x-twitter", "fa-linkedin", "fa-linkedin-in",
    "fa-youtube", "fa-tiktok", "fa-whatsapp", "fa-pinterest", "fa-snapchat", "fa-telegram",
    "fa-github", "fa-google-pay", "fa-cc-visa", "fa-cc-mastercard",
}

# Tokens que matchean `fa-*` pero NO son iconos (modificadores, tamanos, animaciones).
NON_ICON_RE = re.compile(
    r"^fa-(solid|regular|brands|light|duotone|sharp|thin|2x|3x|lg|sm|xs|xl|2xl|fw|"
    r"spin|spin-pulse|pulse|pull|stack|inverse|rotate|flip|border|li|ul|w-)$"
)
SIZE_RE = re.compile(r"^fa-[0-9]+x$")

# Clases base de FA (boilerplate estatico, no depende de los iconos).
BASE_CSS = """.fa,.fas,.fa-solid,.far,.fa-regular,.fab,.fa-brands{
  -moz-osx-font-smoothing:grayscale;
  -webkit-font-smoothing:antialiased;
  display:var(--fa-display,inline-block);
  font-style:normal;
  font-variant:normal;
  text-rendering:auto;
  line-height:1;
}
.fas,.fa-solid,.fa{font-family:"Font Awesome 6 Free";font-weight:900}
.fab,.fa-brands{font-family:"Font Awesome 6 Brands";font-weight:400}
.fa-fw{text-align:center;width:1.25em}
.fa-spin{animation:fa-spin 2s infinite linear}
.fa-pulse,.fa-spin-pulse{animation:fa-spin 1s infinite steps(8)}
@keyframes fa-spin{0%{transform:rotate(0deg)}100%{transform:rotate(360deg)}}
.fa-2x{font-size:2em}
.fa-3x{font-size:3em}
.fa-lg{font-size:1.25em;line-height:.05em;vertical-align:-.075em}
.fa-sm{font-size:.875em;line-height:1.4285714em;vertical-align:.05357142em}"""


def collect_used_icons():
    """Todos los `fa-*` referenciados en js/html/css del repo, sin modificadores."""
    found = set()
    token_re = re.compile(r"fa-[a-z0-9-]+")
    for path in REPO_ROOT.rglob("*"):
        if path.suffix not in (".js", ".html", ".css"):
            continue
        # No escanear el propio subset ni dependencias.
        parts = set(path.parts)
        if "node_modules" in parts or ".git" in parts or path.name == "fa-subset.css":
            continue
        try:
            text = path.read_text(encoding="utf-8", errors="ignore")
        except OSError:
            continue
        for tok in token_re.findall(text):
            if NON_ICON_RE.match(tok) or SIZE_RE.match(tok):
                continue
            found.add(tok)
    return found


def download(url, dest):
    # curl usa el cert store del sistema (mas portable que urllib en macOS).
    subprocess.run(["curl", "-sSL", "--fail", "-o", str(dest), url], check=True)


def build_mapping(css_text):
    """icono -> codepoint hex, leyendo las reglas `.fa-x:before{content:"\\fXXX"}`."""
    mapping = {}
    for m in re.finditer(r'((?:\.fa-[a-z0-9-]+:before,?)+)\{content:"\\([0-9a-f]+)"', css_text):
        cp = m.group(2)
        for cls in re.findall(r"\.fa-[a-z0-9-]+", m.group(1)):
            mapping[cls.lstrip(".")] = cp
    return mapping


def render_css(used, mapping):
    resolved = {i: mapping[i] for i in used if i in mapping}
    lines = [
        f"/* Font Awesome {FA_VERSION} — SUBSET local (woff2 + CSS). NO editar a mano. */",
        "/* Regenerar con: python3 scripts/fa-subset.py (sustituye el CDN, ~240KB). */",
        '@font-face {',
        '  font-family: "Font Awesome 6 Free";',
        '  font-style: normal;',
        '  font-weight: 900;',
        '  font-display: swap;',
        '  src: url(/recursos/fonts/fa/solid.subset.woff2) format("woff2");',
        '}',
        '@font-face {',
        '  font-family: "Font Awesome 6 Brands";',
        '  font-style: normal;',
        '  font-weight: 400;',
        '  font-display: swap;',
        '  src: url(/recursos/fonts/fa/brands.subset.woff2) format("woff2");',
        '}',
        '',
        BASE_CSS,
        '',
        f"/* === {len(resolved)} icon rules === */",
    ]
    for icon in sorted(resolved):
        lines.append(f'.{icon}:before{{content:"\\{resolved[icon]}"}}')
    return "\n".join(lines) + "\n"


def main():
    check = "--check" in sys.argv[1:]
    used = collect_used_icons()
    if not used:
        sys.exit("No se encontro ningun icono fa-* en el repo (¿ruta mal?).")

    tmp = Path(tempfile.mkdtemp(prefix="fa_subset_"))
    try:
        solid_src = tmp / "solid.woff2"
        brands_src = tmp / "brands.woff2"
        all_css = tmp / "all.min.css"
        download(f"{CDN}/webfonts/fa-solid-900.woff2", solid_src)
        download(f"{CDN}/webfonts/fa-brands-400.woff2", brands_src)
        download(f"{CDN}/css/all.min.css", all_css)

        mapping = build_mapping(all_css.read_text(encoding="utf-8"))
        missing = sorted(i for i in used if i not in mapping)
        if missing:
            print(f"AVISO: iconos usados que NO existen en FA Free {FA_VERSION} (no se incluyen):",
                  ", ".join(missing), file=sys.stderr)

        brand_cp = sorted({mapping[i] for i in used if i in mapping and i in BRAND_ICONS})
        solid_cp = sorted({mapping[i] for i in used if i in mapping and i not in BRAND_ICONS})

        fonts_dir = REPO_ROOT / "recursos" / "fonts" / "fa"
        out_solid = (tmp if check else fonts_dir) / "solid.subset.woff2"
        out_brands = (tmp if check else fonts_dir) / "brands.subset.woff2"
        fonts_dir.mkdir(parents=True, exist_ok=True)

        def subset(src, codepoints, out):
            uni = ",".join(f"U+{c}" for c in codepoints) or "U+0020"
            subprocess.run([
                "pyftsubset", str(src), f"--unicodes={uni}",
                f"--output-file={out}", "--flavor=woff2",
                "--no-hinting", "--desubroutinize", "--no-layout-closure",
            ], check=True)

        subset(solid_src, solid_cp, out_solid)
        subset(brands_src, brand_cp, out_brands)

        css = render_css(used, mapping)
        css_path = REPO_ROOT / "css" / "fa-subset.css"

        if check:
            current = css_path.read_text(encoding="utf-8") if css_path.exists() else ""
            if current != css:
                sys.exit("--check: css/fa-subset.css esta desactualizado. Corre el script sin --check.")
            print(f"--check OK: {len(solid_cp)} solid + {len(brand_cp)} brand iconos al dia.")
        else:
            css_path.write_text(css, encoding="utf-8")
            print(f"OK: {len(solid_cp)} solid + {len(brand_cp)} brand iconos.")
            print(f"  css/fa-subset.css + recursos/fonts/fa/*.subset.woff2 regenerados.")
    finally:
        shutil.rmtree(tmp, ignore_errors=True)


if __name__ == "__main__":
    main()
