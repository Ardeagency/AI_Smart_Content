/**
 * TareasDataService — las TAREAS (/tasks): programaciones de flujos sobre la base nueva
 * (corte ADR-0052). Única puerta a la base para TareasView (la vista no llama `.from()`).
 *
 * Contrato medido el 25/09 en aqblperqrcwumiztmjnw:
 *   · T flows.schedules(id, flow_id, organization_id, market_id, created_by, name, cron,
 *     timezone (defecto America/Bogota), is_active, last_run_at, next_run_at, created_at,
 *     updated_at, entradas jsonb, rotacion jsonb, al_no_poder omitir|fallar, corridas,
 *     omitidas, ultimo_motivo, fallos_seguidos). RLS: gestionar_flujos (ALL). Sin `color`.
 *     Triggers: schedules_actualizado, schedules_calcula_proxima (DEFINER desde 20260925150000:
 *     valida el cron siempre que cambie cron o zona, también en pausa; al reactivar recalcula
 *     next_run_at desde ahora y pone fallos_seguidos en 0), schedules_zona_valida (22023 con palabras).
 *   · El cron de la base (private.siguiente_cron / campo_cron): 5 campos, listas, rangos y
 *     pasos; día de la semana 0-6 (el 7 NO vale); si día del mes Y día de la semana están
 *     restringidos, vale cualquiera de los dos (regla clásica).
 *   · Lo lanza pg_cron CADA MINUTO (flows.tomar_programaciones): una programación activa
 *     con next_run_at vencido corre en el minuto siguiente y gasta créditos. Por eso aquí
 *     se crea EN PAUSA y activar manda next_run_at = null (la base la recalcula hacia
 *     adelante; si no, la vencida de una pausa larga saldría al instante).
 *   · `entradas` = {clave_de_flows.inputs: receta}. Receta (flows.resolver_entradas):
 *       {modo:'fijo', valor} · {modo:'rotar', valores:[…]} · {modo:'elemento', tipo?, criterio?}
 *       (criterio menos_usado | mas_reciente | azar | destacado; tipo = element_kind)
 *       · {modo:'del_agente'} (la llena Vera) · sin clave o {modo:'por_defecto'} = default_value.
 *     Un modo desconocido hace fallar la corrida (22023). Las filas que vinieron de v1 traen
 *     `entradas` con la forma vieja (entity_ids, aspect_ratio…): la base no las usa.
 *   · R flows.resolver_entradas(p_schedule) (STABLE, authenticated): lo que saldría si
 *     corriera ahora → {valores, faltan, rotacion, puede}. No lanza nada.
 *   · flows.runs NO guarda qué programación lanzó cada corrida: se muestran las del flujo.
 */
