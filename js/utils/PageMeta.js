/**
 * PageMeta — actualiza <title>, meta description y OG tags según la vista activa.
 *
 * Formato del title:
 *   - Con org:  "{OrgName} | {Section}"   ej: "Ignis | Brand"
 *   - Sin org:  "AI Smart Content - {Section}"
 *   - Fallback: "AI Smart Content"
 *
 * Hooks:
 *   - Escucha `routechange` (disparado por router.js tras renderizar la vista).
 *   - Refresca también en DOMContentLoaded para cubrir el primer paint.
 *
 * Fuente del orgName: window.currentOrgName (lo setea router.js al resolver /org/:orgIdShort/:orgNameSlug).
 */
(function () {
  const PRODUCT_NAME = 'AI Smart Content';
  const ORG_PREFIX = '^/org/[^/]+/[^/]+';

  const ROUTE_LABELS = [
    [new RegExp(`${ORG_PREFIX}/production$`),               'Production'],
    [new RegExp(`${ORG_PREFIX}/living$`),                   'Production'],
    [new RegExp(`${ORG_PREFIX}/historial$`),                'Production'],
    [new RegExp(`${ORG_PREFIX}/tasks(/.+)?$`),              'Tasks'],
    [new RegExp(`${ORG_PREFIX}/video$`),                    'Video'],
    [new RegExp(`${ORG_PREFIX}/studio/flows.*$`),           'Flows'],
    [new RegExp(`${ORG_PREFIX}/studio/catalog.*$`),         'Flows'],
    [new RegExp(`${ORG_PREFIX}/studio(/.+)?$`),             'Studio'],
    [new RegExp(`${ORG_PREFIX}/brand(/.+)?$`),              'Brand'],
    [new RegExp(`${ORG_PREFIX}/product-detail/.+$`),        'Products'],
    [new RegExp(`${ORG_PREFIX}/products(/.+)?$`),           'Products'],
    [new RegExp(`${ORG_PREFIX}/servicios$`),                'Services'],
    [new RegExp(`${ORG_PREFIX}/audiences(/.+)?$`),          'Audiences'],
    [new RegExp(`${ORG_PREFIX}/campaigns(/.+)?$`),          'Campaigns'],
    [new RegExp(`${ORG_PREFIX}/marketing$`),                'Campaigns'],
    [new RegExp(`${ORG_PREFIX}/content(/.+)?$`),            'Content'],
    [new RegExp(`${ORG_PREFIX}/organization$`),             'Settings'],
    [new RegExp(`${ORG_PREFIX}/credits$`),                  'Credits'],
    [new RegExp(`${ORG_PREFIX}/settings$`),                 'Settings'],

    [/^\/$/,                                                'Home'],
    [/^\/login$/,                                           'Login'],
    [/^\/signin$/,                                          'Sign in'],
    [/^\/cambiar-contrasena$/,                              'Cambiar contraseña'],
    [/^\/settings$/,                                        'Settings'],
    [/^\/credits$/,                                         'Credits'],
    [/^\/create$/,                                          'Create'],
    [/^\/form_org$/,                                        'Form'],
    [/^\/production$/,                                      'Production'],
    [/^\/living$/,                                          'Production'],
    [/^\/historial$/,                                       'Production'],
    [/^\/tasks(\/.+)?$/,                                    'Tasks'],
    [/^\/video$/,                                           'Video'],
    [/^\/studio.*$/,                                        'Studio'],
    [/^\/brands(\/.+)?$/,                                   'Brand'],
    [/^\/products(\/.+)?$/,                                 'Products'],
    [/^\/servicios$/,                                       'Services'],
    [/^\/audiences$/,                                       'Audiences'],
    [/^\/campaigns$/,                                       'Campaigns'],
    [/^\/marketing$/,                                       'Campaigns'],
    [/^\/content$/,                                         'Content'],

    [/^\/dev\/dashboard$/,                                  'Dev · Dashboard'],
    [/^\/dev\/flows.*$/,                                    'Dev · Flows'],
    [/^\/dev\/builder.*$/,                                  'Dev · Builder'],
    [/^\/dev\/test.*$/,                                     'Dev · Test'],
    [/^\/dev\/webhooks.*$/,                                 'Dev · Webhooks'],
    [/^\/dev\/logs.*$/,                                     'Dev · Logs'],
    [/^\/dev\/lead\/.*$/,                                   'Dev · Lead'],
  ];

  function resolveLabel(path) {
    for (const [pattern, label] of ROUTE_LABELS) {
      if (pattern.test(path)) return label;
    }
    return null;
  }

  function setMeta(name, content, attr) {
    attr = attr || 'name';
    let el = document.head.querySelector(`meta[${attr}="${CSS.escape(name)}"]`);
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

    if (document.title !== title) {
      document.title = title;
    }
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
