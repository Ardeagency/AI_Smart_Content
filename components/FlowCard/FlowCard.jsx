/**
 * FlowCard - Card premium para catálogo de flujos (content_flows).
 * Foto-first, bordes redondeados grandes, overlay con gradiente, Like/Save + CTA Iniciar.
 * Variants: catalog | myFlows
 */
import React, { useState, useCallback } from 'react';
import { getFlowCardBadges, getOutputTypeLabel, getExecutionModeLabel, getFlowCategoryTypeLabel, isNewFlow } from './flowCardUtils';

export function FlowCard({
  flow,
  userState = {},
  variant = 'catalog',
  onRun,
  onLike,
  onSave,
  onOpenDetails,
  className = '',
}) {
  const [liked, setLiked] = useState(!!userState.likedFlowIds?.includes(flow.id));
  const [saved, setSaved] = useState(!!userState.savedFlowIds?.includes(flow.id));
  const [likesCount, setLikesCount] = useState(flow.likes_count ?? 0);
  const [savesCount, setSavesCount] = useState(flow.saves_count ?? 0);

  const resolvedUserState = {
    ...userState,
    isOwner: typeof userState.isOwner === 'function' ? userState.isOwner(flow.id) : userState.isOwner,
  };
  const badges = getFlowCardBadges(flow, resolvedUserState);
  const tokenCost = flow.token_cost ?? 1;
  const runCount = flow.run_count ?? 0;
  const hasMetrics = (flow.likes_count ?? 0) > 0 || (flow.saves_count ?? 0) > 0 || (flow.run_count ?? 0) > 0;
  const showNewLabel = !hasMetrics && isNewFlow(flow);

  const chips = [
    getOutputTypeLabel(flow.output_type),
    getExecutionModeLabel(flow.execution_mode),
    getFlowCategoryTypeLabel(flow.flow_category_type),
  ].filter(Boolean).slice(0, 3);

  const handleCardClick = useCallback((e) => {
    if (e.target.closest('[data-no-details]')) return;
    onOpenDetails?.(flow.id);
  }, [flow.id, onOpenDetails]);

  const handleRun = useCallback((e) => {
    e.stopPropagation();
    onRun?.(flow.id);
  }, [flow.id, onRun]);

  const handleLike = useCallback((e) => {
    e.stopPropagation();
    if (!userState.isLoggedIn) {
      userState.onRequireLogin?.();
      return;
    }
    setLiked((prev) => {
      const next = !prev;
      setLikesCount((c) => (next ? c + 1 : c - 1));
      onLike?.(flow.id, next);
      return next;
    });
  }, [flow.id, userState.isLoggedIn, userState.onRequireLogin, onLike]);

  const handleSave = useCallback((e) => {
    e.stopPropagation();
    if (!userState.isLoggedIn) {
      userState.onRequireLogin?.();
      return;
    }
    setSaved((prev) => {
      const next = !prev;
      setSavesCount((c) => (next ? c + 1 : c - 1));
      onSave?.(flow.id, next);
      return next;
    });
  }, [flow.id, userState.isLoggedIn, userState.onRequireLogin, onSave]);

  const handleKeyDown = useCallback((e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      if (e.target === e.currentTarget) handleCardClick(e);
    }
  }, [handleCardClick]);

  return (
    <article
      className={`fc ${variant === 'myFlows' ? 'fc--my-flows' : 'fc--catalog'} ${className}`}
      data-flow-id={flow.id}
      role="button"
      tabIndex={0}
      onClick={handleCardClick}
      onKeyDown={handleKeyDown}
      aria-label={`Ver detalles de ${flow.name}`}
    >
      {/* Zona superior: hero image */}
      <div className="fc__hero">
        <div className="fc__media">
          {flow.flow_image_url ? (
            <img
              src={flow.flow_image_url}
              alt=""
              className="fc__img"
              loading="lazy"
            />
          ) : (
            <div className="fc__placeholder" aria-hidden>
              <span className="fc__placeholder-icon">◇</span>
              <span className="fc__placeholder-name">{flow.name}</span>
            </div>
          )}
        </div>

        {/* Badges: esquina superior izquierda */}
        <div className="fc__badges">
          {badges.map((b) => (
            <span key={b.id} className={`fc__badge fc__badge--${b.id}`}>
              {b.text}
            </span>
          ))}
        </div>

        {/* Token cost: esquina superior derecha */}
        <div className="fc__token-pill" data-no-details>
          {tokenCost} tokens
        </div>
      </div>

      {/* Overlay inferior con gradiente */}
      <div className="fc__overlay">
        <div className="fc__content">
          <h3 className="fc__title">{flow.name}</h3>
          {flow.description && (
            <p className="fc__desc">{flow.description}</p>
          )}
          {chips.length > 0 && (
            <div className="fc__chips">
              {chips.map((label, i) => (
                <span key={i} className="fc__chip">{label}</span>
              ))}
            </div>
          )}

          {/* Social proof */}
          <div className="fc__stats">
            {hasMetrics && (
              <>
                <span className="fc__stat" aria-label={`${flow.likes_count ?? 0} me gusta`}>
                  <span className="fc__stat-icon" aria-hidden>❤</span>
                  {likesCount}
                </span>
                <span className="fc__stat" aria-label={`${flow.saves_count ?? 0} guardados`}>
                  <span className="fc__stat-icon" aria-hidden>🔖</span>
                  {savesCount}
                </span>
                <span className="fc__stat" aria-label={`${runCount} ejecuciones`}>
                  <span className="fc__stat-icon" aria-hidden>▶</span>
                  {runCount}
                </span>
              </>
            )}
            {showNewLabel && <span className="fc__stat fc__stat--new">Nuevo</span>}
          </div>

          {/* CTA row */}
          <div className="fc__cta-row" data-no-details>
            <span className="fc__cta-tokens">
              <span className="fc__cta-tokens-icon" aria-hidden>◇</span>
              {tokenCost} tokens
            </span>
            <button
              type="button"
              className="fc__cta-btn"
              onClick={handleRun}
              aria-label={`Iniciar flujo ${flow.name}`}
            >
              Iniciar
            </button>
          </div>

          {/* Like / Save: dentro del overlay, discretos */}
          <div className="fc__actions" data-no-details>
            <button
              type="button"
              className={`fc__action-btn fc__action-btn--like ${liked ? 'is-active' : ''}`}
              onClick={handleLike}
              aria-label={liked ? 'Quitar me gusta' : 'Me gusta'}
              aria-pressed={liked}
            >
              <span aria-hidden>❤</span>
            </button>
            <button
              type="button"
              className={`fc__action-btn fc__action-btn--save ${saved ? 'is-active' : ''}`}
              onClick={handleSave}
              aria-label={saved ? 'Quitar de guardados' : 'Guardar'}
              aria-pressed={saved}
            >
              <span aria-hidden>🔖</span>
            </button>
          </div>
        </div>
      </div>

      {/* Variant myFlows: status + version */}
      {variant === 'myFlows' && (
        <div className="fc__meta-tiny">
          <span className="fc__meta-status">{flow.status}</span>
          <span className="fc__meta-version">v{flow.version || '1.0.0'}</span>
        </div>
      )}
    </article>
  );
}

export default FlowCard;
