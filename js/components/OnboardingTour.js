/**
 * OnboardingTour — mini tutorial que se activa automáticamente la primera vez
 * que un usuario nuevo entra a su dashboard (tras crear su marca).
 *
 * Disparo: el flujo de creación de marca deja localStorage['asc:onboardingTour']='1'
 * y redirige al dashboard. DashboardView llama OnboardingTour.maybeStart() al
 * entrar; si el flag está, se muestra el tour una sola vez (limpia el flag).
 *
 * Es autocontenido: inyecta su propio CSS y un overlay centrado con tarjetas
 * (no se ancla a elementos concretos, así no se rompe si el layout cambia).
 */
(function () {
  const FLAG = 'asc:onboardingTour';
  const STYLE_ID = 'asc-onb-style';

  const STEPS = [
    { icon: '🎉', title: '¡Bienvenida a tu marca!', body: 'Este es tu panel principal. Desde aquí ves el estado de tu marca y todo lo que tu equipo de IA está haciendo por ti.' },
    { icon: '🧠', title: 'Vera, tu equipo de marketing', body: 'Vera ya está activa: investiga, propone contenido y vigila a tu competencia. La encuentras en el menú lateral para conversar con ella.' },
    { icon: '🎨', title: 'Crea contenido', body: 'En Studio y Producción generas piezas (imágenes, video y copy) con la identidad de tu marca ya cargada.' },
    { icon: '📊', title: 'Mide y mejora', body: 'En Dashboard y Monitoreo ves tu rendimiento y el sentimiento de tu audiencia para decidir mejor.' },
  ];

  function injectStyle() {
    if (document.getElementById(STYLE_ID)) return;
    const css = `
      .asc-onb-ov{position:fixed;inset:0;z-index:99999;display:flex;align-items:center;justify-content:center;
        background:rgba(8,8,12,.62);backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px);
        opacity:0;transition:opacity .25s ease;font-family:'Inter',system-ui,-apple-system,sans-serif;}
      .asc-onb-ov.is-in{opacity:1;}
      .asc-onb-card{width:min(440px,92vw);background:rgba(17,17,22,.96);border:1px solid rgba(255,255,255,.12);
        border-radius:18px;padding:28px 26px 22px;box-shadow:0 24px 70px rgba(0,0,0,.5);color:#f4f4f6;
        transform:translateY(8px) scale(.98);transition:transform .25s ease;text-align:center;}
      .asc-onb-ov.is-in .asc-onb-card{transform:none;}
      .asc-onb-emoji{font-size:40px;line-height:1;margin-bottom:14px;}
      .asc-onb-card h2{font-size:20px;font-weight:650;margin:0 0 8px;}
      .asc-onb-card p{font-size:14px;line-height:1.55;color:rgba(244,244,246,.62);margin:0 0 20px;}
      .asc-onb-dots{display:flex;gap:6px;justify-content:center;margin-bottom:18px;}
      .asc-onb-dot{width:7px;height:7px;border-radius:999px;background:rgba(255,255,255,.18);transition:background .2s,width .2s;}
      .asc-onb-dot.is-on{background:#f4f4f6;width:18px;}
      .asc-onb-actions{display:flex;align-items:center;justify-content:space-between;gap:12px;}
      .asc-onb-skip{background:none;border:none;color:rgba(244,244,246,.5);font-size:13px;cursor:pointer;padding:8px;}
      .asc-onb-skip:hover{color:#f4f4f6;}
      .asc-onb-next{background:rgba(255,255,255,.94);color:#0b0b0f;border:none;border-radius:9px;
        font-size:14px;font-weight:650;padding:10px 20px;cursor:pointer;transition:opacity .15s;}
      .asc-onb-next:hover{opacity:.88;}
    `;
    const s = document.createElement('style');
    s.id = STYLE_ID; s.textContent = css;
    document.head.appendChild(s);
  }

  function esc(t) {
    const d = document.createElement('div'); d.textContent = t == null ? '' : String(t); return d.innerHTML;
  }

  function start() {
    injectStyle();
    let i = 0;
    const ov = document.createElement('div');
    ov.className = 'asc-onb-ov';
    ov.setAttribute('role', 'dialog');
    ov.setAttribute('aria-modal', 'true');
    document.body.appendChild(ov);

    const close = () => {
      ov.classList.remove('is-in');
      setTimeout(() => ov.remove(), 250);
      document.removeEventListener('keydown', onKey);
    };
    const onKey = (e) => { if (e.key === 'Escape') close(); };
    document.addEventListener('keydown', onKey);

    const render = () => {
      const s = STEPS[i];
      const last = i === STEPS.length - 1;
      ov.innerHTML = `
        <div class="asc-onb-card">
          <div class="asc-onb-emoji" aria-hidden="true">${s.icon}</div>
          <h2>${esc(s.title)}</h2>
          <p>${esc(s.body)}</p>
          <div class="asc-onb-dots">${STEPS.map((_, k) => `<span class="asc-onb-dot ${k === i ? 'is-on' : ''}"></span>`).join('')}</div>
          <div class="asc-onb-actions">
            <button type="button" class="asc-onb-skip" data-onb="skip">${last ? '' : 'Saltar'}</button>
            <button type="button" class="asc-onb-next" data-onb="next">${last ? 'Empezar' : 'Siguiente'}</button>
          </div>
        </div>`;
      ov.querySelector('[data-onb="next"]').onclick = () => { if (last) close(); else { i++; render(); } };
      ov.querySelector('[data-onb="skip"]').onclick = close;
    };
    render();
    requestAnimationFrame(() => ov.classList.add('is-in'));
  }

  window.OnboardingTour = {
    /** Arranca el tour solo si el flag está presente. Lo limpia para no repetir. */
    maybeStart() {
      let flagged = false;
      try { flagged = localStorage.getItem(FLAG) === '1'; } catch (_) {}
      if (!flagged) return;
      try { localStorage.removeItem(FLAG); } catch (_) {}
      // Defer para que el dashboard ya esté pintado.
      setTimeout(start, 650);
    },
    /** Forzar el tour (debug/QA). */
    force() { setTimeout(start, 50); },
  };
})();
