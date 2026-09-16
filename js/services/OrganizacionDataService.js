/**
 * OrganizacionDataService — /organization (General · Miembros · Suscripción ·
 * Uso · Seguridad) sobre la base nueva (aqblperqrcwumiztmjnw, corte ADR-0052).
 * Única puerta a la base para OrganizationView; sustituye a OrgSummaryDataService
 * (12 tablas de v1) y a las ~30 lecturas a pelo de la vista.
 *
 * Contrato: Git-AISC-DB docs/contratos/organizacion.md (150000; correcciones en
 * 190000) y planes.md. Medido con el JWT de prueba el 16/09 14:20 UTC:
 *   organizations(id, slug, name, legal_name, owner_id, timezone, locale, mfa_required, plan)
 *     UPDATE editar_marca (timezone/locale/mfa_required/name/legal_name); `plan` NO se manda.
 *   V public.equipo(user_id, email, full_name, avatar_url, role, permissions[], joined_at,
 *     invited_by, ultimo_acceso, timezone, locale) — RLS de members (ver_marca).
 *   T public.members UPDATE role / DELETE (editar_equipo; triggers no_dejar_sin_dueno,
 *     poda_permisos, tope_del_plan). R invitar_miembro(p_org, p_user, p_role, p_permisos)
 *     solo para personas CON cuenta; invitaciones por correo = ADR-0048 (borrador).
 *   T markets (lo que v1 llamaba sub-marcas) · T elements por kind · flows.runs.
 *   R public.resumen_de_marca(p_org) → {creditos, limites, elementos, audiencias,
 *     vigilancia, estrategias, pauta} — HOY 42804 hasta la 190000: se declara pendiente.
 *   R public.historial_de_marca(p_org, p_desde, p_hasta, p_limite) — HOY 42501 (ops sin
 *     USAGE) hasta la 190000: pendiente.
 *   T public.alerts(id, type_code, title, body, link, read_at, acted_at, created_at) +
 *     T alert_types(code, severity, description) = las notificaciones de la marca.
 *   T billing.usage_records(meter_code, credits_charged, provider_cost, occurred_at,
 *     user_id, quantity) — SELECT exige ver_facturacion; 1 crédito = 1 USD (ADR-0027).
 *   Suscripción: PlanesDatos.cargar + T billing.invoices/payments/customers +
 *     R billing.puede_facturar / guardar_ficha (gestionar_facturacion).
 *   Cambiar de plan y cancelar: SIN puerta para una persona (planes.md).
 *
 * Todo lo que la base aún no da vuelve como `pendiente: true` con el código del
 * error: la vista lo dice en pantalla, nunca pinta un cero que parezca dato.
 */
