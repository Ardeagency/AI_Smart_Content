/**
 * Avisos (ADR-0054): markdown fuera de Navigation, datos por AvisosDataService,
 * render por type_code en Avisos.js. Regla §5: un tipo activo sin etiqueta,
 * icono y resolutor de enlace NO existe — este test lo cuenta.
 *
 * TIPOS = los 21 códigos no legacy de alert_types (contrato avisos.md, base
 * medida 16/09 14:35 UTC); verificar-avisos.mjs los cruza en vivo.
 */
import { describe, test, expect, beforeAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const leer = (p) => fs.readFileSync(path.join(process.cwd(), p), 'utf8');
const TIPOS = ['billing.provider_cap_near', 'billing.provider_cap_hit', 'billing.low_credit', 'credits.exhausted', 'billing.payment_failed', 'billing.plan_expiring', 'flows.schedule_stuck', 'ops.job_dead', 'ops.schedule_mute', 'ingest.source_mute', 'ingest.quota_near', 'ingest.schedule_stale', 'ingest.quota_exhausted', 'ingest.quota_blind', 'ingest.source_down', 'agent.template_outdated', 'agent.note', 'agent.needs_approval', 'agent.job_dead', 'intel.critical_signal', 'marketing.approval'];
const PARAMS = { 'billing.provider_cap_near': ['gastado', 'tope', 'medidor', 'techo'], 'billing.provider_cap_hit': ['gastado', 'tope', 'medidor', 'techo'], 'credits.exhausted': ['disponible'], 'flows.schedule_stuck': ['schedule_id', 'fallos', 'motivo'], 'ops.job_dead': ['job_id', 'kind', 'intentos'], 'ops.schedule_mute': ['schedule_id', 'kind', 'ultimo_exito'], 'ingest.source_mute': ['schedule_id', 'actor', 'target', 'corridas', 'dias'], 'agent.template_outdated': ['agent_id', 'template_code', 'tiene', 'hay'] };

let MD, D, A;
beforeAll(() => {
  globalThis.window = globalThis.window || globalThis;
  globalThis.window.__ = (k, p) => String(k).replace(/\{(\w+)\}/g, (_, n) => (p && p[n] != null ? p[n] : `{${n}}`));
  new Function(leer('js/utils/markdown.js'))();
  new Function(leer('js/services/AvisosDataService.js'))();
  new Function(leer('js/components/Avisos.js'))();
  MD = globalThis.window.MarkdownLite; D = globalThis.window.AvisosDatos.mapeo; A = globalThis.window.Avisos;
});

describe('Markdown ligero (salió de Navigation.js)', () => {
  test('escapa primero y marca después: nunca HTML crudo', () => {
    expect(MD.render('<img src=x onerror=alert(1)> **negrita**')).toBe('<p>&lt;img src=x onerror=alert(1)&gt; <strong>negrita</strong></p>');
  });
  test('títulos, listas, tablas y párrafos', () => {
    const h = MD.render('## Título\n\n- a\n- b\n\nlínea 1\nlínea 2');
    expect(h).toContain('<div class="notif-md-h2">Título</div>');
    expect(h).toContain('<ul class="notif-md-list"><li>a</li><li>b</li></ul>');
    expect(h).toContain('<p>línea 1<br>línea 2</p>');
    expect(MD.render('| a | b |\n|---|---|\n| 1 | 2 |')).toContain('<table class="notif-md-table"><thead><tr><th>a</th><th>b</th></tr></thead><tbody><tr><td>1</td><td>2</td></tr></tbody></table>');
  });
  test('el shell no trae su propio parser (Navigation.js se retiró en L3)', () => {
    expect(leer('js/shell/Shell.js')).not.toMatch(/_renderMarkdownLite\s*\(/);
  });
});

describe('AvisosDataService · mapeos', () => {
  test('la fila de alerts sale con tipo, severidad, params y veces', () => {
    const a = D.avisoAV1({ id: 7, type_code: 'ops.job_dead', title: 'Murió', body: 'x', link: null, metadata: { kind: 'agente.turno', intentos: 2, veces: 3 }, created_at: 't', delivered_at: 'd', read_at: null }, { 'ops.job_dead': { code: 'ops.job_dead', name: 'Trabajo caído', severity: 'error', family: 'ops', params: ['job_id', 'kind', 'intentos'], default_channels: ['in_app', 'email'] } });
    expect(a).toMatchObject({ id: 7, type: 'ops.job_dead', family: 'ops', severity: 'error', veces: 3, is_read: false, is_delivered: true, personal: false });
    expect(a.tipo.default_channels).toEqual(['in_app', 'email']);
    expect(D.avisoAV1({ id: 1, type_code: 'x.y', metadata: null }, {}).family).toBe('x');
  });
  test('unread_alerts es un agregado por tipo: el contador suma y el newest es el más nuevo', () => {
    expect(D.resumenNoLeidos([{ family: 'ops', total: 2, newest: '2026-09-16T10:00:00Z' }, { family: 'agent', total: 1, newest: '2026-09-16T12:00:00Z' }]))
      .toEqual({ total: 3, newest: '2026-09-16T12:00:00Z', porFamilia: { ops: 2, agent: 1 } });
    expect(D.resumenNoLeidos([])).toEqual({ total: 0, newest: null, porFamilia: {} });
  });
  test('canales efectivos: preferencia > defecto del tipo; silenciado = ninguno; nunca «todo por correo»', () => {
    expect(D.canalesEfectivos({ default_channels: ['in_app', 'email_digest'] }, null)).toEqual(['in_app', 'email_digest']);
    expect(D.canalesEfectivos({ default_channels: ['in_app'] }, { channels: ['in_app', 'email'] })).toEqual(['in_app', 'email']);
    expect(D.canalesEfectivos({ default_channels: ['in_app'] }, { is_muted: true, channels: ['email'] })).toEqual([]);
    expect(D.canalesEfectivos(null, null)).toEqual(['in_app']);
  });
  test('marcar solo toca read_at/acted_at (grant por columna: otra columna = 42501); actuar exige leer', () => {
    expect(D.parcheDeMarca('read', { is_delivered: false, read_at: null }, 'T')).toEqual({ read_at: 'T' });
    expect(D.parcheDeMarca('read', { is_delivered: true, read_at: 'R' }, 'T')).toEqual({ read_at: 'R' });
    expect(D.parcheDeMarca('acted', { is_delivered: true, read_at: null }, 'T')).toEqual({ read_at: 'T', acted_at: 'T' });
    expect(D.parcheDeMarca('unread', {}, 'T')).toEqual({ read_at: null, acted_at: null });
  });
});

describe('Avisos.js · un tipo sin render no existe (ADR-0054 §5)', () => {
  for (const code of TIPOS) {
    test(`${code} tiene icono, etiqueta y resolutor de enlace`, () => {
      const r = A.RENDER[code];
      expect(r, `falta RENDER['${code}']`).toBeTruthy();
      expect(r.icono).toMatch(/^aisc-ico--/);
      expect(typeof r.etiqueta).toBe('string');
      expect(r.etiqueta.length).toBeGreaterThan(2);
      expect(r.ruta).toMatch(/^\//);
      const fam = code.split('.')[0];
      expect(A.FAMILIAS[fam], `familia ${fam} sin icono/ruta`).toBeTruthy();
    });
  }
  test('los tipos con params del contrato se traducen con ellos; sin un param, cae al respaldo', () => {
    for (const [code, params] of Object.entries(PARAMS)) {
      const r = A.RENDER[code];
      expect(r.titulo, `${code} declara params pero no traduce`).toBeTypeOf('function');
      // Los params que el render exige son un subconjunto de los que el tipo declara.
      r.params.forEach((k) => expect(params, `${code}: el render pide ${k} y el contrato no lo da`).toContain(k));
      const completo = Object.fromEntries(params.map((k) => [k, k === 'gastado' ? 90 : k === 'tope' ? 100 : k === 'techo' ? 'marca' : k === 'ultimo_exito' ? '2026-09-10T00:00:00Z' : 3]));
      expect(A.texto({ type: code, params: completo, title: 'respaldo', body: '' }).traducido).toBe(true);
      const sinUno = { ...completo }; delete sinUno[r.params[0]];
      expect(A.texto({ type: code, params: sinUno, title: 'respaldo', body: '' })).toMatchObject({ titulo: 'respaldo', traducido: false });
    }
  });
  test('un tipo desconocido cae a su familia, y sin familia a ops', () => {
    expect(A.presentacion({ type: 'ingest.nuevo', family: 'ingest' })).toMatchObject({ icono: A.FAMILIAS.ingest.icono, ruta: '/monitoring' });
    expect(A.presentacion({ type: 'raro.x', family: 'raro' })).toMatchObject({ ruta: '/organization' });
  });
  test('la tarjeta escapa todo lo que viene de la base', () => {
    const html = A.tarjeta({ id: 1, type: 'agent.note', family: 'agent', severity: 'info', title: '<b>x</b>', body: '<script>1</script>', params: {}, veces: 1, created_at: new Date().toISOString(), is_read: false });
    expect(html).not.toContain('<b>x</b>');
    expect(html).toContain('&lt;b&gt;x&lt;/b&gt;');
    expect(html).not.toContain('<script>');
    expect(html).toContain('data-aviso-leer');
  });
  test('veces > 1 se ve; leído no ofrece «marcar»', () => {
    const html = A.tarjeta({ id: 2, type: 'ops.job_dead', family: 'ops', severity: 'error', title: 't', body: '', params: { kind: 'x', intentos: 2 }, veces: 4, created_at: null, is_read: true });
    expect(html).toContain('×4');
    expect(html).not.toContain('data-aviso-leer');
    expect(html).toContain('Murió el trabajo «x»');
  });
});
