/**
 * media-optimizer.js — variantes livianas para media.aismartcontent.io.
 *
 * Toda imagen del host de media que entre al DOM se sirve como transformacion
 * de Cloudflare (/cdn-cgi/image/...: resize + format=auto → WebP/AVIF) y todo
 * video gana preload="metadata" + poster generado (/cdn-cgi/media/mode=frame),
 * para que las galerias pinten rapido sin descargar masters completos.
 *
 * Las URLs canonicas (full-res) NO cambian: viven en la DB y en
 * data-full-src — las descargas y publicaciones siempre usan el original.
 * Si la transformacion responde error (p.ej. toggle de zona apagado), el
 * <img> vuelve solo al original: nunca se rompe la galeria.
 *
 * Kill-switch: window.AISC_MEDIA_OPTIMIZER = false antes de cargar este script.
 */
(function () {
    'use strict';
    if (window.AISC_MEDIA_OPTIMIZER === false) return;

    const HOST = 'https://media.aismartcontent.io/';
    const IMG_OPTS = 'width=1280,quality=82,format=auto,fit=scale-down';
    const POSTER_OPTS = 'mode=frame,time=1s,width=640,fit=scale-down';

    function isOriginal(u) {
        return typeof u === 'string' && u.startsWith(HOST) && !u.startsWith(HOST + 'cdn-cgi/');
    }
    function thumbUrl(u) { return HOST + 'cdn-cgi/image/' + IMG_OPTS + '/' + u.slice(HOST.length); }
    function posterUrl(u) { return HOST + 'cdn-cgi/media/' + POSTER_OPTS + '/' + u.slice(HOST.length); }

    function optimizeImg(el) {
        if (el.dataset.aiscOptOut === '1') return; // la transformacion fallo antes: dejar el original
        const src = el.getAttribute('src');
        if (!isOriginal(src)) return;
        el.dataset.fullSrc = src;
        el.addEventListener('error', function onErr() {
            el.removeEventListener('error', onErr);
            el.dataset.aiscOptOut = '1';
            if (el.dataset.fullSrc && el.src !== el.dataset.fullSrc) el.src = el.dataset.fullSrc;
        });
        el.setAttribute('src', thumbUrl(src));
        if (!el.hasAttribute('loading')) el.setAttribute('loading', 'lazy');
        if (!el.hasAttribute('decoding')) el.setAttribute('decoding', 'async');
    }

    function optimizeVideo(el) {
        if (!el.hasAttribute('preload')) el.setAttribute('preload', 'metadata');
        const src = el.getAttribute('src') ||
            (el.querySelector('source') && el.querySelector('source').getAttribute('src'));
        if (!el.getAttribute('poster') && isOriginal(src)) el.setAttribute('poster', posterUrl(src));
    }

    function scan(root) {
        if (root.nodeType !== 1 && root.nodeType !== 9) return;
        if (root.tagName === 'IMG') optimizeImg(root);
        else if (root.tagName === 'VIDEO') optimizeVideo(root);
        if (root.querySelectorAll) {
            root.querySelectorAll('img').forEach(optimizeImg);
            root.querySelectorAll('video').forEach(optimizeVideo);
        }
    }

    const observer = new MutationObserver((muts) => {
        for (const m of muts) {
            if (m.type === 'attributes' && m.target.tagName === 'IMG') {
                optimizeImg(m.target);
            } else if (m.addedNodes) {
                m.addedNodes.forEach(scan);
            }
        }
    });

    function start() {
        scan(document.body || document.documentElement);
        observer.observe(document.documentElement, {
            childList: true,
            subtree: true,
            attributes: true,
            attributeFilter: ['src']
        });
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
    else start();
})();
