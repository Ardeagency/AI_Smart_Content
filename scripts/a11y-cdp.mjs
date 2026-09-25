/**
 * Auditoría de accesibilidad por CDP, usada por scripts/verificar-rutas.mjs --a11y.
 * Mide en el navegador real; nada es «a ojo»:
 *
 *   nombres(cmd)    controles interactivos sin nombre accesible (árbol AX de Chrome) y botones
 *                   solo-icono sin aria-label/aria-labelledby (el title no cuenta: no lo leen todos).
 *   foco(cmd, ev)   recorre la página con Tab REAL (Input.dispatchKeyEvent → :focus-visible) y
 *                   falla si un control se ve igual con foco que sin foco (se miran el control y
 *                   hasta 3 ancestros, para cubrir :focus-within).
 *   contraste(ev)   matriz de tokens de texto × tokens de fondo, con la transparencia compuesta sobre
 *                   la página; AA = 4.5:1 (--text-disabled queda fuera: WCAG exime lo deshabilitado).
 *   drawer(cmd, ev) en 390×844: el drawer abre con el foco dentro, Tab y Shift+Tab no se escapan,
 *                   Escape lo cierra y devuelve el foco a la hamburguesa.
 */

export const AA = 4.5;
export const TEXTOS = ['--text-primary', '--text-secondary', '--text-muted', '--color-success', '--color-warning', '--color-error', '--color-info'];
export const FONDOS = ['--bg-base', '--bg-card', '--bg-card', '--bg-base', '--bg-base', '--white-2', '--white-5', '--white-8', '--white-10'];

const ROLES = new Set(['button', 'link', 'textbox', 'combobox', 'checkbox', 'radio', 'switch', 'tab', 'menuitem', 'menuitemcheckbox', 'menuitemradio', 'searchbox', 'slider', 'spinbutton', 'listbox', 'option', 'treeitem']);
const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

export async function nombres(cmd, ev) {
  await cmd('Accessibility.enable');
  const nodos = (await cmd('Accessibility.getFullAXTree')).result?.nodes || [];
  const malos = [];
  for (const n of nodos) {
    if (n.ignored || !ROLES.has(n.role?.value) || (n.name?.value || '').trim()) continue;
    const d = (await cmd('DOM.describeNode', { backendNodeId: n.backendDOMNodeId })).result?.node;
    const at = {}; (d?.attributes || []).forEach((v, i, a) => { if (i % 2 === 0) at[v] = a[i + 1]; });
    malos.push(`sin nombre accesible: ${n.role.value} <${d?.localName}${at.id ? '#' + at.id : ''}${at.class ? '.' + at.class.trim().split(/\s+/)[0] : ''}>`);
  }
  const iconos = await ev(`[...document.querySelectorAll('button, [role=button], a[href]')].filter((b) => {
      if (b.closest('[hidden], [inert], [aria-hidden=true]') || !b.getClientRects().length) return false;
      if (b.getAttribute('aria-label')?.trim() || b.getAttribute('aria-labelledby')) return false;
      return !b.textContent.trim() && b.querySelector('i, svg, img:not([alt]), img[alt=""]');
    }).map((b) => b.localName + (b.id ? '#' + b.id : '') + (typeof b.className === 'string' && b.className.trim() ? '.' + b.className.trim().split(/\\s+/)[0] : ''))`);
  for (const b of iconos || []) malos.push(`botón solo-icono sin aria-label: <${b}>`);
  return malos;
}

async function tab(cmd, shift = false) {
  const base = { key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9, modifiers: shift ? 8 : 0 };
  await cmd('Input.dispatchKeyEvent', { type: 'keyDown', ...base });
  await cmd('Input.dispatchKeyEvent', { type: 'keyUp', ...base });
  await dormir(50);
}

