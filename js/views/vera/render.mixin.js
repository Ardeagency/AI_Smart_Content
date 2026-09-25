/**
 * VeraView · Sistema de render de Vera (bloques, CLARIFY/PILLS, Mermaid, Prism, ECharts).
 * L7 fase B (24/09): métodos movidos TAL CUAL desde js/views/VeraView.js a un mixin
 * sobre el prototipo. Usan los helpers de js/views/vera/graficos.js (scripts clásicos:
 * mismo ámbito global). Se carga DESPUÉS de VeraView.js (ver app.js · veraLoader).
 */
(function () {
  'use strict';
  if (typeof window.VeraView !== 'function') return;

  Object.assign(window.VeraView.prototype, {
    // ── VERA RENDER SYSTEM ─────────────────────────────────────────────────
    // Protocolo de bloques interactivos + marked + DOMPurify.
    // Bloques propios:   [CLARIFY] [PILLS] [STEPS] [METRICS] [ACTIONS]
    // Bloques legacy:    ```chart  ```buttons  ```mermaid

    async _loadMarkdownLibs() {
      if (window.__mdLibsLoaded) return;
      if (VeraView.__mdLibsLoading) return VeraView.__mdLibsLoading;
      VeraView.__mdLibsLoading = (async () => {
        await Promise.all([
          new Promise((res, rej) => {
            if (window.marked) return res();
            const s = document.createElement('script');
            s.src = 'https://cdn.jsdelivr.net/npm/marked@12/marked.min.js';
            s.onload = res; s.onerror = rej;
            document.head.appendChild(s);
          }),
          new Promise((res, rej) => {
            if (window.DOMPurify) return res();
            const s = document.createElement('script');
            s.src = 'https://cdn.jsdelivr.net/npm/dompurify@3/dist/purify.min.js';
            s.onload = res; s.onerror = rej;
            document.head.appendChild(s);
          })
        ]);
        if (window.marked?.setOptions) {
          window.marked.setOptions({ breaks: true, gfm: true });
        }
        window.__mdLibsLoaded = true;
      })();
      return VeraView.__mdLibsLoading;
    },

    _parseInteractiveBlocks(text) {
      const blocks = [];
      let processed = String(text || '');

      // [CLARIFY]
      processed = processed.replace(/\[CLARIFY\]([\s\S]*?)\[\/CLARIFY\]/g, (_, content) => {
        const id = `vb_${blocks.length}`;
        const lines = content.trim().split('\n').filter(Boolean);
        let question = '';
        let mode = 'single'; // single | multi | rank
        const cards = [];
        lines.forEach(line => {
          if (line.startsWith('PREGUNTA:')) question = line.replace('PREGUNTA:', '').trim();
          else if (line.startsWith('TIPO:') || line.startsWith('TYPE:')) {
            const v = line.replace(/^(TIPO:|TYPE:)/, '').trim().toLowerCase();
            if (v.startsWith('multi')) mode = 'multi';
            else if (v.startsWith('rank') || v.startsWith('orden') || v.startsWith('prior')) mode = 'rank';
            else mode = 'single';
          }
          else if (line.startsWith('- CARD |')) {
            const parts = line.replace('- CARD |', '').split('|').map(s => s.trim());
            cards.push({ icon: parts[0], title: parts[1], desc: parts[2] || '' });
          }
        });
        blocks.push({ id, type: 'clarify', question, mode, cards });
        return `\n\n{{${id}}}\n\n`;
      });

      // [PILLS]
      processed = processed.replace(/\[PILLS\]([\s\S]*?)\[\/PILLS\]/g, (_, content) => {
        const id = `vb_${blocks.length}`;
        const lines = content.trim().split('\n').filter(Boolean);
        let label = '';
        const options = [];
        lines.forEach(line => {
          if (line.startsWith('LABEL:')) label = line.replace('LABEL:', '').trim();
          else if (line.startsWith('- ')) options.push(line.replace(/^- /, '').trim());
        });
        blocks.push({ id, type: 'pills', label, options });
        return `\n\n{{${id}}}\n\n`;
      });

      // [STEPS]
      processed = processed.replace(/\[STEPS\]([\s\S]*?)\[\/STEPS\]/g, (_, content) => {
        const id = `vb_${blocks.length}`;
        const steps = content.trim().split('\n')
          .filter(l => /^\d+\./.test(l))
          .map(l => l.replace(/^\d+\.\s*/, '').trim());
        blocks.push({ id, type: 'steps', steps });
        return `\n\n{{${id}}}\n\n`;
      });

      // [METRICS]
      processed = processed.replace(/\[METRICS\]([\s\S]*?)\[\/METRICS\]/g, (_, content) => {
        const id = `vb_${blocks.length}`;
        const metrics = content.trim().split('\n')
          .filter(l => l.startsWith('- '))
          .map(l => {
            const parts = l.replace(/^- /, '').split('|').map(s => s.trim());
            return { label: parts[0], value: parts[1], sub: parts[2] || '' };
          });
        blocks.push({ id, type: 'metrics', metrics });
        return `\n\n{{${id}}}\n\n`;
      });

      // [ACTIONS]
      processed = processed.replace(/\[ACTIONS\]([\s\S]*?)\[\/ACTIONS\]/g, (_, content) => {
        const id = `vb_${blocks.length}`;
        const actions = content.trim().split('\n')
          .filter(l => l.startsWith('- '))
          .map(l => l.replace(/^- /, '').trim());
        blocks.push({ id, type: 'actions', actions });
        return `\n\n{{${id}}}\n\n`;
      });

      // APPROVE_ACTION:KEY (gate de escritura) -> boton de aprobacion en vez de
      // un checkbox markdown crudo. El click persiste el TASK_EVENT de aprobacion.
      processed = processed.replace(/^[ \t]*[-*]\s*\[ \]\s*APPROVE_ACTION:([A-Z0-9_:-]+)\s*$/gm, (_, key) => {
        const id = `vb_${blocks.length}`;
        blocks.push({ id, type: 'approve', key });
        return `\n\n{{${id}}}\n\n`;
      });

      // [CONFIRM] — tarea costosa, requiere aprobacion del usuario antes de ejecutar
      processed = processed.replace(/\[CONFIRM\]([\s\S]*?)\[\/CONFIRM\]/g, (_, content) => {
        const id = `vb_${blocks.length}`;
        let usdRange = '';
        let minutesRange = '';
        const reasons = [];
        content.trim().split('\n').forEach((line) => {
          const l = line.trim();
          if (l.startsWith('ESTIMATE_USD:'))      usdRange = l.replace('ESTIMATE_USD:', '').trim();
          else if (l.startsWith('ESTIMATE_MINUTES:')) minutesRange = l.replace('ESTIMATE_MINUTES:', '').trim();
          else if (l.startsWith('REASON:'))       reasons.push(l.replace('REASON:', '').trim());
        });
        blocks.push({ id, type: 'confirm', usdRange, minutesRange, reasons });
        return `\n\n{{${id}}}\n\n`;
      });

      // Agrupa varios [CLARIFY] del mismo mensaje en un solo carrusel (paginas
      // "1 de N"). El primero se vuelve contenedor con .pages; los demas se vacian.
      const clarifyIdx = blocks.reduce((acc, b, i) => (b.type === 'clarify' ? (acc.push(i), acc) : acc), []);
      if (clarifyIdx.length > 1) {
        const first = clarifyIdx[0];
        blocks[first].pages = clarifyIdx.map((i) => ({ question: blocks[i].question, cards: blocks[i].cards, mode: blocks[i].mode || 'single' }));
        clarifyIdx.slice(1).forEach((i) => {
          const id = blocks[i].id;
          blocks[i].type = 'skip';
          processed = processed.replace(new RegExp(`\\{\\{${id}\\}\\}`, 'g'), '');
        });
      }

      return { processed, blocks };
    },

    /* ── Input-area options (CLARIFY / PILLS) ─────────────────
       Cuando VERA emite [CLARIFY] o [PILLS], las opciones aparecen reemplazando
       temporalmente el textarea en el composer. Al seleccionar una, se envia el
       title como mensaje del usuario y vuelve el textarea. */
    _showInputOptions(question, options) {
      const wrap = document.getElementById('veraInputWrap');
      const overlay = document.getElementById('chatInputOverlay');
      if (!overlay) return;

      // Quita opciones anteriores si las hay (multiples CLARIFY en cola)
      document.getElementById('vera-input-options')?.remove();

      // Oculta el textarea
      if (wrap) wrap.style.display = 'none';

      const esc = (s) => String(s ?? '')
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
      const escAttr = (s) => String(s ?? '').replace(/'/g, "\\'").replace(/"/g, '&quot;');

      const cardsHtml = (options || []).map((opt) => `
        <div class="vera-input-option-card"
             onclick="window._veraSelectOption && window._veraSelectOption('${escAttr(opt.title)}')">
          ${opt.icon ? `<span class="vera-option-icon">${esc(opt.icon)}</span>` : '<span class="vera-option-icon"></span>'}
          <div class="vera-option-body">
            <span class="vera-option-title">${esc(opt.title)}</span>
            ${opt.desc ? `<span class="vera-option-desc">${esc(opt.desc)}</span>` : ''}
          </div>
        </div>`).join('');

      const el = document.createElement('div');
      el.id = 'vera-input-options';
      el.className = 'vera-input-options';
      window.Estado.pintar(el, `
        ${question ? `<div class="vera-input-options-label">${esc(question)}</div>` : ''}
        <div class="vera-input-options-cards">${cardsHtml}</div>`);

      overlay.prepend(el);
    },

    _hideInputOptions() {
      document.getElementById('vera-input-options')?.remove();
      const wrap = document.getElementById('veraInputWrap');
      if (wrap) wrap.style.display = '';
    },

    _renderInteractiveBlock(block) {
      const esc = escapeHtml;
      switch (block.type) {
        case 'clarify': {
          // Widget anclado al composer (estilo Claude). Soporta 3 modos por pagina:
          //  - single: click envia de inmediato (data-vera-send).
          //  - multi : checkboxes; "Confirmar" envia la seleccion unida por comas.
          //  - rank  : reordenar arrastrando; "Confirmar" envia el orden con " > ".
          // El composer sigue libre para texto propio.
          const attr = (s) => esc(s).replace(/"/g, '&quot;');
          const pages = (block.pages && block.pages.length)
            ? block.pages
            : [{ question: block.question, cards: block.cards, mode: block.mode || 'single' }];
          const multiPage = pages.length > 1;

          const renderOpt = (c, i, mode) => {
            const val = attr(c.title);
            const body = `${c.icon ? `<span class="vera-opt-icon">${esc(c.icon)}</span>` : ''}
              <span class="vera-opt-body">
                <span class="vera-opt-title">${esc(c.title)}</span>
                ${c.desc ? `<span class="vera-opt-desc">${esc(c.desc)}</span>` : ''}
              </span>`;
            if (mode === 'multi') {
              return `<button type="button" class="vera-opt vera-opt--check" data-vera-value="${val}" aria-pressed="false">
                <span class="vera-opt-check"><i class="aisc-ico aisc-ico--check"></i></span>${body}
              </button>`;
            }
            if (mode === 'rank') {
              return `<div class="vera-opt vera-opt--rank" draggable="true" data-vera-value="${val}">
                <span class="vera-opt-num vera-opt-rank-num">${i + 1}</span>${body}
                <span class="vera-opt-grip" aria-hidden="true"><i class="aisc-ico aisc-ico--menu"></i></span>
              </div>`;
            }
            return `<button type="button" class="vera-opt" role="option" data-vera-send="${val}" data-idx="${i}">
              <span class="vera-opt-num">${i + 1}</span>${body}
              <span class="vera-opt-arrow"><i class="aisc-ico aisc-ico--arrow-right"></i></span>
            </button>`;
          };

          const pagesHtml = pages.map((pg, pi) => {
            const mode = pg.mode || 'single';
            const opts = (pg.cards || []).map((c, i) => renderOpt(c, i, mode)).join('');
            return `<div class="vera-clarify-page" data-page="${pi}" data-mode="${mode}" data-q="${attr(pg.question || '')}"${pi === 0 ? '' : ' hidden'}>
              <div class="vera-opt-list">${opts}</div>
            </div>`;
          }).join('');

          const firstQ = pages[0]?.question || '';
          return `<div class="vera-interactive vera-clarify" data-pages="${pages.length}" data-page="0">
            <div class="vera-clarify-head">
              <p class="vera-clarify-q">${esc(firstQ)}</p>
              <div class="vera-clarify-tools">
                ${multiPage ? `<div class="vera-clarify-pager">
                  <button type="button" class="vera-clarify-prev" aria-label="${__('Anterior')}"><i class="aisc-ico aisc-ico--chevron-left"></i></button>
                  <span class="vera-clarify-count">${__('{n} de {total}', { n: 1, total: pages.length })}</span>
                  <button type="button" class="vera-clarify-next" aria-label="${__('Siguiente')}"><i class="aisc-ico aisc-ico--chevron-right"></i></button>
                </div>` : ''}
                <button type="button" class="vera-clarify-close" aria-label="${__('Cerrar')}"><i class="aisc-ico aisc-ico--close"></i></button>
              </div>
            </div>
            <div class="vera-clarify-pages">${pagesHtml}</div>
            <div class="vera-clarify-more">
              <button type="button" class="vera-clarify-morebtn" data-vera-more>
                <span class="vera-opt-num vera-opt-num--pencil"><i class="aisc-ico aisc-ico--edit"></i></span>
                <span class="vera-clarify-more-text">${__('Algo más')}</span>
              </button>
              <div class="vera-clarify-actions">
                <button type="button" class="vera-clarify-skip" data-vera-skip>${__('Omitir')}</button>
                <button type="button" class="vera-clarify-confirm" data-vera-confirm hidden disabled>${__('Confirmar')}</button>
              </div>
            </div>
          </div>`;
        }
        case 'skip': return '';
        case 'pills': {
          const attr = (s) => esc(s).replace(/"/g, '&quot;');
          const pillsHtml = block.options.map(o => `
            <button type="button" class="vera-chip" data-vera-send="${attr(o)}">${esc(o)}</button>`).join('');
          return `<div class="vera-interactive">
            ${block.label ? `<p class="vera-interactive-q">${esc(block.label)}</p>` : ''}
            <div class="vera-chip-row">${pillsHtml}</div>
          </div>`;
        }
        case 'steps': {
          const stepsHtml = block.steps.map((s, i) => `
            <div class="vera-step-item">
              <span class="vera-step-num">${i + 1}</span>
              <span class="vera-step-text">${esc(s)}</span>
            </div>`).join('');
          return `<div class="vera-steps-block">${stepsHtml}</div>`;
        }
        case 'metrics': {
          const metricsHtml = block.metrics.map(m => `
            <div class="vera-metric-card">
              <span class="vera-metric-label">${esc(m.label)}</span>
              <span class="vera-metric-value">${esc(m.value)}</span>
              ${m.sub ? `<span class="vera-metric-sub">${esc(m.sub)}</span>` : ''}
            </div>`).join('');
          return `<div class="vera-metrics-grid">${metricsHtml}</div>`;
        }
        case 'actions': {
          // Las acciones son SEGUIMIENTOS CONVERSACIONALES: al click se envian como
          // mensaje del usuario a Vera (no navegan). Escapamos para atributo HTML
          // (las comillas en el texto rompian el onclick -> click muerto).
          const actionsHtml = block.actions.map(a => {
            const safe = String(a ?? '').replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/"/g, '&quot;');
            return `
            <button class="vera-action-pill" title="${__('Click para preguntarle esto a Vera')}" onclick="window._veraSendAction && window._veraSendAction('${safe}')">${esc(a)}</button>`;
          }).join('');
          return `<div class="vera-actions-row">${actionsHtml}</div>`;
        }
        case 'approve': {
          // Gate de escritura: boton de aprobacion (en vez del checkbox crudo).
          const aMsgId = block._msgId || '';
          const aKey = esc(block.key || '');
          return `<div class="vera-actions-row"><button class="vera-action-pill vera-approve-pill" title="${__('Aprobar y ejecutar esta acción')}" onclick="window._veraApproveAction && window._veraApproveAction('${aKey}', ${JSON.stringify(aMsgId)}, this)">${__('✓ Aprobar y ejecutar')}</button></div>`;
        }
        case 'confirm': {
          const msgId = block._msgId || '';
          const reasonsHtml = (block.reasons || []).map(r => `<li>${esc(r)}</li>`).join('');
          const usd = esc(block.usdRange || '?');
          const mins = esc(block.minutesRange || '?');
          const handler = (action) => `window._veraConfirmAction && window._veraConfirmAction(${JSON.stringify(msgId)}, ${JSON.stringify(action)}, this)`;
          return `<div class="vera-confirm-block" data-msg-id="${esc(msgId)}">
            <div class="vera-confirm-header">
              <span class="vera-confirm-icon">⚠</span>
              <span class="vera-confirm-title">${__('Tarea de alto costo detectada')}</span>
            </div>
            <div class="vera-confirm-estimate">
              <strong>$${usd} USD</strong>
              <span class="vera-confirm-sep">·</span>
              <span class="vera-confirm-minutes">${__('{mins} min', { mins })}</span>
            </div>
            ${reasonsHtml ? `<ul class="vera-confirm-reasons">${reasonsHtml}</ul>` : ''}
            <div class="vera-confirm-actions">
              <button class="vera-confirm-btn vera-confirm-btn-primary" onclick="${handler('authorize')}">${__('Autorizar')}</button>
              <button class="vera-confirm-btn" onclick="${handler('simplify')}">${__('Simplificar')}</button>
              <button class="vera-confirm-btn vera-confirm-btn-cancel" onclick="${handler('cancel')}">${__('Cancelar')}</button>
            </div>
          </div>`;
        }
        default: return '';
      }
    },

    async renderMarkdown(rawText, msgId = '') {
      await this._loadMarkdownLibs();

      // 1. Extrae bloques interactivos propios antes de pasar a marked
      const { processed, blocks } = this._parseInteractiveBlocks(rawText);
      // Inyecta msgId a los bloques que lo necesiten (e.g. CONFIRM lo usa para
      // localizar la metadata original del ai_message al accionar).
      blocks.forEach((b) => { if (msgId) b._msgId = msgId; });

      // 2. Extrae bloques ```html y ```artifact ANTES de todo. Estos NO pasan por
      //    DOMPurify — se inyectan crudos en un iframe sandbox null-origin
      //    (sandbox="allow-scripts allow-forms" SIN allow-same-origin ni allow-modals
      //    → el iframe no puede tocar localStorage/cookies del parent).
      // Placeholders en formato {{...}} (NO __x__): el doble guion bajo lo
      // interpreta marked como **bold** y rompe la restauracion (dejaba "legacy_N"
      // en negrita en vez del chart). Las llaves no son sintaxis markdown.
      const htmlBlocks = [];
      let safeText = processed.replace(/```(html|artifact)\n?([\s\S]*?)```/g, (_, type, code) => {
        const id = `{{hb_${htmlBlocks.length}}}`;
        htmlBlocks.push({ id, type: type.toLowerCase(), code: code.trim() });
        return `\n\n${id}\n\n`;
      });

      // 3. Protege bloques legacy (chart/buttons/mermaid) para que marked no los toque
      const legacyPlaceholders = [];
      safeText = safeText.replace(/```(chart|vera-chart|viz|buttons|quickreplies|quick-replies|actions|mermaid)([\s\S]*?)```/g, (match, lang, content) => {
        const pid = `{{legacy_${legacyPlaceholders.length}}}`;
        legacyPlaceholders.push({ pid, lang: lang.toLowerCase(), content: content.replace(/^\n/, '') });
        return `\n\n${pid}\n\n`;
      });

      // 4. marked convierte markdown estándar
      let html = window.marked.parse(safeText);

      // 5. DOMPurify sanitiza el markdown (NO los bloques html/artifact, que
      //    fueron sacados antes y se reinyectan crudos como srcdoc del iframe).
      html = window.DOMPurify.sanitize(html, {
        ADD_TAGS: ['pre', 'code', 'table', 'thead', 'tbody', 'tr', 'th', 'td'],
        // OJO: NUNCA permitir 'onclick' aquí. Los botones interactivos de Vera
        // (pills/approve/confirm/artifact) se inyectan DESPUÉS de sanitizar
        // (pasos 6-8), así que permitir onclick solo habilitaría XSS vía
        // markdown generado por el modelo (prompt injection).
        ADD_ATTR: ['class', 'target', 'rel']
      });

      // 5b. marked emite <table> SIN clase; el estilo de la app vive en
      //     .gpt-md-table (+ wrap para scroll horizontal). Lo añadimos aquí. Las
      //     tablas de charts se inyectan después (paso 6) con su propio markup,
      //     así que este reemplazo solo toca tablas de markdown.
      html = html
        .replace(/<table>/g, '<div class="gpt-md-table-wrap"><table class="gpt-md-table">')
        .replace(/<\/table>/g, '</table></div>');

      // 6. Restaura bloques legacy con sus renders originales
      legacyPlaceholders.forEach(({ pid, lang, content }) => {
        let legacyHtml;
        if (['chart', 'vera-chart', 'viz'].includes(lang)) {
          legacyHtml = renderChartBlock(content);
        } else if (['buttons', 'quickreplies', 'quick-replies', 'actions'].includes(lang)) {
          legacyHtml = renderButtonsBlock(content);
        } else if (lang === 'mermaid') {
          // _processChatRichContent() busca .gpt-md-mermaid[data-mermaid] y lo
          // renderiza a SVG con mermaid.js (lee el atributo, no el innerHTML).
          // El <pre> interno es fallback: si mermaid falla, queda el codigo a la
          // vista; si renderiza, mermaid sobreescribe el innerHTML con el SVG.
          const trimmed = String(content || '').trim();
          const safe = trimmed
            .replace(/&/g, '&amp;').replace(/"/g, '&quot;')
            .replace(/</g, '&lt;').replace(/>/g, '&gt;');
          legacyHtml = `<div class="gpt-md-mermaid" data-mermaid="${safe}"><pre class="gpt-md-mermaid-fallback"><code>${escapeHtml(trimmed)}</code></pre></div>`;
        } else {
          legacyHtml = `<pre><code>${escapeHtml(content)}</code></pre>`;
        }
        // marked puede dejar el placeholder solo o envuelto en <p>. Cubrimos ambos.
        html = html.replace(`<p>${pid}</p>`, legacyHtml).split(pid).join(legacyHtml);
      });

      // 7. Restaura bloques html/artifact como iframes sandboxed null-origin.
      //    El bridge `vera_resize` postMessage lo escucha _initWidgetBridge().
      //    Tambien inyectamos `window.__veraAction(actionType, payload, reasoning)`
      //    para que widgets puedan invocar acciones lectura/escritura en la
      //    plataforma a traves del receiver de VeraView -> /api/widget-action.
      htmlBlocks.forEach(({ id, type, code }) => {
        const resizeScript = [
          '<script>',
          '(function(){',
          // Mide el CONTENIDO (body), no `documentElement.scrollHeight`, cuyo piso
          // es el viewport = el alto que el padre acaba de poner (eso realimentaba
          // el bucle). Manda tambien el viewport para que el padre distinga un
          // documento medible de uno atado a el (min-height:100vh). Una medida por
          // fotograma como maximo, y solo si cambio.
          'var __vRaf=0,__vPrev="";',
          'function __vMide(){',
            '__vRaf=0;',
            'var b=document.body,d=document.documentElement;',
            'var c=Math.max(b?b.scrollHeight:0,b?b.offsetHeight:0);',
            'var v=d?d.clientHeight:0;',
            'var k=c+"x"+v;',
            'if(k===__vPrev)return;',
            '__vPrev=k;',
            'window.parent.postMessage({type:"vera_resize",height:c,content:c,viewport:v},"*");',
          '}',
          // rAF SIN desligarlo de window: invocarlo suelto lanza "Illegal invocation".
          'function r(){if(!__vRaf)__vRaf=window.requestAnimationFrame?window.requestAnimationFrame(__vMide):setTimeout(__vMide,16);}',
          'window.addEventListener("load",r);',
          'try{new ResizeObserver(r).observe(document.body);}catch(e){/* sin ResizeObserver: altura fija */}',
          // ── Widget action bridge ───────────────────────────────────────
          'window.__veraActionCallbacks = {};',
          'window.__veraAction = function(actionType, payload, reasoning){',
            'return new Promise(function(resolve){',
              'var rid = Math.random().toString(36).slice(2) + Date.now().toString(36);',
              'window.__veraActionCallbacks[rid] = resolve;',
              'setTimeout(function(){if(window.__veraActionCallbacks[rid]){window.__veraActionCallbacks[rid]({ok:false,error:"timeout"});delete window.__veraActionCallbacks[rid];}}, 20000);',
              'window.parent.postMessage({type:"vera_action",requestId:rid,actionType:actionType,payload:payload||{},reasoning:reasoning||""}, "*");',
            '});',
          '};',
          'window.addEventListener("message", function(e){',
            'if(!e.data || e.data.type !== "vera_action_result") return;',
            'var cb = window.__veraActionCallbacks[e.data.requestId];',
            'if(cb){ cb({ok:e.data.ok,data:e.data.data,error:e.data.error}); delete window.__veraActionCallbacks[e.data.requestId]; }',
          '});',
          // ── Imprimir/PDF: el panel envia "vera_print" y el iframe imprime su
          //    propio documento (Guardar como PDF en el dialogo del navegador).
          'window.addEventListener("message", function(e){',
            'if(e && e.data && e.data.type === "vera_print"){ try{ window.focus(); window.print(); }catch(_){/* impresión bloqueada */} }',
          '});',
          '})();',
          '</script>'
        ].join('');

        const fullHtml = [
          '<!DOCTYPE html><html><head>',
          '<meta charset="UTF-8">',
          '<meta name="viewport" content="width=device-width,initial-scale=1">',
          // ── CSP: el sandbox null-origin impide LEER la sesión del padre, pero
          //    no impedía HABLAR hacia afuera. Este HTML lo escribe un LLM que lee
          //    webs y comentarios de terceros, y lleva datos de la marca dentro:
          //    sin esta línea, una instrucción inyectada podía cargar un script de
          //    cualquier CDN y sacar los datos por `fetch`. `connect-src 'none'`
          //    cierra fetch/XHR/WebSocket, y `script-src` sin host deja solo lo
          //    que va escrito aquí: el artifact tiene que ser autocontenido —el
          //    mismo criterio de Claude y de los widgets de OpenAI—.
          //    Las imágenes https SÍ se permiten (los artifacts muestran piezas y
          //    miniaturas reales); es el único canal de salida que queda abierto.
          '<meta http-equiv="Content-Security-Policy" content="' +
            "default-src 'none'; " +
            "script-src 'unsafe-inline' 'unsafe-eval'; " +
            "style-src 'unsafe-inline'; " +
            'img-src data: blob: https:; ' +
            'media-src data: blob: https:; ' +
            'font-src data: https:; ' +
            "connect-src 'none'; " +
            "form-action 'none'; " +
            "base-uri 'none'; " +
            "frame-src 'none'" +
          '">',
          '<style>',
          '*{box-sizing:border-box;margin:0;padding:0}',
          'body{font-family:system-ui,sans-serif;background:#0d0d0f;color:#f0eff5;padding:16px}',
          // Export PDF grado documento: A4 con margenes, colores fieles y cortes
          // de pagina limpios (no parte titulos/tablas/imagenes a la mitad).
          '@page{size:A4;margin:14mm}',
          '@media print{',
            'html,body{-webkit-print-color-adjust:exact;print-color-adjust:exact;background:#fff !important;padding:0 !important}',
            'h1,h2,h3,thead{break-after:avoid;page-break-after:avoid}',
            'img,table,figure,tr,li,.avoid-break{break-inside:avoid;page-break-inside:avoid}',
          '}',
          '</style>',
          '</head><body>',
          code,
          resizeScript,
          '</body></html>'
        ].join('');

        // Para srcdoc: escapar & primero, luego " (orden importa).
        const srcdoc = fullHtml
          .replace(/&/g, '&amp;')
          .replace(/"/g, '&quot;');

        const isArtifact = type === 'artifact';

        // ── ARTIFACT: en el chat va un RESUMEN, no el documento ────────────────
        //    Un artifact es una pieza de trabajo, no un mensaje: renderizarlo
        //    entero inline enterraba la conversación bajo él (y dejaba encima un
        //    botón para "abrir" algo que ya estabas viendo). Aquí se resume —
        //    título, primera línea y peso— y el documento completo vive en el
        //    panel, que es donde se puede leer, imprimir y descargar.
        //    El HTML viaja en `data-srcdoc` (mismo escapado que usaba el iframe),
        //    así que la tarjeta no monta ningún iframe hasta que la abres.
        if (isArtifact) {
          const titulo = this._tituloDeArtifact(code) || __('Documento de Vera');
          const resumen = this._resumenDeArtifact(code);
          const peso = this._humanBytes(fullHtml.length);
          const cardHtml =
            '<div class="vera-artifact-block vera-canvas-block vera-artifact-card" ' +
                'data-srcdoc="' + srcdoc + '" data-title="' + escapeHtml(titulo) + '">' +
              '<button type="button" class="vera-artifact-card-btn" ' +
                  'onclick="window._veraOpenArtifact && window._veraOpenArtifact(this)">' +
                '<span class="vera-artifact-card-icon"><i class="aisc-ico aisc-ico--document"></i></span>' +
                '<span class="vera-artifact-card-text">' +
                  '<span class="vera-artifact-card-title">' + escapeHtml(titulo) + '</span>' +
                  '<span class="vera-artifact-card-sub">' +
                    (resumen ? escapeHtml(resumen) + ' · ' : '') + __('Artifact') + ' · ' + escapeHtml(peso) +
                  '</span>' +
                '</span>' +
                '<span class="vera-artifact-card-cta">' +
                  '<i class="aisc-ico aisc-ico--expand"></i> <span>' + __('Abrir') + '</span>' +
                '</span>' +
              '</button>' +
            '</div>';
          html = html.replace(`<p>${id}</p>`, cardHtml).replace(id, cardHtml);
          return;
        }

        // ── VISTA (```html): sigue inline, porque son piezas pequeñas ──────────
        //    Con tope de alto (CSS): si el contenido lo supera, el marco hace
        //    scroll y el botón lleva al panel. Nada se renderiza "hasta abajo".
        const iframeHtml =
          '<div class="vera-html-block vera-canvas-block">' +
            '<div class="vera-artifact-bar">' +
              '<span>' + __('⬡ Vista · VERA') + '</span>' +
              '<button type="button" class="vera-artifact-open" onclick="window._veraOpenArtifact && window._veraOpenArtifact(this)">' +
                '<i class="aisc-ico aisc-ico--expand"></i> ' + __('Abrir en panel') +
              '</button>' +
            '</div>' +
            '<iframe class="vera-sandbox-frame" ' +
              'sandbox="allow-scripts allow-forms" ' +
              'srcdoc="' + srcdoc + '"></iframe>' +
          '</div>';

        // Marked puede envolver el placeholder solo o en <p>. Cubrimos ambos.
        html = html.replace(`<p>${id}</p>`, iframeHtml).replace(id, iframeHtml);
      });

      // 8. Inyecta bloques interactivos en sus placeholders (marked los envuelve en <p>)
      blocks.forEach(block => {
        const re = new RegExp(`(<p>)?\\{\\{${block.id}\\}\\}(<\\/p>)?`, 'g');
        html = html.replace(re, this._renderInteractiveBlock(block));
      });

      return html;
    },
    // ── FIN VERA RENDER SYSTEM ─────────────────────────────────────────────

    _msgHTML(m) {
      const id = escapeHtml(m.id || '');
      const isUser = m.role === 'user';
      const isError = m.role === 'error';

      if (isUser) {
        // Separa el bloque de datos de biblioteca del texto visible. En vivo,
        // m.libraryRefs trae las refs; al recargar se parsean del content.
        const parsed = this._parseLibraryContext(m.content);
        const refs = (m.libraryRefs && m.libraryRefs.length) ? m.libraryRefs : parsed.refs;
        const attHTML = this._renderUserAttachments(m.attachments) + this._renderLibraryRefs(refs);
        const bubble = parsed.text
          ? `<div class="gpt-msg-bubble">${escapeHtml(parsed.text).replace(/\n/g, '<br>')}</div>`
          : '';
        return `
          <div class="gpt-msg gpt-msg--user" data-message-id="${id}">
            ${attHTML}
            ${bubble}
          </div>`;
      }

      // El contenido del asistente llega ya renderizado vía _renderedContent.
      // Fallback: si por alguna razón no se pre-renderizó, mostramos el texto escapado
      // para no romper el layout (el contenido real aparecerá tras el async).
      const content = (typeof m._renderedContent === 'string' && m._renderedContent)
        ? m._renderedContent
        : `<p>${escapeHtml(m.content || '').replace(/\n/g, '<br>')}</p>`;

      return `
        <div class="gpt-msg gpt-msg--assistant${isError ? ' gpt-msg--error' : ''}" data-message-id="${id}">
          <div class="gpt-msg-avatar">
            <img class="gpt-msg-avatar-img" src="${VERA_AVATAR_SRC}" alt="Vera" loading="lazy" decoding="async" />
          </div>
          <div class="gpt-msg-content">${content}</div>
        </div>`;
    },

    async appendMessage(msg) {
      const list = document.getElementById('veraMessageList');
      const scroll = document.getElementById('veraMessagesWrap');
      if (!list) return;
      const welcome = list.querySelector('.gpt-welcome');
      if (welcome) welcome.remove();
      this._setWelcomeMode(false);

      // Se mide ANTES de insertar: después el contenido nuevo ya nos alejó del fondo.
      const seguiaAbajo = this._pegadoAlFondo(scroll);

      // Pre-render del markdown para mensajes de VERA (asistente/error).
      // Los mensajes del usuario se escapan dentro de _msgHTML (no markdown).
      let prepared = msg;
      if (msg.role === 'assistant' || msg.role === 'error' || msg.role === 'vera') {
        try {
          const html = await this.renderMarkdown(msg.content || '', msg.id || '');
          prepared = { ...msg, _renderedContent: html };
        } catch (e) {
          console.warn('VeraView.renderMarkdown falló, usando fallback escapado:', e?.message || e);
          prepared = { ...msg, _renderedContent: '' };
        }
      }

      list.insertAdjacentHTML('beforeend', this._msgHTML(prepared));
      // Respuesta real de Vera: el backend pudo crear/renombrar la sesión →
      // refresca el rail para reflejar título y orden por updated_at.
      if (msg.role === 'assistant') this._refreshHistorySoon();
      this._bindMediaHover();
      this._bindTaskEvents();
      this._bindQuickReplyButtons();
      this._bindInteractiveOptions();
      this._initClarifyWidgets();
      this._dockActiveClarify();
      this._processChatRichContent(list);
      // El mensaje propio del usuario SIEMPRE lo lleva al fondo (lo acaba de
      // escribir); el de Vera solo si estaba mirando el final.
      setTimeout(() => this._irAlFondo(scroll, seguiaAbajo || msg.role === 'user'), 20);

      // Handler global para action pills (sobrescribe en cada append, OK).
      if (typeof window !== 'undefined') {
        window._veraSendAction = (text) => this.sendMessage(text);
        window._veraOpenArtifact = (btnEl) => this._openArtifactPanel(btnEl);
        // Handler de [CONFIRM] — busca metadata.original_message en el ai_message
        // por id y re-envia segun la accion (authorize / simplify / cancel).
        window._veraConfirmAction = (msgId, action, btnEl) => {
          const msg = (this.aiState.messages || []).find((m) => m.id === msgId);
          const meta = msg?.metadata || {};
          const original = meta.original_message || '';
          const attachments = meta.original_attachments || [];
          const block = btnEl?.closest?.('.vera-confirm-block');
          const sellar = (texto, muerto) => {
            if (!block) return;
            if (muerto) block.classList.add('vera-confirm-block--dismissed');
            block.querySelectorAll('button').forEach((b) => { b.disabled = muerto; });
            let tag = block.querySelector('.vera-confirm-status');
            if (!tag) {
              tag = document.createElement('div');
              tag.className = 'vera-confirm-status';
              block.appendChild(tag);
            }
            tag.textContent = texto;
          };

          if (action === 'cancel') { sellar(__('✕ Cancelado'), true); return; }

          // El sello se pone DESPUES de saber que se puede actuar. Antes se
          // pintaba "✓ Autorizado" de entrada y, si faltaba el mensaje original,
          // el handler se rendia con un console.warn: el usuario veia autorizado
          // algo que jamas se ejecuto.
          if (!original) {
            console.warn('vera-confirm: original_message vacio en metadata, no se puede re-enviar');
            sellar(__('No se pudo autorizar: falta el mensaje original. Vuelve a pedírselo a Vera.'), false);
            window.showToast?.(__('No se pudo autorizar la tarea. Vuelve a pedírsela a Vera.'), { type: 'error' });
            return;
          }
          sellar(action === 'simplify' ? __('✓ Autorizado (versión simplificada)') : __('✓ Autorizado'), true);
          this.sendMessage(original, {
            confirmedHighCost: true,
            simplifyRequest: action === 'simplify',
            attachments,
          });
        };
      }
    },

    /* ── Post-render: Mermaid (diagramas) + Prism (syntax highlighting) ──
       Se llama después de inyectar HTML al DOM. Procesa solo elementos NO
       marcados aún con data-vera-processed para idempotencia (evita re-render
       en cada appendMessage). Falla suavemente: si Mermaid/Prism no cargan,
       queda el code block plano. */
    _processChatRichContent(scope) {
      if (!scope) return;

      // Mermaid: convertir <div class="gpt-md-mermaid" data-mermaid="..."> → SVG
      const mermaidNodes = scope.querySelectorAll('.gpt-md-mermaid:not([data-vera-processed])');
      if (mermaidNodes.length) {
        _cleanupMermaidOrphans();
        ensureMermaid().then((mermaid) => {
          if (!mermaid?.render) return;
          mermaidNodes.forEach(async (node, i) => {
            if (node.dataset.veraProcessed) return;
            node.dataset.veraProcessed = '1';
            const rawSrc = node.dataset.mermaid || '';
            if (!rawSrc) return;
            // Pre-procesar: detecta emojis/keywords y aplica colores semánticos.
            // Si el preproceso falla, caemos al source crudo (no romper render).
            let src;
            try {
              src = applyMermaidSemanticClasses(rawSrc) || rawSrc;
            } catch (e) {
              console.warn('Mermaid semantic preprocess failed:', e?.message || e);
              src = rawSrc;
            }
            // Validar sintaxis antes de render: evita que mermaid v10 deje un
            // div temporal huérfano en <body> con el texto "Syntax error in text".
            try {
              const ok = typeof mermaid.parse === 'function'
                ? await mermaid.parse(src, { suppressErrors: true })
                : true;
              if (ok === false) {
                console.warn('Mermaid parse failed; keeping <pre> fallback');
                return;
              }
            } catch (e) {
              console.warn('Mermaid parse error:', e?.message || e);
              _cleanupMermaidOrphans();
              return;
            }
            try {
              const id = `vera-mmd-${Date.now()}-${i}`;
              const { svg } = await mermaid.render(id, src);
              window.Estado.pintar(node, svg);
            } catch (e) {
              console.warn('Mermaid render error:', e?.message || e);
              _cleanupMermaidOrphans();
            }
          });
        }).catch((e) => console.warn('Mermaid load error:', e?.message || e));
      }

      // Prism: highlight de <pre><code class="language-XXX"> que aún no esté procesado
      const codeNodes = scope.querySelectorAll('pre > code[class*="language-"]:not([data-vera-processed])');
      if (codeNodes.length) {
        ensurePrism().then((Prism) => {
          if (!Prism?.highlightElement) return;
          codeNodes.forEach((node) => {
            if (node.dataset.veraProcessed) return;
            node.dataset.veraProcessed = '1';
            try { Prism.highlightElement(node); } catch (_) { /* lenguaje desconocido: queda sin resaltar */ }
          });
        }).catch((e) => console.warn('Prism load error:', e?.message || e));
      }

      // ECharts: inicializa cualquier <div data-echarts-spec="..."> que aún no esté
      // procesado. Decode base64 → spec → buildEChartsOption → init.
      const echartsNodes = scope.querySelectorAll('div[data-echarts-spec]:not([data-vera-processed])');
      if (echartsNodes.length) {
        ensureECharts().then((echarts) => {
          if (!echarts?.init) {
            console.warn('ECharts no se cargó; charts se mostrarán vacíos');
            return;
          }
          echartsNodes.forEach((node) => {
            if (node.dataset.veraProcessed) return;
            node.dataset.veraProcessed = '1';
            try {
              const encoded = node.dataset.echartsSpec || '';
              const specStr = decodeURIComponent(escape(atob(encoded)));
              const spec = JSON.parse(specStr);
              const built = buildEChartsOption(spec);
              if (!built) {
                // Tipo entró a la cola de ECharts pero buildEChartsOption decidió no soportarlo
                // → mostrar fallback de tabla en el mismo contenedor.
                window.Estado.pintar(node, renderChartAsDataTable(spec));
                node.style.height = 'auto';
                return;
              }
              const chart = echarts.init(node, null, { renderer: 'svg' });
              chart.setOption(built.option);
              // Auto-resize cuando el viewport cambia (el chat es responsive)
              const onResize = () => chart.resize();
              this.addEventListener(window, 'resize', onResize); // se suelta en destroy() aunque nadie llame a _veraChartDispose
              // Limpieza si el nodo se remueve
              node._veraChartDispose = () => {
                window.removeEventListener('resize', onResize);
                try { chart.dispose(); } catch (_) { /* ya estaba liberado */ }
              };
            } catch (e) {
              console.warn('ECharts init error:', e?.message || e);
              window.Estado.pintar(node, `<div class="gpt-viz--error gpt-viz--error-caja">${__('Error renderizando chart:')} ${escapeHtml(e?.message || 'unknown')}</div>`);
            }
          });
        }).catch((e) => console.warn('ECharts load error:', e?.message || e));
      }
    },
  });
})();
