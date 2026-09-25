/**
 * TareasDataService: el cron con el dialecto de la base (private.campo_cron / siguiente_cron),
 * las recetas de `entradas` (flows.resolver_entradas), las filas de flows.schedules y la semana
 * del calendario. Todo puro: la vista pinta lo que esto devuelve.
 */
import { describe, test, expect, beforeAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
const FUENTE = fs.readFileSync(path.join(process.cwd(), 'js/services/TareasDataService.js'), 'utf8');
let T;
beforeAll(() => { globalThis.window = globalThis.window || globalThis; new Function(FUENTE)(); T = globalThis.window.TareasDatos.mapeo; });

describe('Tareas · cron como lo lee la base', () => {
  test('campos: listas, rangos y pasos; fuera de rango = null', () => {
    expect(T.campoCron('*/15', 0, 59)).toEqual([0, 15, 30, 45]);
    expect(T.campoCron('1-5', 0, 6)).toEqual([1, 2, 3, 4, 5]);
    expect(T.campoCron('1,3,1', 0, 6)).toEqual([1, 3]);
    expect(T.campoCron('7', 0, 6)).toBeNull();
    expect(T.campoCron('x', 0, 6)).toBeNull();
    expect(T.campoCron('5-2', 0, 6)).toBeNull();
  });
  test('validarCron dice qué está mal (el 7 NO es domingo en la base)', () => {
    expect(T.validarCron('0 9 * * 1')).toBe('');
    expect(T.validarCron('0 9 * *')).toMatch(/cinco campos/);
    expect(T.validarCron('0 9 * * 7')).toMatch(/día de la semana/);
    expect(T.validarCron('0 24 * * *')).toMatch(/hora/);
  });
  test('forma ↔ cron (ida y vuelta)', () => {
    const casos = [
      [{ frecuencia: 'diaria', hora: 9, minuto: 0 }, '0 9 * * *'],
      [{ frecuencia: 'semanal', hora: 10, minuto: 30, dias: [4, 1] }, '30 10 * * 1,4'],
      [{ frecuencia: 'mensual', hora: 8, minuto: 0, diaDelMes: 15 }, '0 8 15 * *'],
      [{ frecuencia: 'horas', minuto: 5, cadaHoras: 6 }, '5 */6 * * *'],
      [{ frecuencia: 'horas', minuto: 0, cadaHoras: 1 }, '0 * * * *'],
    ];
    for (const [forma, cron] of casos) {
      expect(T.cronDeForma(forma)).toBe(cron);
      expect(T.cronDeForma(T.formaDeCron(cron))).toBe(cron);
    }
    expect(T.cronDeForma({ frecuencia: 'semanal', hora: 9, minuto: 0, dias: [] })).toBe('');
    expect(T.formaDeCron('0 9 1,15 * *')).toEqual({ frecuencia: 'avanzada', cron: '0 9 1,15 * *' });
    expect(T.cronDeForma({ frecuencia: 'avanzada', cron: '  0  9 1,15 * * ' })).toBe('0 9 1,15 * *');
  });
  test('describirCron en una frase (lunes primero)', () => {
    expect(T.describirCron('0 9 * * *')).toBe('Todos los días a las 09:00');
    expect(T.describirCron('0 9 * * 1-5')).toBe('De lunes a viernes a las 09:00');
    expect(T.describirCron('0 9 * * 1,2,3,4,5')).toBe('De lunes a viernes a las 09:00');
    expect(T.describirCron('0 10 * * 0,4,1')).toBe('Cada lunes, jueves y domingo a las 10:00');
    expect(T.describirCron('0 8 1 * *')).toBe('El día 1 de cada mes a las 08:00');
    expect(T.describirCron('15 */2 * * *')).toBe('Cada 2 horas, en el minuto 15');
    expect(T.describirCron('0 9 * * 7')).toBe('Frecuencia sin definir');
  });
  test('ocurrencias del día con la regla clásica de día del mes O día de la semana', () => {
    const lunes1 = new Date(2026, 5, 1); // lunes 1 de junio de 2026
    expect(T.ocurrenciasDelDia('0 9 * * 1', lunes1)).toEqual([{ hora: 9, minuto: 0 }]);
    expect(T.ocurrenciasDelDia('0 9 * * 2', lunes1)).toEqual([]);
    // día 15 O martes: el lunes 1 no; el martes 2 sí; el lunes 15 sí.
    expect(T.ocurrenciasDelDia('0 9 15 * 2', lunes1)).toEqual([]);
    expect(T.ocurrenciasDelDia('0 9 15 * 2', new Date(2026, 5, 2))).toHaveLength(1);
    expect(T.ocurrenciasDelDia('0 9 15 * 2', new Date(2026, 5, 15))).toHaveLength(1);
    expect(T.ocurrenciasDelDia('0 */6 * * *', lunes1).map((o) => o.hora)).toEqual([0, 6, 12, 18]);
    expect(T.ocurrenciasDelDia('0 9 * 2 *', lunes1)).toEqual([]);
  });
  test('semana: 7 días desde el lunes; lo que corre >3 veces al día va en una tarjeta', () => {
    const lista = [{ id: 'a', nombre: 'Cada hora', cron: '0 * * * *' }, { id: 'b', nombre: 'Lunes', cron: '30 8 * * 1' }];
    const sem = T.agendaDeSemana(lista, new Date(2026, 5, 3)); // miércoles → semana del lunes 1
    expect(sem).toHaveLength(7);
    expect(sem[0].fecha.getDate()).toBe(1);
    expect(sem[0].eventos.map((e) => [e.p.id, e.veces])).toEqual([['a', 24], ['b', 1]]);
    expect(sem[1].eventos.map((e) => e.p.id)).toEqual(['a']);
  });
});

describe('Tareas · recetas de entradas', () => {
  const campos = [
    { key: 'prompt', kind: 'long_text', required: true },
    { key: 'aspecto', kind: 'select', required: false, defaultValue: '1:1' },
    { key: 'duracion', kind: 'number', required: false },
    { key: 'producto', kind: 'element_ref', required: true },
    { key: 'referencia_1', kind: 'image', required: false },
  ];
  test('modos por kind: los archivos solo por defecto o Vera', () => {
    expect(T.modosPara('image')).toEqual(['por_defecto', 'del_agente']);
    expect(T.modosPara('element_ref')).toContain('elemento');
    expect(T.modosPara('text')).not.toContain('elemento');
  });
  test('formulario → receta con la forma de flows.resolver_entradas', () => {
    expect(T.recetaDeFormulario({ modo: 'fijo', valor: ' 4:5 ' }, campos[1])).toEqual({ receta: { modo: 'fijo', valor: '4:5' } });
    expect(T.recetaDeFormulario({ modo: 'fijo', valor: '7,5' }, campos[2])).toEqual({ receta: { modo: 'fijo', valor: 7.5 } });
    expect(T.recetaDeFormulario({ modo: 'rotar', valores: 'a\n\n b \nc' }, campos[0])).toEqual({ receta: { modo: 'rotar', valores: ['a', 'b', 'c'] } });
    expect(T.recetaDeFormulario({ modo: 'elemento', tipo: 'product', criterio: 'azar' }, campos[3])).toEqual({ receta: { modo: 'elemento', tipo: 'product', criterio: 'azar' } });
    expect(T.recetaDeFormulario({ modo: 'elemento' }, campos[3])).toEqual({ receta: { modo: 'elemento', criterio: 'menos_usado' } });
    expect(T.recetaDeFormulario({ modo: 'del_agente' }, campos[0])).toEqual({ receta: { modo: 'del_agente' } });
    expect(T.recetaDeFormulario({ modo: 'por_defecto' }, campos[0])).toEqual({ receta: null });
  });
  test('errores en palabras', () => {
    expect(T.recetaDeFormulario({ modo: 'fijo', valor: '' }, campos[0]).error).toMatch(/Falta el valor/);
    expect(T.recetaDeFormulario({ modo: 'fijo', valor: 'dos' }, campos[2]).error).toMatch(/no es un número/);
    expect(T.recetaDeFormulario({ modo: 'rotar', valores: 'uno' }, campos[0]).error).toMatch(/al menos dos/);
    expect(T.recetaDeFormulario({ modo: 'fijo', valor: 'x' }, campos[4]).error).toMatch(/no aplica/);
    expect(T.recetaDeFormulario({ modo: 'elemento', criterio: 'el_mejor' }, campos[3]).error).toMatch(/criterio/);
  });
  test('componer: guarda recetas, conserva lo que no es del flujo y lo heredado de v1', () => {
    const original = { entity_ids: ['e1'], aspecto: '9:16', prompt: { modo: 'fijo', valor: 'viejo' } };
    const { entradas, errores } = T.componerEntradas(original, campos, { prompt: { modo: 'por_defecto' }, duracion: { modo: 'fijo', valor: '5' } });
    expect(errores).toEqual([]);
    expect(entradas).toEqual({ entity_ids: ['e1'], aspecto: '9:16', duracion: { modo: 'fijo', valor: 5 } });
    const mal = T.componerEntradas({}, campos, { prompt: { modo: 'fijo', valor: '' } });
    expect(mal.errores).toEqual([{ key: 'prompt', texto: 'Falta el valor fijo.' }]);
  });
  test('lo guardado vuelve al formulario; lo heredado se marca', () => {
    expect(T.formularioDeEntrada(undefined)).toEqual({ modo: 'por_defecto' });
    expect(T.formularioDeEntrada('9:16')).toEqual({ modo: 'por_defecto', heredado: '9:16' });
    expect(T.formularioDeEntrada({ modo: 'rotar', valores: ['a', 2] })).toMatchObject({ modo: 'rotar', valores: 'a\n2' });
    expect(T.heredadas({ a: 1, b: { modo: 'fijo', valor: 1 } })).toEqual(['a']);
  });
  test('avisos: obligatoria sin valor por defecto que se deja «por defecto»', () => {
    expect(T.avisosDeEntradas(campos, { producto: { modo: 'elemento' } })).toEqual(['prompt']);
    expect(T.avisosDeEntradas(campos, { prompt: { modo: 'del_agente' }, producto: { modo: 'fijo', valor: 'e' } })).toEqual([]);
  });
});

describe('Tareas · filas de flows.schedules', () => {
  const fila = { id: 's', flow_id: 'f', organization_id: 'o', name: 'Lunes', cron: '0 9 * * 1', timezone: 'America/Bogota', is_active: true, next_run_at: '2026-10-05T14:00:00Z', corridas: 3, omitidas: 1, fallos_seguidos: 0, entradas: { prompt: { modo: 'fijo', valor: 'x' } }, al_no_poder: 'omitir' };
  test('activa, con nombre de flujo y contadores', () => {
    const p = T.programacionDeFila(fila, { f: 'Imagen' });
    expect(p).toMatchObject({ id: 's', flujo: 'Imagen', estado: 'activa', activa: true, proxima: fila.next_run_at, corridas: 3, omitidas: 1, heredada: false });
    expect(T.estadoProgramacion(p)).toEqual({ etiqueta: 'Activa', badge: 'badge--exito' });
  });
  test('pausada: sin próxima; la apagó la base = «Se detuvo»', () => {
    const pausada = T.programacionDeFila({ ...fila, is_active: false, ultimo_motivo: 'faltan entradas obligatorias: ["prompt"]' });
    expect(pausada).toMatchObject({ estado: 'pausada', proxima: null });
    const sola = T.programacionDeFila({ ...fila, is_active: false, fallos_seguidos: 10, ultimo_motivo: 'Apagada sola tras 10 fallos seguidos. Ultimo: x' });
    expect(T.estadoProgramacion(sola)).toEqual({ etiqueta: 'Se detuvo', badge: 'badge--error' });
    const sinMiembro = T.programacionDeFila({ ...fila, is_active: false, ultimo_motivo: 'quien creo esta programacion ya no es miembro de la marca' });
    expect(sinMiembro.estado).toBe('detenida');
  });
  test('las filas de v1 (entradas con la forma vieja) se marcan heredadas', () => {
    expect(T.programacionDeFila({ ...fila, entradas: { entity_ids: ['a'], aspect_ratio: '9:16' } }).heredada).toBe(true);
  });
  test('filtros y cuentas', () => {
    const l = [T.programacionDeFila(fila), T.programacionDeFila({ ...fila, id: 't', is_active: false })];
    expect(T.contar(l)).toEqual({ todas: 2, activas: 1, pausadas: 1 });
    expect(T.filtrar(l, 'pausadas').map((p) => p.id)).toEqual(['t']);
  });
  test('estado de una corrida de flows.runs', () => {
    expect(T.estadoCorrida('succeeded').badge).toBe('badge--exito');
    expect(T.estadoCorrida('failed').badge).toBe('badge--error');
    expect(T.estadoCorrida('awaiting_approval').badge).toBe('badge--advertencia');
  });
  test('errores de la base en palabras; activar sin permiso sobre siguiente_cron = sin_puerta', () => {
    expect(T.enPalabras({ code: '42501', message: 'permission denied for function siguiente_cron' }).code).toBe('sin_puerta');
    expect(T.enPalabras({ code: '42501', message: 'new row violates row-level security policy' }).message).toMatch(/permiso/);
    expect(T.enPalabras({ code: '22023', message: 'zona horaria desconocida: «X».' }).message).toMatch(/zona horaria/);
  });
});