(function () {
  'use strict';

  const t = (s, p) => (typeof window.__ === 'function' ? window.__(s, p) : String(s).replace(/\{(\w+)\}/g, (m, k) => (p && k in p ? String(p[k]) : m)));

  const COLS = 'id, flow_id, organization_id, market_id, created_by, name, cron, timezone, is_active, last_run_at, next_run_at, created_at, updated_at, entradas, rotacion, al_no_poder, corridas, omitidas, ultimo_motivo, fallos_seguidos';

  /* ── Cron (el mismo dialecto que la base) ───────────────────────────────── */

  const RANGOS = [[0, 59], [0, 23], [1, 31], [1, 12], [0, 6]];
  function nombresCampos() { return [t('minuto'), t('hora'), t('día del mes'), t('mes'), t('día de la semana')]; }

  /** Un campo → lista ordenada de valores, o null si la base lo rechazaría. */
  function campoCron(campo, min, max) {
    const v = new Set();
    for (let parte of String(campo).split(',')) {
      let paso = 1;
      if (parte.includes('/')) {
        const [base, p] = parte.split('/');
        if (!/^\d+$/.test(p)) return null;
        paso = Number(p); parte = base;
      }
      let desde; let hasta;
      if (parte === '*') { desde = min; hasta = max; }
      else if (/^\d+-\d+$/.test(parte)) { [desde, hasta] = parte.split('-').map(Number); }
      else if (/^\d+$/.test(parte)) { desde = Number(parte); hasta = desde; }
      else return null;
      if (desde < min || hasta > max || desde > hasta || paso < 1) return null;
      for (let g = desde; g <= hasta; g++) if ((g - desde) % paso === 0) v.add(g);
    }
    return [...v].sort((a, b) => a - b);
  }

  function partes(cron) { return String(cron || '').trim().split(/\s+/).filter(Boolean); }

  /** '' si la base lo acepta; si no, qué está mal, en palabras. */
  function validarCron(cron) {
    const c = partes(cron);
    if (c.length !== 5) return t('Un cron tiene cinco campos: minuto, hora, día del mes, mes y día de la semana.');
    const nombres = nombresCampos();
    for (let i = 0; i < 5; i++) {
      if (!campoCron(c[i], RANGOS[i][0], RANGOS[i][1])) return t('El campo «{campo}» está fuera de rango o mal escrito.', { campo: nombres[i] });
    }
    return '';
  }

  function camposCron(cron) {
    if (validarCron(cron)) return null;
    const c = partes(cron);
    const [mins, hrs, dias, meses, dsem] = c.map((x, i) => campoCron(x, RANGOS[i][0], RANGOS[i][1]));
    return { mins, hrs, dias, meses, dsem, conDia: c[2] !== '*', conSemana: c[4] !== '*' };
  }

  /** ¿Toca ese día (fecha local del calendario)? → [{hora, minuto}] en orden. */
  function ocurrenciasDelDia(cron, fecha) {
    const f = camposCron(cron);
    if (!f || !(fecha instanceof Date)) return [];
    if (!f.meses.includes(fecha.getMonth() + 1)) return [];
    const porDia = f.dias.includes(fecha.getDate());
    const porSemana = f.dsem.includes(fecha.getDay());
    const toca = (f.conDia && f.conSemana) ? (porDia || porSemana) : (porDia && porSemana);
    if (!toca) return [];
    const out = [];
    for (const hora of f.hrs) for (const minuto of f.mins) out.push({ hora, minuto });
    return out;
  }

  const dos = (n) => String(n).padStart(2, '0');
  function hhmm(h, m) { return `${dos(h)}:${dos(m)}`; }

  /** La forma que pinta el formulario de frecuencia. */
  function formaDeCron(cron) {
    const c = partes(cron).join(' ');
    let m;
    if ((m = c.match(/^(\d{1,2}) (\d{1,2}) \* \* \*$/))) return { frecuencia: 'diaria', hora: Number(m[2]), minuto: Number(m[1]) };
    if ((m = c.match(/^(\d{1,2}) (\d{1,2}) \* \* ([0-9,\-/]+)$/)) && campoCron(m[3], 0, 6)) return { frecuencia: 'semanal', hora: Number(m[2]), minuto: Number(m[1]), dias: campoCron(m[3], 0, 6) };
    if ((m = c.match(/^(\d{1,2}) (\d{1,2}) (\d{1,2}) \* \*$/))) return { frecuencia: 'mensual', hora: Number(m[2]), minuto: Number(m[1]), diaDelMes: Number(m[3]) };
    if ((m = c.match(/^(\d{1,2}) \*\/(\d{1,2}) \* \* \*$/))) return { frecuencia: 'horas', minuto: Number(m[1]), cadaHoras: Number(m[2]) };
    if ((m = c.match(/^(\d{1,2}) \* \* \* \*$/))) return { frecuencia: 'horas', minuto: Number(m[1]), cadaHoras: 1 };
    return { frecuencia: 'avanzada', cron: c };
  }

  /** Del formulario al cron. '' si falta algo (la vista lo dice con validarCron). */
  function cronDeForma(f) {
    const o = f || {};
    const h = Number(o.hora); const m = Number(o.minuto) || 0;
    switch (o.frecuencia) {
      case 'diaria': return `${m} ${h} * * *`;
      case 'semanal': {
        const dias = [...new Set((o.dias || []).map(Number).filter((d) => d >= 0 && d <= 6))].sort((a, b) => a - b);
        return dias.length ? `${m} ${h} * * ${dias.join(',')}` : '';
      }
      case 'mensual': return `${m} ${h} ${Number(o.diaDelMes) || 1} * *`;
      case 'horas': { const n = Number(o.cadaHoras) || 1; return n === 1 ? `${m} * * * *` : `${m} */${n} * * *`; }
      default: return partes(o.cron).join(' ');
    }
  }

  function nombresDias() { return [t('domingo'), t('lunes'), t('martes'), t('miércoles'), t('jueves'), t('viernes'), t('sábado')]; }
  function enumerar(lista) { return lista.length <= 1 ? (lista[0] || '') : `${lista.slice(0, -1).join(', ')} ${t('y')} ${lista[lista.length - 1]}`; }

  /** El cron en una frase. */
  function describirCron(cron) {
    if (validarCron(cron)) return t('Frecuencia sin definir');
    const f = formaDeCron(cron);
    if (f.frecuencia === 'diaria') return t('Todos los días a las {hora}', { hora: hhmm(f.hora, f.minuto) });
    if (f.frecuencia === 'semanal') {
      const d = f.dias;
      if (d.length === 7) return t('Todos los días a las {hora}', { hora: hhmm(f.hora, f.minuto) });
      if (d.join(',') === '1,2,3,4,5') return t('De lunes a viernes a las {hora}', { hora: hhmm(f.hora, f.minuto) });
      // Lunes primero: la semana del calendario empieza en lunes.
      const orden = [...d].sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7));
      return t('Cada {dias} a las {hora}', { dias: enumerar(orden.map((x) => nombresDias()[x])), hora: hhmm(f.hora, f.minuto) });
    }
    if (f.frecuencia === 'mensual') return t('El día {dia} de cada mes a las {hora}', { dia: f.diaDelMes, hora: hhmm(f.hora, f.minuto) });
    if (f.frecuencia === 'horas') return f.cadaHoras === 1 ? t('Cada hora, en el minuto {m}', { m: dos(f.minuto) }) : t('Cada {n} horas, en el minuto {m}', { n: f.cadaHoras, m: dos(f.minuto) });
    return t('Expresión avanzada: {cron}', { cron: f.cron });
  }

  /* ── Entradas (recetas de flows.resolver_entradas) ─────────────────────── */

  const CRITERIOS = ['menos_usado', 'mas_reciente', 'azar', 'destacado'];
  const TIPOS_ELEMENTO = ['product', 'service', 'character', 'scenario', 'identity'];
  const SIN_VALOR_FIJO = new Set(['image', 'video', 'audio', 'file', 'gradient', 'multi_select']);

  /** Qué modos tienen sentido para un kind de flows.inputs. */
  function modosPara(kind) {
    const k = String(kind || 'text');
    if (SIN_VALOR_FIJO.has(k)) return ['por_defecto', 'del_agente'];
    // Rotar elementos a mano no hace falta: «elemento» ya los recorre (el menos usado primero).
    if (k === 'element_ref') return ['por_defecto', 'fijo', 'elemento', 'del_agente'];
    if (k === 'boolean' || k === 'market_ref') return ['por_defecto', 'fijo', 'del_agente'];
    return ['por_defecto', 'fijo', 'rotar', 'del_agente'];
  }

  function esReceta(v) { return !!v && typeof v === 'object' && !Array.isArray(v) && typeof v.modo === 'string'; }

  /** Claves de `entradas` con la forma vieja (v1): la base no las aplica. */
  function heredadas(entradas) {
    return Object.entries(entradas || {}).filter(([, v]) => !esReceta(v)).map(([k]) => k);
  }

  /** Lo guardado → lo que pinta el formulario de una entrada. */
  function formularioDeEntrada(guardado) {
    if (guardado === undefined) return { modo: 'por_defecto' };
    if (!esReceta(guardado)) return { modo: 'por_defecto', heredado: guardado };
    const r = guardado;
    return {
      modo: r.modo,
      valor: r.valor === undefined || r.valor === null ? '' : (typeof r.valor === 'object' ? JSON.stringify(r.valor) : String(r.valor)),
      valores: Array.isArray(r.valores) ? r.valores.map((x) => (typeof x === 'object' ? JSON.stringify(x) : String(x))).join('\n') : '',
      tipo: r.tipo || '',
      criterio: r.criterio || 'menos_usado',
    };
  }

  function coercer(kind, texto) {
    const s = String(texto == null ? '' : texto).trim();
    if (!s) return { vacio: true };
    if (kind === 'number') { const n = Number(s.replace(',', '.')); return Number.isFinite(n) ? { valor: n } : { error: t('«{v}» no es un número.', { v: s }) }; }
    if (kind === 'boolean') return (s === 'true' || s === 'false') ? { valor: s === 'true' } : { error: t('Elige sí o no.') };
    return { valor: s };
  }

  /** Formulario de una entrada → receta (null = por defecto) o {error}. */
  function recetaDeFormulario(form, campo) {
    const f = form || { modo: 'por_defecto' };
    const kind = campo?.kind || 'text';
    if (!modosPara(kind).includes(f.modo)) return { error: t('Ese modo no aplica a esta entrada.') };
    if (f.modo === 'por_defecto') return { receta: null };
    if (f.modo === 'del_agente') return { receta: { modo: 'del_agente' } };
    if (f.modo === 'fijo') {
      const c = coercer(kind, f.valor);
      if (c.error) return { error: c.error };
      if (c.vacio) return { error: t('Falta el valor fijo.') };
      return { receta: { modo: 'fijo', valor: c.valor } };
    }
    if (f.modo === 'rotar') {
      const valores = [];
      for (const linea of String(f.valores || '').split('\n')) {
        const c = coercer(kind, linea);
        if (c.vacio) continue;
        if (c.error) return { error: c.error };
        valores.push(c.valor);
      }
      if (valores.length < 2) return { error: t('Para rotar hacen falta al menos dos valores, uno por línea.') };
      return { receta: { modo: 'rotar', valores } };
    }
    if (f.modo === 'elemento') {
      const criterio = f.criterio || 'menos_usado';
      if (!CRITERIOS.includes(criterio)) return { error: t('Ese criterio no existe.') };
      if (f.tipo && !TIPOS_ELEMENTO.includes(f.tipo)) return { error: t('Ese tipo de elemento no existe.') };
      return { receta: f.tipo ? { modo: 'elemento', tipo: f.tipo, criterio } : { modo: 'elemento', criterio } };
    }
    return { error: t('Ese modo no aplica a esta entrada.') };
  }

  /**
   * `entradas` que se guardan: las recetas del formulario + lo que no es del flujo (se
   * conserva: no se borra en silencio lo que vino de v1). Una entrada heredada que se
   * deja «por defecto» también se conserva tal cual.
   */
  function componerEntradas(original, campos, formularios) {
    const orig = original && typeof original === 'object' ? original : {};
    const claves = new Set((campos || []).map((c) => c.key));
    const entradas = {};
    for (const [k, v] of Object.entries(orig)) if (!claves.has(k)) entradas[k] = v;
    const errores = [];
    for (const campo of campos || []) {
      const r = recetaDeFormulario((formularios || {})[campo.key], campo);
      if (r.error) { errores.push({ key: campo.key, texto: r.error }); continue; }
      if (r.receta) entradas[campo.key] = r.receta;
      else if (campo.key in orig && !esReceta(orig[campo.key])) entradas[campo.key] = orig[campo.key];
    }
    return { entradas, errores };
  }

  /** Obligatorias que quedarán vacías: la corrida se salta (u apaga) cada vez. */
  function avisosDeEntradas(campos, entradas) {
    const e = entradas || {};
    return (campos || []).filter((c) => {
      if (!c.required) return false;
      const r = e[c.key];
      const modo = esReceta(r) ? r.modo : 'por_defecto';
      return modo === 'por_defecto' && (c.defaultValue === undefined || c.defaultValue === null || c.defaultValue === '');
    }).map((c) => c.key);
  }

  /* ── Filas → lo que pinta la vista ─────────────────────────────────────── */

  function programacionDeFila(f, nombres = {}) {
    const activa = f.is_active === true;
    const motivo = f.ultimo_motivo || null;
    const fallos = Number(f.fallos_seguidos) || 0;
    // La apagó la base (no la persona): 10 fallos seguidos, quien la creó ya no es miembro,
    // o faltaron entradas con «apagar si no puede». Un motivo de una omisión vieja no cuenta.
    const detenida = !activa && !!motivo && (fallos >= 10 || /apagada sola|ya no es miembro/i.test(motivo) || (f.al_no_poder === 'fallar' && /^faltan entradas/i.test(motivo)));
    return {
      id: f.id,
      flowId: f.flow_id,
      organizationId: f.organization_id,
      marketId: f.market_id || null,
      creadaPor: f.created_by || null,
      nombre: f.name || '',
      flujo: nombres[f.flow_id] || null,
      cron: f.cron || '',
      zona: f.timezone || 'America/Bogota',
      activa,
      estado: activa ? 'activa' : (detenida ? 'detenida' : 'pausada'),
      proxima: activa ? (f.next_run_at || null) : null,
      ultima: f.last_run_at || null,
      corridas: Number(f.corridas) || 0,
      omitidas: Number(f.omitidas) || 0,
      fallos,
      motivo,
      alNoPoder: f.al_no_poder === 'fallar' ? 'fallar' : 'omitir',
      entradas: f.entradas && typeof f.entradas === 'object' ? f.entradas : {},
      heredada: heredadas(f.entradas).length > 0,
      creadaEn: f.created_at || null,
      actualizadaEn: f.updated_at || null,
    };
  }

  function estadoProgramacion(p) {
    if (p?.estado === 'activa') return { etiqueta: t('Activa'), badge: 'badge--exito' };
    if (p?.estado === 'detenida') return { etiqueta: t('Se detuvo'), badge: 'badge--error' };
    return { etiqueta: t('En pausa'), badge: '' };
  }

  function estadoCorrida(status) {
    const s = String(status || '').toLowerCase();
    if (s === 'succeeded') return { etiqueta: t('Completada'), badge: 'badge--exito' };
    if (s === 'failed') return { etiqueta: t('Falló'), badge: 'badge--error' };
    if (s === 'cancelled') return { etiqueta: t('Cancelada'), badge: '' };
    if (s === 'awaiting_approval') return { etiqueta: t('Espera aprobación'), badge: 'badge--advertencia' };
    if (s === 'queued') return { etiqueta: t('En cola'), badge: 'badge--info' };
    if (s === 'running') return { etiqueta: t('En curso'), badge: 'badge--info' };
    return { etiqueta: s || '—', badge: '' };
  }

  function filtrar(lista, filtro) {
    const l = lista || [];
    if (filtro === 'activas') return l.filter((p) => p.activa);
    if (filtro === 'pausadas') return l.filter((p) => !p.activa);
    return l;
  }
  function contar(lista) {
    const l = lista || [];
    return { todas: l.length, activas: l.filter((p) => p.activa).length, pausadas: l.filter((p) => !p.activa).length };
  }

  /* ── Semana del calendario ─────────────────────────────────────────────── */

  function inicioDeSemana(fecha) {
    const d = new Date(fecha);
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
    return d;
  }

  /**
   * 7 días desde el lunes, con lo que toca cada día. Una programación que corre más de
   * 3 veces en un día (cada hora…) va en UNA tarjeta con cuántas veces.
   */
  function agendaDeSemana(programaciones, lunes) {
    const inicio = inicioDeSemana(lunes);
    return Array.from({ length: 7 }, (_, i) => {
      const fecha = new Date(inicio);
      fecha.setDate(inicio.getDate() + i);
      const eventos = [];
      for (const p of programaciones || []) {
        const oc = ocurrenciasDelDia(p.cron, fecha);
        if (!oc.length) continue;
        if (oc.length > 3) eventos.push({ p, hora: oc[0].hora, minuto: oc[0].minuto, veces: oc.length });
        else oc.forEach((o) => eventos.push({ p, hora: o.hora, minuto: o.minuto, veces: 1 }));
      }
      eventos.sort((a, b) => (a.hora - b.hora) || (a.minuto - b.minuto) || String(a.p.nombre).localeCompare(String(b.p.nombre)));
      return { fecha, eventos };
    });
  }

  /* ── Errores en palabras ───────────────────────────────────────────────── */

  function enPalabras(error) {
    const e = error || {};
    const code = e.code || '';
    let msg;
    if (code === '42501') msg = t('No tienes permiso para gestionar los flujos de esta marca.');
    else if (code === '22023') msg = e.message || t('La base rechazó la frecuencia o la zona horaria.');
    else if (code === '23514') msg = t('Falta el nombre o la frecuencia.');
    else if (code === '23503') msg = t('El flujo o el mercado ya no existe.');
    else if (code === 'sin_cambio') msg = e.message;
    else msg = e.message || t('Algo salió mal al hablar con la base.');
    return Object.assign(new Error(msg), { code: code || 'error', original: e });
  }

  /* ── Acceso ──────────────────────────────────────────────────────────────── */

  let clienteInyectado = null;
  async function cliente() {
    if (clienteInyectado) return clienteInyectado;
    return window.supabase || (window.supabaseService && await window.supabaseService.getClient()) || null;
  }
  async function exigirCliente() {
    const sb = await cliente();
    if (!sb) throw Object.assign(new Error(t('La base no está disponible.')), { code: 'sin_base' });
    return sb;
  }
  function aviso(nombre, r) { if (r?.error) console.warn(`[tareas] ${nombre}:`, r.error.code, r.error.message); }

  /** Nombre de cada flujo (catalog_view; si no sale ahí, vista_org de la marca). */
  async function nombresDeFlujos(sb, orgId, flowIds) {
    const ids = [...new Set((flowIds || []).filter(Boolean))];
    const nombres = {};
    if (!ids.length) return nombres;
    const c = await sb.schema('flows').from('catalog_view').select('id, name').in('id', ids);
    aviso('flows.catalog_view', c);
    (c.data || []).forEach((f) => { nombres[f.id] = f.name; });
    const faltan = ids.filter((id) => !nombres[id]);
    if (faltan.length && orgId) {
      const v = await sb.schema('flows').from('vista_org').select('flow_id, nombre').eq('organization_id', orgId).in('flow_id', faltan);
      aviso('flows.vista_org', v);
      (v.data || []).forEach((f) => { if (f.nombre) nombres[f.flow_id] = f.nombre; });
    }
    return nombres;
  }

  async function programaciones(orgId) {
    if (!orgId) return [];
    const sb = await exigirCliente();
    const r = await sb.schema('flows').from('schedules').select(COLS).eq('organization_id', orgId).order('created_at', { ascending: false });
    if (r.error) throw enPalabras(r.error);
    const nombres = await nombresDeFlujos(sb, orgId, (r.data || []).map((f) => f.flow_id));
    return (r.data || []).map((f) => programacionDeFila(f, nombres));
  }

  async function programacion(orgId, id) {
    if (!orgId || !id) return null;
    const sb = await exigirCliente();
    const r = await sb.schema('flows').from('schedules').select(COLS).eq('organization_id', orgId).eq('id', id).maybeSingle();
    if (r.error) throw enPalabras(r.error);
    if (!r.data) return null;
    const nombres = await nombresDeFlujos(sb, orgId, [r.data.flow_id]);
    return programacionDeFila(r.data, nombres);
  }

  /** Update que confirma que la fila cambió (RLS no da error: devuelve cero filas). */
  async function cambiar(id, cambios) {
    const sb = await exigirCliente();
    const r = await sb.schema('flows').from('schedules').update(cambios).eq('id', id).select(COLS).maybeSingle();
    if (r.error) throw enPalabras(r.error);
    if (!r.data) throw enPalabras({ code: 'sin_cambio', message: t('No se guardó: la tarea ya no existe o no tienes permiso.') });
    const nombres = await nombresDeFlujos(sb, r.data.organization_id, [r.data.flow_id]);
    return programacionDeFila(r.data, nombres);
  }

  /** Crea la programación EN PAUSA: activarla es un paso aparte (gasta créditos). */
  async function crear(orgId, userId, datos) {
    const d = datos || {};
    const sb = await exigirCliente();
    const fila = {
      organization_id: orgId, flow_id: d.flowId, name: String(d.nombre || '').trim(), cron: d.cron,
      timezone: d.zona || 'America/Bogota', entradas: d.entradas || {}, market_id: d.marketId || null,
      al_no_poder: d.alNoPoder === 'fallar' ? 'fallar' : 'omitir', is_active: false, created_by: userId || null,
    };
    const r = await sb.schema('flows').from('schedules').insert(fila).select(COLS).single();
    if (r.error) throw enPalabras(r.error);
    const nombres = await nombresDeFlujos(sb, orgId, [r.data.flow_id]);
    return programacionDeFila(r.data, nombres);
  }

  async function guardar(id, datos) {
    const d = datos || {};
    const cambios = {};
    if ('nombre' in d) cambios.name = String(d.nombre || '').trim();
    if ('cron' in d) cambios.cron = d.cron;
    if ('zona' in d) cambios.timezone = d.zona;
    if ('entradas' in d) cambios.entradas = d.entradas || {};
    if ('marketId' in d) cambios.market_id = d.marketId || null;
    if ('alNoPoder' in d) cambios.al_no_poder = d.alNoPoder === 'fallar' ? 'fallar' : 'omitir';
    return cambiar(id, cambios);
  }

  /**
   * Activar: solo is_active. Al pasar de pausa a activa la base (migración 20260925150000)
   * recalcula next_run_at desde ahora y pone fallos_seguidos en 0.
   */
  async function activar(id, activa) {
    return cambiar(id, { is_active: !!activa });
  }

  async function duplicar(p, userId) {
    return crear(p.organizationId, userId, {
      flowId: p.flowId, nombre: t('{nombre} (copia)', { nombre: p.nombre }), cron: p.cron, zona: p.zona,
      entradas: p.entradas, marketId: p.marketId, alNoPoder: p.alNoPoder,
    });
  }

  async function borrar(id) {
    const sb = await exigirCliente();
    const r = await sb.schema('flows').from('schedules').delete().eq('id', id).select('id');
    if (r.error) throw enPalabras(r.error);
    if (!(r.data || []).length) throw enPalabras({ code: 'sin_cambio', message: t('No se borró: la tarea ya no existe o no tienes permiso.') });
    return true;
  }

  /** Lo que saldría si corriera ahora (flows.resolver_entradas). No lanza nada. */
  async function previa(id) {
    const sb = await exigirCliente();
    const r = await sb.schema('flows').rpc('resolver_entradas', { p_schedule: id });
    if (r.error) throw enPalabras(r.error);
    const d = r.data || {};
    return { valores: d.valores || {}, faltan: Array.isArray(d.faltan) ? d.faltan : [], puede: d.puede === true };
  }

  /** Corridas recientes DEL FLUJO en la marca (la base no dice cuáles lanzó la tarea). */
  async function corridasDelFlujo(orgId, flowId, limite = 10) {
    if (!orgId || !flowId) return [];
    const sb = await exigirCliente();
    const r = await sb.schema('flows').from('runs').select('id, status, error, credits_charged, created_at, finished_at').eq('organization_id', orgId).eq('flow_id', flowId).order('created_at', { ascending: false }).limit(limite);
    if (r.error) throw enPalabras(r.error);
    return r.data || [];
  }

  /** Elementos y mercados de la marca: opciones de element_ref / market_ref. */
  async function opcionesDeMarca(orgId) {
    const vacio = { elementos: [], mercados: [] };
    if (!orgId) return vacio;
    const sb = await exigirCliente();
    const [e, m] = await Promise.all([
      sb.from('elements_full').select('id, name, kind').eq('organization_id', orgId).is('archived_at', null).order('name', { ascending: true }),
      sb.from('markets').select('id, name').eq('organization_id', orgId).order('name', { ascending: true }),
    ]);
    aviso('elements_full', e); aviso('markets', m);
    return {
      elementos: (e.data || []).map((x) => ({ value: x.id, label: x.name, kind: x.kind })),
      mercados: (m.data || []).map((x) => ({ value: x.id, label: x.name })),
    };
  }

  /** Flujos que se pueden programar (el catálogo de la marca) y las entradas de uno. */
  async function flujos(orgId) {
    if (!window.FlujosDatos) return [];
    return window.FlujosDatos.flujos(orgId);
  }
  async function entradasDelFlujo(flowId, opciones) {
    if (!window.FlujosDatos || !flowId) return [];
    return window.FlujosDatos.entradas(flowId, opciones || {});
  }

  window.TareasDatos = Object.freeze({
    programaciones, programacion, crear, guardar, activar, duplicar, borrar, previa,
    corridasDelFlujo, opcionesDeMarca, flujos, entradasDelFlujo,
    mapeo: Object.freeze({
      campoCron, validarCron, camposCron, ocurrenciasDelDia, formaDeCron, cronDeForma, describirCron,
      modosPara, esReceta, heredadas, formularioDeEntrada, recetaDeFormulario, componerEntradas, avisosDeEntradas,
      programacionDeFila, estadoProgramacion, estadoCorrida, filtrar, contar, inicioDeSemana, agendaDeSemana, enPalabras,
      CRITERIOS, TIPOS_ELEMENTO,
    }),
    _inyectarCliente(sb) { clienteInyectado = sb; },
  });
})();
