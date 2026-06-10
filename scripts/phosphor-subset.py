#!/usr/bin/env python3
"""Regenera el subset local de Phosphor Icons (css/phosphor-subset.css + woff2).

Gemelo de scripts/fa-subset.py para la otra familia de iconos. Automatiza lo que
antes se mantenia a mano cada vez que se usaba un `<i class="ph ph-NUEVO">`.

Que hace:
  1. Escanea el repo y junta todos los iconos `ph-*` usados (sin modificadores de peso).
  2. Descarga Phosphor 2.1.2 (woff2 regular + style.css con los codepoints).
  3. Mapea icono -> codepoint.
  4. Subsetea el woff2 a recursos/fonts/phosphor/Phosphor.subset.woff2 (pyftsubset).
  5. Regenera css/phosphor-subset.css (font-face + clase base + reglas :before ordenadas).

Requisitos: python3, fonttools+brotli (`pip3 install fonttools brotli`), pyftsubset
en PATH, y acceso de red al CDN de jsdelivr.

Uso:  python3 scripts/phosphor-subset.py [--check]
  --check  no escribe nada: regenera en un tmp y falla (exit 1) si el resultado
           difiere de lo commiteado. Util para un hook/CI.
"""

import re
import sys
import subprocess
import tempfile
from pathlib import Path

PH_VERSION = "2.1.2"
CDN = f"https://cdn.jsdelivr.net/npm/@phosphor-icons/web@{PH_VERSION}/src/regular"
REPO_ROOT = Path(__file__).resolve().parent.parent

# Tokens que matchean `ph-*` pero NO son iconos (pesos, animaciones).
NON_ICON_RE = re.compile(
    r"^ph-(thin|light|regular|bold|fill|duotone|spin)$"
)

# Clases base de Phosphor (boilerplate estatico, no depende de los iconos).
BASE_CSS = """[class^="ph-"],[class*=" ph-"]{
  display:inline-block;
  font-family:"Phosphor"!important;
  font-style:normal;
  font-weight:normal;
  font-variant:normal;
  font-feature-settings:normal;
  text-transform:none;
  line-height:1;
  speak:never;
  -webkit-font-smoothing:antialiased;
  -moz-osx-font-smoothing:grayscale;
}
.ph-spin{animation:ph-spin 2s linear infinite}
@keyframes ph-spin{0%{transform:rotate(0deg)}100%{transform:rotate(360deg)}}"""

CSS_PATH = REPO_ROOT / "css" / "phosphor-subset.css"
WOFF2_PATH = REPO_ROOT / "recursos" / "fonts" / "phosphor" / "Phosphor.subset.woff2"


def collect_used_icons():
    """Todos los `ph-*` referenciados en js/html/css del repo, sin modificadores."""
    found = set()
    token_re = re.compile(r"ph-[a-z0-9-]+")
    for path in REPO_ROOT.rglob("*"):
        if path.suffix not in (".js", ".html", ".css"):
            continue
        parts = set(path.parts)
        if "node_modules" in parts or ".git" in parts or path.name == "phosphor-subset.css":
            continue
        try:
            text = path.read_text(encoding="utf-8", errors="ignore")
        except OSError:
            continue
        for tok in token_re.findall(text):
            if NON_ICON_RE.match(tok):
                continue
            found.add(tok)
    return found


def download(url, dest):
    subprocess.run(["curl", "-sSL", "--fail", "-o", str(dest), url], check=True)


def build_mapping(css_text):
    """icono -> codepoint hex, leyendo las reglas `.ph.ph-x:before{content:"\\eXXX"}`."""
    mapping = {}
    for m in re.finditer(
        r"\.ph\.(ph-[a-z0-9-]+):before\s*\{\s*content:\s*\"\\([0-9a-fA-F]+)\"", css_text
    ):
        mapping[m.group(1)] = m.group(2).lower()
    return mapping


def render_css(resolved):
    lines = [
        f"/* Phosphor Icons (regular) — SUBSET local (woff2 + CSS). NO editar a mano. */",
        f"/* Regenerar con: python3 scripts/phosphor-subset.py. Phosphor {PH_VERSION}. */",
        '@font-face {',
        '  font-family: "Phosphor";',
        '  font-style: normal;',
        '  font-weight: normal;',
        '  font-display: swap;',
        '  src: url(/recursos/fonts/phosphor/Phosphor.subset.woff2) format("woff2");',
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
        sys.exit("No se encontro ningun icono ph-* en el repo (¿ruta mal?).")

    tmp = Path(tempfile.mkdtemp(prefix="ph_subset_"))
    src_woff2 = tmp / "Phosphor.woff2"
    src_css = tmp / "style.css"
    download(f"{CDN}/Phosphor.woff2", src_woff2)
    download(f"{CDN}/style.css", src_css)

    mapping = build_mapping(src_css.read_text(encoding="utf-8"))
    if not mapping:
        sys.exit("No se pudo parsear el mapping de codepoints del style.css de Phosphor.")

    missing = sorted(i for i in used if i not in mapping)
    if missing:
        print(f"AVISO: tokens ph-* usados que NO son iconos de Phosphor {PH_VERSION} (se ignoran):",
              ", ".join(missing), file=sys.stderr)

    resolved = {i: mapping[i] for i in used if i in mapping}
    codepoints = sorted({mapping[i] for i in resolved})
    unicodes = ",".join(f"U+{cp}" for cp in codepoints)

    out_woff2 = tmp / "Phosphor.subset.woff2"
    subprocess.run([
        "pyftsubset", str(src_woff2),
        f"--unicodes={unicodes}",
        "--flavor=woff2",
        f"--output-file={out_woff2}",
        "--no-hinting", "--desubroutinize",
    ], check=True)

    new_css = render_css(resolved)
    new_woff2 = out_woff2.read_bytes()

    if check:
        old_css = CSS_PATH.read_text(encoding="utf-8") if CSS_PATH.exists() else ""
        if old_css != new_css:
            sys.exit("DRIFT: css/phosphor-subset.css no coincide. Corre python3 scripts/phosphor-subset.py")
        print(f"OK (check): {len(resolved)} iconos, subset al dia.")
        return

    CSS_PATH.write_text(new_css, encoding="utf-8")
    WOFF2_PATH.write_bytes(new_woff2)
    print(f"OK: {len(resolved)} iconos Phosphor.")
    print("  css/phosphor-subset.css + recursos/fonts/phosphor/Phosphor.subset.woff2 regenerados.")


if __name__ == "__main__":
    main()
