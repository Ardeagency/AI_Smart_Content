/**
 * EN OBRAS — el registro de lo que TODAVÍA no está portado a la base nueva
 * (corte ADR-0052, regla de backend 15/09): una vista/tarjeta no portada
 * muestra un estado «en obras» gris, SIN llamadas a la base; nunca «relation
 * does not exist» ni pantalla en blanco. El sidebar la lista con su chip.
 *
 * Se mide por SEGMENTO de ruta (sin el prefijo /org/:short/:slug): 'dashboard',
 * 'command-center', 'studio/catalog'… Quitar una entrada = declarar que esa
 * vista lee la base nueva y está probada. Vacío = todo portado.
 *
 * `window.AISC_EN_OBRAS` en runtime-config.js puede AÑADIR rutas sin build
 * (para apagar una vista rota en producción en un minuto).
 */
(function () {
  'use strict';

  const BASE = [
    // D3 o después (backend, 15/09): campañas y estrategia se quedan en obras el jueves.
    'command-center',
    'predictor',
    'tasks',
    'execution-history',
    // Hasta que cada una se porte y pruebe (se van quitando en el D1/D2/D3):
    'dashboard',
    'production',
    'monitoring',
    // 'brand' / 'brands' / 'brand-organization': PORTADAS el 16/09 (MarcaDataService, verificar-marca.mjs 14/14).
    'brand-storage', 'brandstorage',
    'products', 'services', 'places', 'characters', 'identities', 'product-detail',
    'studio', 'studio/catalog', 'studio/flows',
    'vera',
    // 'image': PORTADA el 16/09 (StudioDataService: imagen-directa por /v1; verificar-studio.mjs).
    'video',
    // 'credits' / 'plans': PORTADAS el 16/09 (PlanesDataService, verificar-planes.mjs).
    'plans/cancel', // cancelar no tiene puerta para una persona (planes.md): sigue en obras
    // 'organization': PORTADA el 16/09 (OrganizacionDataService, verificar-organizacion.mjs); resumen y bitácora esperan la 190000.
    'creation_process',
  ];

  const extra = (typeof window !== 'undefined' && Array.isArray(window.AISC_EN_OBRAS)) ? window.AISC_EN_OBRAS : [];
  const rutas = new Set([...BASE, ...extra].map((r) => String(r).replace(/^\/+/, '').replace(/\/+$/, '')));

  /** Segmento de vista de un path: quita /org/:short/:slug y parámetros. */
  function segmento(path) {
    let p = String(path || '').split('?')[0].replace(/^\/org\/[^/]+\/[^/]+/, '').replace(/^\/+/, '');
    return p;
  }

  /** ¿Esta ruta está en obras? Coincide por el segmento entero o por su primer tramo. */
  function es(path) {
    const seg = segmento(path);
    if (!seg) return false;
    if (rutas.has(seg)) return true;
    const partes = seg.split('/');
    for (let i = partes.length - 1; i >= 1; i--) if (rutas.has(partes.slice(0, i).join('/'))) return true;
    return false;
  }

  function portar(ruta) { rutas.delete(String(ruta).replace(/^\/+/, '')); }

  window.EnObras = Object.freeze({ es, segmento, portar, rutas });
})();
