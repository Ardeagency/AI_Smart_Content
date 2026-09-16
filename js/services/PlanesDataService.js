/**
 * PlanesDataService — /plans y /credits sobre la base nueva (aqblperqrcwumiztmjnw,
 * corte ADR-0052). Única puerta a la base para PlanesView y CreditsShopView; las
 * vistas siguen pintando las filas con los nombres de v1 y aquí se traduce.
 *
 * Contrato medido por BD el 16/09 13:50 UTC (Git-AISC-DB docs/contratos/planes.md),
 * todo en el schema `billing` salvo `public.storage_usage`:
 *   plans(tier, name, max_markets, max_members, monthly_credits, max_storage_gb)
 *     · la llave es `tier` (free, starter, pro, enterprise = orden de pantalla)
 *     · max_storage_gb NULO = SIN LÍMITE (decisión escrita, 20260910760000).
 *   prices(tier, currency, interval monthly|yearly, amount, provider, is_active)
 *     · pro 179 USD/mes · enterprise 499 USD/mes; free y starter SIN precio.
 *   plan_capabilities(tier, capability) — enum capability (10).
 *   subscriptions(tier, status, provider, currency, current_period_end, cancel_at_period_end).
 *   rpc acceso_por_suscripcion(p_org) → {plan, acceso, estado, bloquea, dias_*, mensaje, sin_plan}.
 *   rpc available(p_org) = saldo menos retenido · rpc balance(p_org).
 *   credit_packages(code, name, credits, amount, currency, is_active, valid_days).
 *   Comprar: POST /v1/pagos/iniciar {org, paquete:<code>} → {pago_id, checkout:{publicKey,
 *     currency, amountInCents, reference, signature:{integrity}, redirectUrl}}; 409
 *     ficha_de_facturacion_incompleta → Organización › Suscripción. CANDADO en ApiV2
 *     (PAGOS_HABILITADOS=false) hasta reprecificar (ADR-0042).
 *
 * Lo que NO existe para una persona (decisión de JC, planes.md): cambiar de plan y
 * cancelar la suscripción. `puedeCambiarPlan()` lo dice en una sola línea para que
 * la vista pinte «escríbenos» y no un botón que promete.
 */
