/**
 * PageMeta — actualiza <title>, og:title y twitter:title según la vista activa.
 *
 * Formato del title:
 *   - Con org:  "{OrgName} | {Section}"   ej: "Ignis | Dashboard"
 *   - Sin org:  "AI Smart Content - {Section}"
 *   - Fallback: "AI Smart Content"
 *
 * Hooks:
 *   - Escucha `routechange` (router.js lo dispara tras renderizar la vista).
 *   - Fallback en DOMContentLoaded para cubrir el primer paint.
 *
 * Fuente del orgName: window.currentOrgName (router.js lo setea al resolver /org/:orgIdShort/:orgNameSlug).
 *
 * Las rutas reflejan js/app.js#registerRoutes (main).
 */
(function () {
  const PRODUCT_NAME = 'AI Smart Content';
  const ORG = '^/org/[^/]+/[^/]+';

  const ROUTE_LABELS = [
    [new RegExp(`${ORG}/dashboard$`),                          'Dashboard'],
    [new RegExp(`${ORG}/production$`),                         'Production'],
    [new RegExp(`${ORG}/monitoring$`),                         'Monitoring'],
    [new RegExp(`${ORG}/tasks(/.+)?$`),                        'Tasks'],
    [new RegExp(`${ORG}/brand-storage$`),                      'Brand Storage'],
    [new RegExp(`${ORG}/brand-organization$`),                 'Brand Organization'],
    [new RegExp(`${ORG}/brand(/.+)?$`),                        'Brand'],
    [new RegExp(`${ORG}/command-center(/.+)?$`),               'Command Center'],
    [new RegExp(`${ORG}/product-detail/.+$`),                  'Product'],
    [new RegExp(`${ORG}/identities(/.+)?$`),                   'Identities'],
    [new RegExp(`${ORG}/studio/flows.*$`),                     'Flows'],
    [new RegExp(`${ORG}/studio/catalog.*$`),                   'Flows'],
    [new RegExp(`${ORG}/studio(/.+)?$`),                       'Studio'],
    [new RegExp(`${ORG}/vera$`),                               'Vera'],
    [new RegExp(`${ORG}/video$`),                              'Video'],
    [new RegExp(`${ORG}/credits$`),                            'Credits'],
    [new RegExp(`${ORG}/plans$`),                              'Plans'],
    [new RegExp(`${ORG}/organization$`),                       'Settings'],

    [/^\/$/,                                                   'Home'],
    [/^\/login$/,                                              'Login'],
    [/^\/signin$/,                                             'Sign in'],
    [/^\/cambiar-contrasena$/,                                 'Cambiar contraseña'],
    [/^\/politica-de-privacidad$/,                             'Política de privacidad'],
    [/^\/privacidad$/,                                         'Política de privacidad'],
    [/^\/terminos(-de-servicio)?$/,                            'Términos de servicio'],
    [/^\/eliminacion-de-datos$/,                               'Eliminación de datos'],

    [/^\/dashboard$/,                                          'Dashboard'],
    [/^\/production$/,                                         'Production'],
    [/^\/monitoring$/,                                         'Monitoring'],
    [/^\/tasks(\/.+)?$/,                                       'Tasks'],
    [/^\/brand-storage$/,                                      'Brand Storage'],
    [/^\/brandstorage$/,                                       'Brand Storage'],
    [/^\/brand-organization$/,                                 'Brand Organization'],
    [/^\/brands?(\/.+)?$/,                                     'Brand'],
    [/^\/command-center(\/.+)?$/,                              'Command Center'],
    [/^\/product-detail\/.+$/,                                 'Product'],
    [/^\/identities(\/.+)?$/,                                  'Identities'],
    [/^\/studio\/flows.*$/,                                    'Flows'],
    [/^\/studio\/catalog.*$/,                                  'Flows'],
    [/^\/studio(\/.+)?$/,                                      'Studio'],
    [/^\/vera$/,                                               'Vera'],
    [/^\/video$/,                                              'Video'],
    [/^\/credits$/,                                            'Credits'],
    [/^\/plans$/,                                              'Plans'],
    [/^\/create$/,                                             'Create'],

    [/^\/dev\/dashboard$/,                                     'Dev · Dashboard'],
    [/^\/dev\/flows.*$/,                                       'Dev · Flows'],
    [/^\/dev\/builder.*$/,                                     'Dev · Builder'],
    [/^\/dev\/test.*$/,                                        'Dev · Test'],
    [/^\/dev\/runs.*$/,                                        'Dev · Runs'],
    [/^\/dev\/webhooks.*$/,                                    'Dev · Webhooks'],
    [/^\/dev\/logs.*$/,                                        'Dev · Logs'],
    [/^\/dev\/provisioning\/.*$/,                              'Dev · Provisioning'],
    [/^\/dev\/lead\/.*$/,                                      'Dev · Lead'],
  ];

  function resolveLabel(path) {
    for (const [pattern, label] of ROUTE_LABELS) {
      if (pattern.test(path)) return label;
    }
    return null;
  }

  function setMeta(name, content, attr) {
    attr = attr || 'name';
    const selector = `meta[${attr}="${name.replace(/"/g, '\\"')}"]`;
    let el = document.head.querySelector(selector);
    if (!el) {
      el = document.createElement('meta');
      el.setAttribute(attr, name);
      document.head.appendChild(el);
    }
    el.setAttribute('content', content);
  }

  function applyPageMeta() {
    const path = window.location.pathname || '/';
    const label = resolveLabel(path);
    const orgName = (window.currentOrgName || '').trim();

    let title;
    if (orgName && label) {
      title = `${orgName} | ${label}`;
    } else if (orgName) {
      title = `${orgName} | ${PRODUCT_NAME}`;
    } else if (label) {
      title = `${PRODUCT_NAME} - ${label}`;
    } else {
      title = PRODUCT_NAME;
    }

    if (document.title !== title) document.title = title;
    setMeta('og:title', title, 'property');
    setMeta('twitter:title', title);
  }

  window.addEventListener('routechange', applyPageMeta);
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', applyPageMeta);
  } else {
    applyPageMeta();
  }

  window.PageMeta = { apply: applyPageMeta, resolveLabel };
})();