// Foto del activo: su estilo y el de hasta 3 ancestros. Se guarda para compararla sin foco.
const FOTO = `(() => {
  const e = document.activeElement; if (!e || e === document.body) return null;
  const q = (el) => { const s = getComputedStyle(el); return [s.outlineStyle, s.outlineWidth, s.outlineColor, s.boxShadow, s.borderColor, s.backgroundColor, s.textDecorationLine, s.color].join('|'); };
  const cadena = (el) => { const r = []; for (let n = el, i = 0; n && i < 4; n = n.parentElement, i++) r.push(q(n)); return r.join('/'); };
  const d = (el) => el.localName + (el.id ? '#' + el.id : '') + (typeof el.className === 'string' && el.className.trim() ? '.' + el.className.trim().split(/\\s+/)[0] : '');
  const prev = window.__a11yPrev; window.__a11yPrev = e;
  return { desc: d(e), con: cadena(e), prevSin: prev && prev !== e && prev.isConnected ? cadena(prev) : null };
})()`;

export async function foco(cmd, ev, maximo = 80) {
  await ev('document.activeElement?.blur?.(); window.__a11yPrev = null; true');
  const pasos = []; const vistos = new Set();
  for (let i = 0; i < maximo; i++) {
    await tab(cmd);
    const f = await ev(FOTO);
    if (!f) continue;
    pasos.push(f);
    if (vistos.has(f.desc + f.con)) break;
    vistos.add(f.desc + f.con);
  }
  const malos = new Set();
  for (let i = 1; i < pasos.length; i++) if (pasos[i].prevSin && pasos[i - 1].con === pasos[i].prevSin) malos.add(`foco invisible: <${pasos[i - 1].desc}>`);
  return [...malos];
}

export async function contraste(ev) {
  return ev(`(() => {
    const px = (v) => { const d = document.createElement('div'); d.style.color = v; document.body.append(d); const s = getComputedStyle(d).color; d.remove(); const m = s.match(/[\\d.]+/g).map(Number); return { r: m[0], g: m[1], b: m[2], a: m[3] ?? 1 }; };
    const sobre = (f, b) => ({ r: f.r * f.a + b.r * (1 - f.a), g: f.g * f.a + b.g * (1 - f.a), b: f.b * f.a + b.b * (1 - f.a), a: 1 });
    const L = (c) => { const t = [c.r, c.g, c.b].map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }); return 0.2126 * t[0] + 0.7152 * t[1] + 0.0722 * t[2]; };
    const ratio = (a, b) => { const x = L(a), y = L(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
    const pagina = px('var(--bg-base)');
    const malos = [];
    for (const f of ${JSON.stringify(FONDOS)}) {
      const bg = sobre(px('var(' + f + ')'), pagina);
      for (const t of ${JSON.stringify(TEXTOS)}) { const r = ratio(sobre(px('var(' + t + ')'), bg), bg); if (r < ${AA}) malos.push('contraste ' + t + ' sobre ' + f + ': ' + r.toFixed(2) + ' < ${AA}'); }
    }
    return malos;
  })()`);
}

export async function drawer(cmd, ev) {
  const malos = [];
  await cmd('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
  await dormir(600);
  try {
    const hay = await ev(`!!document.getElementById('headerHamburger') && !!document.getElementById('sideNavigation')`);
    if (!hay) return ['drawer: no hay #headerHamburger o #sideNavigation en 390px'];
    await ev(`document.getElementById('headerHamburger').focus(); document.getElementById('headerHamburger').click(); true`);
    await dormir(400);
    const dentro = `(() => { const sb = document.getElementById('sideNavigation'); return !!sb && sb.contains(document.activeElement); })()`;
    if (!(await ev(dentro))) malos.push('drawer: al abrir, el foco no entra al drawer');
    if ((await ev(`document.getElementById('headerHamburger').getAttribute('aria-expanded')`)) !== 'true') malos.push('drawer: la hamburguesa no dice aria-expanded=true');
    for (const shift of [false, true]) {
      for (let i = 0; i < 40; i++) { await tab(cmd, shift); if (!(await ev(dentro))) { malos.push(`drawer: ${shift ? 'Shift+Tab' : 'Tab'} saca el foco del drawer`); break; } }
    }
    await cmd('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
    await cmd('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
    await dormir(400);
    if (await ev(`document.getElementById('sideNavigation').classList.contains('is-abierto')`)) malos.push('drawer: Escape no lo cierra');
    if (!(await ev(`document.activeElement?.id === 'headerHamburger'`))) malos.push('drawer: al cerrar, el foco no vuelve a la hamburguesa');
  } finally {
    await cmd('Emulation.clearDeviceMetricsOverride');
    await dormir(300);
  }
  return malos;
}