(function () {
  'use strict';

  /* ── Mapeos puros (test/organizacion-datos.test.js) ─────────────────────── */

  function organizacionAV1(fila) {
    if (!fila) return null;
    return {
      id: fila.id,
      slug: fila.slug || null,
      name: fila.name || '',
      legal_name: fila.legal_name || null,
      owner_user_id: fila.owner_id || null,
      created_at: fila.created_at || null,
      deleted_at: fila.archived_at || null,
      timezone: fila.timezone || null,
      locale: fila.locale || null,
      mfa_required: fila.mfa_required === true,
      plan: fila.plan || null,
      logo_url: fila.logo_url || null,
    };
  }

  /** Fila de public.equipo → miembro con perfil como lo pinta la vista (id = user_id: members no expone id propio). */
  function miembroAV1(fila) {
    return {
      id: fila.user_id,
      user_id: fila.user_id,
      role: fila.role,
      created_at: fila.joined_at || null,
      invited_by: fila.invited_by || null,
      full_name: fila.full_name || null,
      email: fila.email || null,
      avatar_url: fila.avatar_url || null,
      permisos: Array.isArray(fila.permissions) ? fila.permissions : [],
      ultimo_acceso: fila.ultimo_acceso || null,
      timezone: fila.timezone || null,
      locale: fila.locale || null,
    };
  }

  function mercadoAV1(fila) {
    return { id: fila.id, nombre_marca: fila.name, created_at: fila.created_at, is_primary: fila.is_primary === true, mercado_objetivo: fila.countries || [], idiomas_contenido: fila.languages || [], nicho_core: fila.core_niche || null };
  }

  /** elements (kind) + corridas → los conteos del centro de control. */
  function conteos(filasElementos, corridas) {
    const por = { identity: 0, product: 0, service: 0, character: 0, scenario: 0 };
    (filasElementos || []).forEach((e) => { if (e.kind in por) por[e.kind] += 1; });
    return { identities: por.identity, products: por.product, services: por.service, places: por.scenario, characters: por.character, productions: Number(corridas) || 0 };
  }

  /** alerts + alert_types → la notificación que la vista pinta. */
  function alertaAV1(fila, tipos = {}) {
    const t = tipos[fila.type_code] || {};
    return {
      id: fila.id,
      type: fila.type_code,
      severity: t.severity || 'info',
      title: fila.title || t.description || fila.type_code,
      body: fila.body || '',
      action_url: fila.link || null,
      action_label: fila.link ? 'Ver' : null,
      status: fila.read_at ? 'read' : 'unread',
      read_at: fila.read_at || null,
      acted_at: fila.acted_at || null,
      created_at: fila.created_at,
    };
  }

  /** meter_code de la base → área de la gráfica de Uso (las claves de OrganizationView.USAGE_AREAS). */
  function areaDeMedidor(code) {
    const k = String(code || '');
    if (k.startsWith('image.')) return 'imagenes';
    if (k.startsWith('video.') || k.startsWith('audio.')) return 'videos';
    if (k.startsWith('flow.')) return 'flujos';
    if (k === 'llm.simular') return 'simulador';
    if (k === 'llm.analisis' || k === 'llm.consolidar' || k === 'llm.embeddings' || k.startsWith('llm.enriquecer') || k.startsWith('llm.visibilidad')) return 'analisis';
    if (k.startsWith('llm.') || k.startsWith('agent.') || k.startsWith('tool.')) return 'vera';
    if (k.startsWith('scrape.') || k.startsWith('legacy.apify')) return 'busqueda';
    if (k.startsWith('storage.')) return 'ajustes';
    return 'ajustes';
  }

  /** usage_records → movimiento con la forma de credit_usage de v1 (consumo = delta negativo). */
  function movimientoAV1(fila) {
    const creditos = Number(fila.credits_charged) || 0;
    return {
      id: fila.id,
      kind: fila.meter_code,
      display_name: fila.display_name || fila.meter_code,
      credits_delta: -creditos,
      usd_cost: fila.provider_currency && fila.provider_currency !== 'USD' ? creditos : (Number(fila.provider_cost) || creditos),
      created_at: fila.occurred_at || fila.created_at,
      metadata: { user_id: fila.user_id || null, flow_run_id: fila.flow_run_id || null, agent_run_id: fila.agent_run_id || null, quantity: fila.quantity ?? null },
      source_id: fila.flow_run_id || fila.agent_run_id || null,
    };
  }

  /**
   * La agregación de la pestaña Uso, portada tal cual de OrganizationView._loadUsage
   * (v1) para que la gráfica, el ranking por miembro y la proyección se pinten igual.
   * `todas` = movimientos (forma v1) del periodo Y del periodo anterior.
   */
  function usoDesde(todas, desde, hasta, disponibles) {
    const dias = Math.max(1, Math.round((hasta - desde) / (24 * 60 * 60 * 1000)) + 1);
    const corte = desde.toISOString();
    const rows = todas.filter((r) => (r.created_at || '') >= corte);
    const previo = todas
      .filter((r) => (r.created_at || '') < corte && Number(r.credits_delta) < 0)
      .reduce((a2, r) => a2 + Math.abs(Number(r.credits_delta) || 0), 0);
    const byDayMap = {};
    const porMiembro = {};
    const byArea = {};
    let total = 0, positivos = 0, usd = 0;
    const porKind = {};
    rows.forEach((r) => {
      const day = (r.created_at || '').slice(0, 10);
      if (!day) return;
      if (Number(r.credits_delta) >= 0) { positivos += 1; return; }
      usd += Number(r.usd_cost) || 0;
      const c = Math.abs(Number(r.credits_delta) || 0);
      const kk = r.kind || 'desconocido';
      if (!porKind[kk]) porKind[kk] = { creditos: 0, eventos: 0, nombre: r.display_name || kk };
      porKind[kk].creditos += c;
      porKind[kk].eventos += 1;
      const cat = areaDeMedidor(r.kind);
      if (!byDayMap[day]) byDayMap[day] = { day, total: 0, ops: 0, usd: 0, byArea: {}, opsArea: {} };
      byDayMap[day].usd += Number(r.usd_cost) || 0;
      byDayMap[day].byArea[cat] = (byDayMap[day].byArea[cat] || 0) + c;
      byDayMap[day].opsArea[cat] = (byDayMap[day].opsArea[cat] || 0) + 1;
      byDayMap[day].total += c;
      byDayMap[day].ops += 1;
      byArea[cat] = (byArea[cat] || 0) + c;
      total += c;
      const uid = r.metadata?.user_id || '__auto__';
      if (!porMiembro[uid]) porMiembro[uid] = { uid, creditos: 0, eventos: 0, ultima: null, porCat: {} };
      const m = porMiembro[uid];
      m.creditos += c;
      m.eventos += 1;
      m.porCat[cat] = (m.porCat[cat] || 0) + c;
      if (!m.ultima || r.created_at > m.ultima) m.ultima = r.created_at;
    });
    const byDay = [];
    for (let t = new Date(desde); t <= hasta; t.setDate(t.getDate() + 1)) {
      const dia = t.toISOString().slice(0, 10);
      byDay.push(byDayMap[dia] || { day: dia, total: 0, ops: 0, usd: 0, byArea: {}, opsArea: {} });
    }
    const peak = byDay.reduce((m, d) => (d.total > (m ? m.total : 0) ? d : m), null);
    const topAreaKey = Object.entries(byArea).sort((a, b) => b[1] - a[1])[0];
    const porDia = total / dias;
    const seAgotan = (porDia > 0 && typeof disponibles === 'number' && disponibles > 0)
      ? new Date(Date.now() + (disponibles / porDia) * 24 * 60 * 60 * 1000)
      : null;
    return {
      porDia, seAgotan, days: dias, byDay, byArea, total, peak,
      topAreaKey: total > 0 && topAreaKey ? topAreaKey[0] : null,
      events: rows.filter((r) => Number(r.credits_delta) < 0).length,
      positivos, usd, porKind, previo,
      variacion: previo > 0 ? Math.round(((total - previo) / previo) * 100) : null,
      movimientos: [...rows].sort((a, b) => String(b.created_at).localeCompare(String(a.created_at))),
      porMiembro: Object.values(porMiembro).sort((a, b) => b.creditos - a.creditos),
    };
  }

  /** resumen_de_marca (jsonb) → la forma que OrganizationView._renderResumen pinta (era OrgSummaryDataService.cargar). */
  function resumenAV1(r, planActual, mercados) {
    if (!r) return null;
    const cr = r.creditos || {};
    const total = Number(cr.tope_mensual) || Math.max(Number(cr.balance) || 0, 0);
    const disponibles = Number(cr.disponible) || 0;
    const usados = Math.max(0, Number(cr.consumido_periodo) || 0);
    const pauta = Array.isArray(r.pauta) ? r.pauta : [];
    const gastoPorMoneda = {};
    let activas = 0, pausadas = 0;
    pauta.forEach((p) => { gastoPorMoneda[p.currency] = (gastoPorMoneda[p.currency] || 0) + (Number(p.gastado_30d) || 0); activas += Number(p.campanas_activas) || 0; pausadas += Number(p.campanas_pausadas) || 0; });
    const vig = r.vigilancia || {};
    return {
      plan: planActual ? { nombre: planActual.name, creditosMes: planActual.credits_monthly } : null,
      creditos: { total, usados, disponibles, pctUsado: total > 0 ? Math.min(100, Math.round((usados / total) * 100)) : 0, retenido: Number(cr.retenido) || 0, periodo: { desde: cr.periodo_desde || null, hasta: cr.periodo_hasta || null } },
      limites: r.limites || null,
      elementos: Array.isArray(r.elementos) ? r.elementos : [],
      mercado: mercados || [],
      audiencias: { total: Number(r.audiencias?.total) || 0, observadas: Number(r.audiencias?.observadas) || 0 },
      vigilancia: { total: (Number(vig.perfiles_propios) || 0) + (Number(vig.perfiles_rivales) || 0), propios: Number(vig.perfiles_propios) || 0, rivales: Number(vig.perfiles_rivales) || 0, terminos: Number(vig.terminos) || 0, agendasActivas: Number(vig.agendas_activas) || 0, agendasPausadas: Number(vig.agendas_pausadas) || 0 },
      estrategias: { total: Number(r.estrategias?.planes_activos) || 0, lecturasSinActuar: Number(r.estrategias?.lecturas_sin_actuar) || 0 },
      pauta: pauta.length ? { campanas: { total: activas + pausadas, activas, pausadas }, anuncios: { total: 0, activos: 0, pausados: 0, conProblema: 0 }, gastoPorMoneda, conversiones: 0 } : null,
    };
  }

  /** historial_de_marca → eventos de la bitácora (era OrgSummaryDataService.actividad). */
  function eventoAV1(fila) {
    return {
      userId: fila.actor_id || null,
      actorKind: fila.actor_kind || null,
      actor: fila.actor || null,
      etiqueta: fila.accion || fila.tipo || '',
      tipo: fila.tipo || null,
      detalle: fila.detalle || '',
      sujeto: fila.sujeto_tabla ? `${fila.sujeto_tabla}${fila.sujeto_id ? ' ' + String(fila.sujeto_id).slice(0, 8) : ''}` : null,
      fecha: fila.cuando,
      datos: fila.datos || null,
    };
  }

  /** billing.customers → la ficha como la pinta el formulario (y de vuelta para guardar_ficha). */
  const CAMPOS_FICHA = Object.freeze(['legal_name', 'tax_id', 'tax_id_dv', 'tax_regime', 'taxpayer_kind', 'billing_email', 'billing_phone', 'address_line', 'city', 'region', 'country', 'postal_code']);
  function fichaAV1(fila) {
    const f = {};
    CAMPOS_FICHA.forEach((k) => { f[k] = fila?.[k] ?? null; });
    return f;
  }
  function fichaABase(ficha) {
    const p = {};
    CAMPOS_FICHA.forEach((k) => { if (ficha && k in ficha) { const v = ficha[k]; p[k] = (typeof v === 'string' ? v.trim() : v) || null; } });
    return p;
  }

  /* ── Acceso ──────────────────────────────────────────────────────────────── */

  let clienteInyectado = null;
  async function cliente() {
    if (clienteInyectado) return clienteInyectado;
    return window.supabase || (window.supabaseService && await window.supabaseService.getClient()) || null;
  }
  const sinPermiso = (e) => e && (e.code === '42501' || e.code === 'PGRST301');
  /** Una puerta que la migración aún no abrió (42804 forma vieja, 42501 schema sin USAGE, 42883 no existe). */
  const todaviaNo = (e) => e && ['42804', '42501', '42883', 'PGRST202', '42P01'].includes(e.code);
  function aviso(nombre, r) { if (r?.error && r.error.code !== 'PGRST116') console.warn(`[organizacion] ${nombre}:`, r.error.code, r.error.message); }

  async function organizacion(orgId) {
    const sb = await cliente();
    if (!sb || !orgId) return null;
    const r = await sb.from('organizations').select('id, slug, name, legal_name, owner_id, created_at, archived_at, timezone, locale, mfa_required, plan, logo_url').eq('id', orgId).maybeSingle();
    if (r.error) throw r.error;
    return organizacionAV1(r.data);
  }

  async function equipo(orgId) {
    const sb = await cliente();
    if (!sb || !orgId) return [];
    const r = await sb.from('equipo').select('user_id, email, full_name, avatar_url, role, permissions, joined_at, invited_by, ultimo_acceso, timezone, locale').eq('organization_id', orgId).order('joined_at', { ascending: true });
    if (r.error) throw r.error;
    return (r.data || []).map(miembroAV1);
  }

  async function mercados(orgId) {
    const sb = await cliente();
    if (!sb || !orgId) return [];
    const r = await sb.from('markets').select('id, name, countries, languages, core_niche, is_primary, created_at').eq('organization_id', orgId).is('archived_at', null).order('is_primary', { ascending: false }).order('created_at', { ascending: true });
    aviso('markets', r);
    return (r.data || []).map(mercadoAV1);
  }

  async function centroDeControl(orgId) {
    const sb = await cliente();
    if (!sb || !orgId) return conteos([], 0);
    const [el, runs] = await Promise.all([
      sb.from('elements').select('kind').eq('organization_id', orgId).is('archived_at', null),
      sb.schema('flows').from('runs').select('id', { count: 'exact', head: true }).eq('organization_id', orgId),
    ]);
    aviso('elements', el); aviso('flows.runs', runs);
    return conteos(el.data || [], runs.count || 0);
  }

  /** resumen_de_marca; si la base aún no lo da (190000), {pendiente:true, codigo}. */
  async function resumen(orgId, planActual, listaMercados) {
    const sb = await cliente();
    if (!sb || !orgId) return null;
    const r = await sb.rpc('resumen_de_marca', { p_org: orgId });
    if (r.error) {
      aviso('resumen_de_marca', r);
      return { pendiente: true, codigo: r.error.code, mensaje: r.error.message };
    }
    return resumenAV1(r.data, planActual, listaMercados);
  }

  async function notificaciones(orgId, limite = 20) {
    const sb = await cliente();
    if (!sb || !orgId) return [];
    const [al, tipos] = await Promise.all([
      sb.from('alerts').select('id, type_code, title, body, link, read_at, acted_at, created_at').eq('organization_id', orgId).order('created_at', { ascending: false }).limit(limite),
      sb.from('alert_types').select('code, severity, description'),
    ]);
    aviso('alerts', al); aviso('alert_types', tipos);
    const porCodigo = Object.fromEntries((tipos.data || []).map((t) => [t.code, t]));
    return (al.data || []).map((a) => alertaAV1(a, porCodigo));
  }

  /** historial_de_marca; si la base aún no lo da (190000), {pendiente:true}. */
  async function actividad(orgId, limite = 40) {
    const sb = await cliente();
    if (!sb || !orgId) return { eventos: [] };
    const r = await sb.rpc('historial_de_marca', { p_org: orgId, p_limite: limite });
    if (r.error) {
      aviso('historial_de_marca', r);
      return { eventos: [], pendiente: true, codigo: r.error.code, mensaje: r.error.message };
    }
    return { eventos: (r.data || []).map(eventoAV1) };
  }

  /**
   * Movimientos de créditos del rango y del rango anterior (una sola consulta,
   * como v1), ya agregados para la pestaña Uso. `disponibles` sirve para proyectar.
   * Sin ver_facturacion → {pendiente:true, sinPermiso:true}.
   */
  async function uso(orgId, desde, hasta, disponibles) {
    const sb = await cliente();
    if (!sb || !orgId) return null;
    const dias = Math.max(1, Math.round((hasta - desde) / (24 * 60 * 60 * 1000)) + 1);
    const previoDesde = new Date(desde.getTime() - dias * 24 * 60 * 60 * 1000);
    // PostgREST corta en 1.000 filas (max_rows): un mes de WAKEUP son ~900-2.200
    // registros, así que se pagina con range() hasta que una página venga corta.
    const PAGINA = 1000; const TOPE = 20000;
    const filas = [];
    for (let desdeFila = 0; desdeFila < TOPE; desdeFila += PAGINA) {
      const r = await sb.schema('billing').from('usage_records')
        .select('id, meter_code, display_name, credits_charged, provider_cost, provider_currency, occurred_at, user_id, quantity, flow_run_id, agent_run_id')
        .eq('organization_id', orgId)
        .gte('occurred_at', previoDesde.toISOString())
        .lte('occurred_at', new Date(hasta.getTime() + 86399000).toISOString())
        .order('occurred_at', { ascending: true })
        .order('id', { ascending: true })
        .range(desdeFila, desdeFila + PAGINA - 1);
      if (r.error) {
        aviso('usage_records', r);
        return { pendiente: true, sinPermiso: sinPermiso(r.error), codigo: r.error.code, ...usoDesde([], desde, hasta, disponibles) };
      }
      filas.push(...(r.data || []));
      if ((r.data || []).length < PAGINA) break;
    }
    return usoDesde(filas.map(movimientoAV1), desde, hasta, disponibles);
  }

  /** Suscripción: plan y saldo (PlanesDatos) + facturas, pagos, ficha y puede_facturar. */
  async function facturacion(orgId) {
    const sb = await cliente();
    if (!sb || !orgId) return null;
    const b = sb.schema('billing');
    const [planes, inv, pag, cust, pf] = await Promise.all([
      window.PlanesDatos ? window.PlanesDatos.cargar(orgId) : Promise.resolve(null),
      b.from('invoices').select('id, number, status, currency, subtotal, tax, total, period_start, period_end, issued_at, due_at, paid_at, provider, created_at').eq('organization_id', orgId).order('created_at', { ascending: false }).limit(50),
      b.from('payments').select('id, provider, status, amount, currency, method_brand, method_last4, paid_at, package_id, invoice_id, failure_reason, created_at').eq('organization_id', orgId).order('created_at', { ascending: false }).limit(50),
      b.from('customers').select('legal_name, tax_id, tax_id_dv, tax_regime, taxpayer_kind, billing_email, billing_phone, address_line, city, region, country, postal_code').eq('organization_id', orgId).maybeSingle(),
      b.rpc('puede_facturar', { p_org: orgId }),
    ]);
    aviso('invoices', inv); aviso('payments', pag); aviso('customers', cust); aviso('puede_facturar', pf);
    return {
      sub: planes?.currentSubscription || null,
      plan: planes?.currentPlan || null,
      acceso: planes?.acceso || null,
      creditos: planes ? { disponibles: planes.orgCredits.credits_available, saldo: planes.orgCredits.credits_balance, retenido: planes.orgCredits.retenido, mensuales: planes.currentPlan?.credits_monthly || 0 } : null,
      almacenamiento: planes?.orgStorage || null,
      invoices: inv.data || [],
      payments: pag.data || [],
      ficha: fichaAV1(cust.data),
      fichaSinPermiso: sinPermiso(cust.error),
      puedeFacturar: pf.error ? { puede: false, falta: [], sinPermiso: sinPermiso(pf.error) } : { puede: pf.data?.puede === true, falta: Array.isArray(pf.data?.falta) ? pf.data.falta : [] },
      puedeCambiarPlan: false,
    };
  }

  /* ── Escritura ──────────────────────────────────────────────────────────── */

  /** name / legal_name / timezone / locale / mfa_required por UPDATE (editar_marca). Devuelve la fila guardada. */
  async function actualizarOrganizacion(orgId, cambios) {
    const sb = await cliente();
    const permitidos = ['name', 'legal_name', 'timezone', 'locale', 'mfa_required'];
    const p = {};
    permitidos.forEach((k) => { if (cambios && k in cambios) p[k] = cambios[k]; });
    if (!sb || !orgId || !Object.keys(p).length) return null;
    const { data, error } = await sb.from('organizations').update(p).eq('id', orgId).select('id, slug, name, legal_name, owner_id, created_at, archived_at, timezone, locale, mfa_required, plan, logo_url').maybeSingle();
    if (error) throw error;
    if (!data) throw Object.assign(new Error('La base no devolvió la organización guardada (¿sin permiso editar_marca?).'), { code: 'sin_fila' });
    return organizacionAV1(data);
  }

  async function cambiarRol(orgId, userId, role) {
    const sb = await cliente();
    if (!sb || !orgId || !userId) return null;
    const { data, error } = await sb.from('members').update({ role }).eq('organization_id', orgId).eq('user_id', userId).select('user_id, role');
    if (error) throw error;
    if (!Array.isArray(data) || !data.length) throw Object.assign(new Error('El rol no cambió (¿sin permiso editar_equipo?).'), { code: 'sin_fila' });
    return data[0];
  }

  async function retirarMiembro(orgId, userId) {
    const sb = await cliente();
    if (!sb || !orgId || !userId) return false;
    const { data, error } = await sb.from('members').delete().eq('organization_id', orgId).eq('user_id', userId).select('user_id');
    if (error) throw error;
    return Array.isArray(data) && data.length > 0;
  }

  /**
   * Invitar: solo a personas CON cuenta (invitar_miembro exige el uuid). El correo se
   * resuelve contra profiles (RLS: si no se puede leer, la respuesta lo dice).
   * Sin cuenta → {code:'sin_cuenta'}: las invitaciones por correo son ADR-0048.
   */
  async function invitar(orgId, email, role = 'viewer') {
    const sb = await cliente();
    const correo = String(email || '').trim().toLowerCase();
    if (!sb || !orgId || !correo) throw Object.assign(new Error('Falta el correo.'), { code: 'entrada_invalida' });
    const perfil = await sb.from('profiles').select('id').eq('email', correo).maybeSingle();
    if (perfil.error && !sinPermiso(perfil.error)) throw perfil.error;
    if (!perfil.data?.id) throw Object.assign(new Error('Esa persona aún no tiene cuenta en AI Smart Content. Las invitaciones por correo llegan pronto; mientras tanto pídele que cree su cuenta y vuelve a invitarla.'), { code: 'sin_cuenta' });
    const { data, error } = await sb.rpc('invitar_miembro', { p_org: orgId, p_user: perfil.data.id, p_role: role });
    if (error) throw error;
    return data;
  }

  /** Ficha de facturación → billing.guardar_ficha (valida DV del NIT si country=CO). Devuelve {puede_facturar,…}. */
  async function guardarFicha(orgId, ficha) {
    const sb = await cliente();
    if (!sb || !orgId) return null;
    const { data, error } = await sb.schema('billing').rpc('guardar_ficha', { p_org: orgId, p: fichaABase(ficha) });
    if (error) throw error;
    return data;
  }

  window.OrganizacionDatos = Object.freeze({
    organizacion, equipo, mercados, centroDeControl, resumen, notificaciones, actividad, uso, facturacion,
    actualizarOrganizacion, cambiarRol, retirarMiembro, invitar, guardarFicha,
    todaviaNo, CAMPOS_FICHA,
    mapeo: Object.freeze({ organizacionAV1, miembroAV1, mercadoAV1, conteos, alertaAV1, areaDeMedidor, movimientoAV1, usoDesde, resumenAV1, eventoAV1, fichaAV1, fichaABase }),
    _inyectarCliente(sb) { clienteInyectado = sb; },
  });
})();