(function () {
  'use strict';

  const ORDEN_TIER = Object.freeze({ free: 0, starter: 1, pro: 2, enterprise: 3 });
  /** Copy de pantalla por tier (no es dato de la base). */
  const COPY_TIER = Object.freeze({
    free: { description: 'Para empezar: una marca, un mercado, Vera en modo básico.' },
    starter: { description: 'Para una marca que ya publica y quiere medir.' },
    pro: { description: 'Para equipos: varios mercados, agentes con autonomía, competencia y tendencias.', is_popular: true },
    enterprise: { description: 'Para agencias y grupos: todo, con API propia y soporte prioritario.' },
  });
  /** Etiquetas de las capacidades del plan (enum public.capability). */
  const CAPACIDADES = Object.freeze({
    multi_mercado: 'Varios mercados por marca',
    agentes_ia: 'Agentes de IA (Vera)',
    autonomia_total: 'Vera con autonomía total',
    competencia: 'Monitoreo de competencia',
    tendencias: 'Tendencias del mercado',
    pauta: 'Campañas de pauta',
    publicacion_automatica: 'Publicación automática',
    integraciones_comercio: 'Integraciones de comercio',
    predictor: 'Simulador de audiencia',
    api_propia: 'API propia',
  });

  /* ── Mapeos puros (test/planes-datos.test.js) ───────────────────────────── */

  /** Precio activo de un tier en una moneda e intervalo, o null. */
  function precio(precios, tier, currency, interval) {
    const p = (precios || []).find((x) => x.tier === tier && x.currency === currency && x.interval === interval && x.is_active !== false);
    return p ? Number(p.amount) : null;
  }

  /** plans + prices + plan_capabilities → la fila que PlanesView pinta (forma v1). */
  function planAV1(plan, precios, capacidades) {
    const caps = (capacidades || []).filter((c) => c.tier === plan.tier).map((c) => c.capability);
    const mes = precio(precios, plan.tier, 'USD', 'monthly');
    const anio = precio(precios, plan.tier, 'USD', 'yearly');
    const copy = COPY_TIER[plan.tier] || {};
    return {
      id: plan.tier,
      tier: plan.tier,
      name: plan.name,
      description: copy.description || '',
      price_usd_month: plan.tier === 'free' ? 0 : mes,
      price_usd_year: plan.tier === 'free' ? 0 : anio,
      price_cop_month: precio(precios, plan.tier, 'COP', 'monthly'),
      price_cop_year: precio(precios, plan.tier, 'COP', 'yearly'),
      credits_monthly: Number(plan.monthly_credits) || 0,
      max_handles: Number(plan.max_markets) || 0,
      max_members: Number(plan.max_members) || 0,
      storage_mb: plan.max_storage_gb == null ? null : Number(plan.max_storage_gb) * 1024,
      sin_limite_almacenamiento: plan.max_storage_gb == null,
      features: { capacidades: caps, team_seats: Number(plan.max_members) || 0 },
      is_popular: copy.is_popular === true,
      display_order: ORDEN_TIER[plan.tier] ?? 99,
      is_active: true,
    };
  }

  /** Un plan se muestra si es gratis o tiene precio; starter sin fila de precio no se ofrece. */
  function seMuestra(planV1) {
    return planV1.tier === 'free' || planV1.price_usd_month != null;
  }

  function suscripcionAV1(fila) {
    if (!fila) return null;
    return {
      id: fila.id,
      plan_id: fila.tier,
      tier: fila.tier,
      status: fila.status,
      provider: fila.provider || null,
      currency: fila.currency || null,
      current_period_start: fila.current_period_start || null,
      current_period_end: fila.current_period_end || null,
      cancel_at_period_end: fila.cancel_at_period_end === true,
      trial_ends_at: fila.trial_ends_at || null,
    };
  }

  /** available + monthly_credits del plan → {credits_available, credits_total} para el medidor. */
  function creditosAV1(disponible, saldo, mensuales) {
    const available = Number(disponible) || 0;
    const balance = Number(saldo) || available;
    const total = Math.max(Number(mensuales) || 0, balance, available);
    return { credits_available: available, credits_balance: balance, credits_total: total, retenido: Math.max(0, balance - available) };
  }

  /** storage_usage (una fila por proveedor) + tope del plan → {used_mb, max_mb|null}. */
  function almacenamientoAV1(filas, maxGb) {
    const bytes = (filas || []).reduce((acc, f) => acc + (Number(f.bytes) || 0), 0);
    return {
      used_mb: Math.round((bytes / (1024 * 1024)) * 10) / 10,
      max_mb: maxGb == null ? null : Number(maxGb) * 1024,
      archivos: (filas || []).reduce((acc, f) => acc + (Number(f.archivos) || 0), 0),
    };
  }

  function paqueteAV1(fila) {
    return {
      id: fila.code,
      code: fila.code,
      name: fila.name,
      credits: Number(fila.credits) || 0,
      bonus: 0,
      price: Number(fila.amount) || 0,
      currency: fila.currency || 'COP',
      valid_days: fila.valid_days ?? null,
      popular: fila.code === 'pack_standard',
    };
  }

  /* ── Acceso ──────────────────────────────────────────────────────────────── */

  let clienteInyectado = null;
  async function cliente() {
    if (clienteInyectado) return clienteInyectado;
    return window.supabase || (window.supabaseService && await window.supabaseService.getClient()) || null;
  }
  function api() { return (typeof window !== 'undefined' && window.apiV2?.api) || null; }
  function aviso(nombre, r) { if (r?.error) console.warn(`[planes] ${nombre}:`, r.error.code, r.error.message); }

  /** Todo lo que /plans pinta: planes, suscripción, acceso, créditos, almacenamiento. */
  async function cargar(orgId) {
    const sb = await cliente();
    if (!sb) return null;
    const b = sb.schema('billing');
    const [planes, precios, caps, sus, acceso, disponible, saldo, storage] = await Promise.all([
      b.from('plans').select('tier, name, max_markets, max_members, monthly_credits, max_storage_gb'),
      b.from('prices').select('tier, currency, interval, amount, provider, is_active').eq('is_active', true),
      b.from('plan_capabilities').select('tier, capability'),
      orgId ? b.from('subscriptions').select('id, tier, status, provider, currency, current_period_start, current_period_end, cancel_at_period_end, trial_ends_at').eq('organization_id', orgId).order('created_at', { ascending: false }).limit(1).maybeSingle() : Promise.resolve({ data: null }),
      orgId ? b.rpc('acceso_por_suscripcion', { p_org: orgId }) : Promise.resolve({ data: null }),
      orgId ? b.rpc('available', { p_org: orgId }) : Promise.resolve({ data: null }),
      orgId ? b.rpc('balance', { p_org: orgId }) : Promise.resolve({ data: null }),
      orgId ? sb.from('storage_usage').select('provider, archivos, bytes, gb').eq('organization_id', orgId) : Promise.resolve({ data: [] }),
    ]);
    [['plans', planes], ['prices', precios], ['plan_capabilities', caps], ['subscriptions', sus], ['acceso_por_suscripcion', acceso], ['available', disponible], ['balance', saldo], ['storage_usage', storage]].forEach(([n, r]) => aviso(n, r));
    const plans = (planes.data || []).map((p) => planAV1(p, precios.data || [], caps.data || [])).filter(seMuestra).sort((a, b2) => a.display_order - b2.display_order);
    // `subscriptions` exige ver_facturacion; `acceso_por_suscripcion` basta ser miembro:
    // sin la fila, el plan actual se toma del acceso (sin fecha de renovación).
    const ac = acceso.data || null;
    const currentSubscription = suscripcionAV1(sus.data) || (ac?.plan && ac.acceso ? { plan_id: ac.plan, tier: ac.plan, status: ac.estado || 'active', current_period_end: null, cancel_at_period_end: false } : null);
    const planActual = plans.find((p) => p.tier === (currentSubscription?.tier || acceso.data?.plan)) || null;
    return {
      plans,
      currentSubscription,
      currentPlan: planActual,
      acceso: acceso.data || null,
      orgCredits: creditosAV1(disponible.data, saldo.data, planActual?.credits_monthly),
      orgStorage: almacenamientoAV1(storage.data || [], planActual ? (planActual.sin_limite_almacenamiento ? null : planActual.storage_mb / 1024) : null),
    };
  }

  /** Paquetes de créditos activos, con precio en su moneda. */
  async function paquetes() {
    const sb = await cliente();
    if (!sb) return [];
    const { data, error } = await sb.schema('billing').from('credit_packages').select('code, name, credits, amount, currency, is_active, valid_days').eq('is_active', true).order('credits', { ascending: true });
    if (error) { console.warn('[planes] credit_packages:', error.code, error.message); return []; }
    return (data || []).map(paqueteAV1);
  }

  /** ¿La marca puede comprar? {puede, falta[]} de billing.puede_facturar. */
  async function puedeFacturar(orgId) {
    const sb = await cliente();
    if (!sb || !orgId) return { puede: false, falta: [] };
    const { data, error } = await sb.schema('billing').rpc('puede_facturar', { p_org: orgId });
    if (error) { console.warn('[planes] puede_facturar:', error.code, error.message); return { puede: false, falta: [] }; }
    return { puede: data?.puede === true, falta: Array.isArray(data?.falta) ? data.falta : [] };
  }

  /**
   * Inicia la compra de un paquete por el borde y devuelve el checkout de Wompi.
   * Errores con palabras para la vista: `pagos_no_habilitados` (candado ADR-0042),
   * `sin_api`, `ficha_de_facturacion_incompleta` (409), `paquete_no_existe` (404), 403.
   */
  async function iniciarCompra(orgId, codigoPaquete) {
    const a = api();
    if (!a) throw Object.assign(new Error('El borde no está configurado (AISC_API_URL).'), { code: 'sin_api' });
    try {
      const r = await a.iniciarPago(orgId, codigoPaquete);
      if (!r?.checkout?.reference) throw Object.assign(new Error('El borde no devolvió el checkout.'), { code: 'sin_checkout' });
      return r;
    } catch (e) {
      if (e?.codigo && !e.code) e.code = e.codigo;
      throw e;
    }
  }

  /** Cambiar de plan / cancelar: sin puerta para una persona (planes.md, decisión de JC). */
  function puedeCambiarPlan() { return false; }

  window.PlanesDatos = Object.freeze({
    cargar, paquetes, puedeFacturar, iniciarCompra, puedeCambiarPlan,
    CAPACIDADES,
    mapeo: Object.freeze({ precio, planAV1, seMuestra, suscripcionAV1, creditosAV1, almacenamientoAV1, paqueteAV1, ORDEN_TIER }),
    _inyectarCliente(sb) { clienteInyectado = sb; },
  });
})();
