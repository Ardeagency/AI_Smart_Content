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
