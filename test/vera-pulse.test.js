/**
 * El sensor de Vera: que lo que dice sea verdad.
 *
 * Las frases son cosméticas, pero las reglas que las eligen NO: una frase con
 * {n} sin entidad publicaría "leyendo lo que publica " (nombre vacío), y
 * "amenazando a X" sobre un perfil PROPIO diría una mentira sobre el cliente.
 * Como la elección es aleatoria, cada regla se ejercita muchas veces: un fallo
 * de 1 en 20 no se ve probando una sola vez.
 */
import { describe, test, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const RUTA = path.join(process.cwd(), 'js/components/VeraPulse.js');
const FUENTE = fs.readFileSync(RUTA, 'utf8');

/* El componente es un IIFE de navegador: se le monta un window falso y se
   evalúa. No toca el DOM hasta que se llama a mount(). */
function cargar() {
  const win = { __: (s) => s };
  globalThis.window = win;
  globalThis.document = { addEventListener() {}, removeEventListener() {} };
  new Function(FUENTE)();
  return win.VeraPulse;
}

const VeraPulse = cargar();
const VECES = 300;

const pulso = (tipo, entidad) => ({ activa: true, tipo, entidad, desde: '2026-07-31T14:00:00Z' });

describe('el sensor de Vera solo dice lo que sabe', () => {
  test('nunca deja un {n} vacío cuando no hay entidad', () => {
    for (const tipo of Object.keys(VeraPulse._VOCABULARIO)) {
      for (let i = 0; i < 20; i++) {
        const f = VeraPulse._elegirFrase(pulso(tipo, null));
        expect(f, `${tipo}: "${f}"`).not.toContain('{n}');
        expect(f.trim(), `${tipo} dejó el nombre en blanco: "${f}"`).toBe(f.trim());
        expect(f.trim().length, `${tipo} quedó vacía`).toBeGreaterThan(0);
        /* Una frase que termina en preposición SUELTA delata el nombre que
           falta ("leyendo lo que publica de"). El espacio es obligatorio: \b
           no sirve porque en JS la "ñ" no cuenta como carácter de palabra y
           partiría "campañ|a". */
        expect(f.trim(), `${tipo} quedó colgando: "${f}"`).not.toMatch(/\s(a|de|con|el|la)$/);
      }
    }
  });

  test('solo amenaza a un competidor DIRECTO', () => {
    const noRivales = [
      { nombre: 'Valeria Ramirez', tipo: 'owned_media' },
      { nombre: 'Nike', tipo: 'referencia_cultural' },
      { nombre: 'B3TTER Foods', tipo: 'competidor_indirecto' },
      { nombre: 'Sin tipo', tipo: null },
    ];
    for (const e of noRivales) {
      for (let i = 0; i < VECES; i++) {
        const f = VeraPulse._elegirFrase(pulso('threat_detection', e));
        expect(f, `amenazó a ${e.tipo}: "${f}"`).not.toContain('amenazando');
      }
    }
    /* Y con un rival real, la traviesa sí puede salir. */
    const rival = { nombre: 'Celsius Energy', tipo: 'competidor_directo' };
    const salidas = new Set();
    for (let i = 0; i < VECES; i++) salidas.add(VeraPulse._elegirFrase(pulso('threat_detection', rival)));
    expect([...salidas].some((f) => f.includes('amenazando a Celsius Energy'))).toBe(true);
  });

  test('un sensor desconocido no se inventa una actividad específica', () => {
    for (let i = 0; i < 50; i++) {
      const f = VeraPulse._elegirFrase(pulso('sensor_que_no_existe_todavia', null));
      expect(['trabajando en tus datos', 'procesando información']).toContain(f);
    }
  });

  test('la mayoría de las frases son profesionales, no traviesas', () => {
    const rival = { nombre: 'Celsius Energy', tipo: 'competidor_directo' };
    let traviesas = 0;
    for (let i = 0; i < VECES; i++) {
      const f = VeraPulse._elegirFrase(pulso('social', rival));
      if (f.includes('scrolleando') || f.includes('chismoseando')) traviesas++;
    }
    /* Diseño: 1 de cada 5. Con 300 tiros, el margen cubre la varianza. */
    expect(traviesas / VECES).toBeLessThan(0.35);
    expect(traviesas).toBeGreaterThan(0);
  });
});

describe('en reposo el sensor se calla', () => {
  const host = () => ({ innerHTML: '' });

  test('sin actividad no hay puntos ni frase', () => {
    const p = new VeraPulse({});
    p.host = host();
    p._pintar({ activa: false, ultimo: { tipo: 'social', cuando: new Date().toISOString() } });
    expect(p.host.innerHTML).not.toContain('vera-pulse-dots');
    expect(p.host.innerHTML).not.toContain('vera-pulse-frase');
    expect(p.host.innerHTML).toContain('Logoverablanco.svg');
    expect(p.host.innerHTML).not.toContain('is-activa');
  });

  test('con actividad aparecen los puntos y la frase', () => {
    const p = new VeraPulse({});
    p.host = host();
    p._pintar(pulso('shopify_metrics', null));
    expect(p.host.innerHTML).toContain('is-activa');
    expect(p.host.innerHTML).toContain('vera-pulse-dots');
    expect(p.host.innerHTML).toContain('vera-pulse-frase');
  });

  test('el sensor es un botón que se puede abrir', () => {
    const p = new VeraPulse({});
    p.host = host();
    p._pintar({ activa: false });
    expect(p.host.innerHTML).toContain('<button');
    expect(p.host.innerHTML).toContain('data-vera-pulse-abrir');
  });

  test('la frase no cambia mientras la actividad sea la misma', () => {
    const p = new VeraPulse({});
    p.host = host();
    const act = pulso('social', { nombre: 'Tosh', tipo: 'competidor_directo' });
    p._pintar(act);
    const primera = p._frase;
    for (let i = 0; i < 20; i++) p._pintar(act);
    expect(p._frase).toBe(primera);
  });
});

/**
 * La bitácora es el drill-down del sensor: si agrupa mal o esconde una falla,
 * deja de ser auditable — que es su único motivo de existir.
 */
describe('la bitácora se puede auditar', () => {
  const fila = (tipo, inicio, extra = {}) => ({
    fuente: 'sensor', tipo, estado: 'success', inicio,
    duracion_ms: 100, stats: {}, error: null, entidad: null, entidad_tipo: null, ...extra,
  });

  test('colapsa repeticiones seguidas y conserva el conteo', () => {
    /* El caso real: 117 "mission_generation" seguidos entierran 2 lecturas. */
    const filas = [];
    for (let i = 0; i < 117; i++) filas.push(fila('mission_generation', `2026-07-31T14:${String(i % 60).padStart(2, '0')}:00Z`));
    filas.push(fila('social', '2026-07-31T12:48:00Z', { entidad: 'Tosh', stats: { posts_found: 25 } }));

    const g = VeraPulse._agrupar(filas);
    expect(g).toHaveLength(2);
    expect(g[0].veces).toBe(117);
    expect(g[1].tipo).toBe('social');
    expect(g[1].veces).toBe(1);
    /* El total original no se pierde de vista. */
    expect(g.reduce((a, x) => a + x.veces, 0)).toBe(filas.length);
  });

  test('no mezcla dos entidades distintas del mismo sensor', () => {
    const g = VeraPulse._agrupar([
      fila('social', '2026-07-31T14:00:00Z', { entidad: 'Tosh' }),
      fila('social', '2026-07-31T13:00:00Z', { entidad: 'Nike' }),
    ]);
    expect(g).toHaveLength(2);
  });

  test('una falla nunca se agrupa dentro de los éxitos', () => {
    const g = VeraPulse._agrupar([
      fila('social', '2026-07-31T14:00:00Z'),
      fila('social', '2026-07-31T13:00:00Z', { estado: 'failed', error: 'timeout' }),
      fila('social', '2026-07-31T12:00:00Z'),
    ]);
    expect(g).toHaveLength(3);
    expect(g[1].estado).toBe('failed');
  });

  test('las cifras en cero no se muestran (0 señales no es información)', () => {
    expect(VeraPulse._detalleStats({ posts_found: 25, new_signals: 0 })).toBe('25 publicaciones');
    expect(VeraPulse._detalleStats({})).toBe('');
    expect(VeraPulse._detalleStats(null)).toBe('');
  });

  test('el resumen cuenta las fallas y los perfiles observados', () => {
    const p = new VeraPulse({});
    const html = p._bitHtml({
      horas: 24,
      filas: [
        fila('social', '2026-07-31T14:00:00Z', { entidad: 'Tosh', entidad_tipo: 'competidor_directo' }),
        fila('social', '2026-07-31T13:00:00Z', { entidad: 'Nike' }),
        fila('meta_posts', '2026-07-31T12:00:00Z', { estado: 'failed', error: 'token vencido' }),
      ],
    });
    expect(html).toContain('<b>3</b>');            // acciones
    expect(html).toContain('<b>2</b>');            // perfiles observados
    expect(html).toContain('vera-bit-mal">1');     // una falla, marcada
    expect(html).toContain('token vencido');       // el error se muestra, no se esconde
    expect(html).toContain('rival');               // solo el competidor directo
  });

  test('sin actividad lo dice, no finge una lista', () => {
    const p = new VeraPulse({});
    const html = p._bitHtml({ horas: 24, filas: [] });
    expect(html).toContain('no ha registrado actividad');
    expect(html).not.toContain('vera-bit-lista');
  });
});
