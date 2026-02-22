/**
 * FlowCard - Referencia: card minimalista, imagen protagonista, zona inferior sólida.
 * Sin overlays sobre la imagen. Chips + título (dos niveles) + descripción en la zona inferior.
 * Acciones (Like, Save, Iniciar) en hover.
 */
import React, { useState, useCallback } from 'react';
import { getOutputTypeLabel, getExecutionModeLabel, getFlowCategoryTypeLabel } from './flowCardUtils';

export function FlowCard({
  flow,
  userState = {},
  onRun,
  onLike,
  onSave,
  onOpenDetails,
  className = '',
}) {
  const [liked, setLiked] = useState(!!userState.likedFlowIds?.includes(flow.id));
  const [saved, setSaved] = useState(!!userState.savedFlowIds?.includes(flow.id));

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
      onLike?.(flow.id, !prev);
      return !prev;
    });
  }, [flow.id, userState.isLoggedIn, userState.onRequireLogin, onLike]);

  const handleSave = useCallback((e) => {
    e.stopPropagation();
    if (!userState.isLoggedIn) {
      userState.onRequireLogin?.();
      return;
    }
    setSaved((prev) => {
      onSave?.(flow.id, !prev);
      return !prev;
    });
  }, [flow.id, userState.isLoggedIn, userState.onRequireLogin, onSave]);

  const handleKeyDown = useCallback((e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      if (e.target === e.currentTarget) handleCardClick(e);
    }
  }, [handleCardClick]);

  const tokenCost = flow.token_cost ?? 1;

  return (
    <article
      className={`fc ${className}`}
      data-flow-id={flow.id}
      role="button"
      tabIndex={0}
      onClick={handleCardClick}
      onKeyDown={handleKeyDown}
      aria-label={`Ver detalles de ${flow.name}`}
    >
      {/* Zona superior: solo imagen, full-bleed, sin overlays */}
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
      </div>

      {/* Zona inferior: fondo sólido (como referencia) */}
      <div className="fc__body">
        {chips.length > 0 && (
          <div className="fc__chips">
            {chips.map((label, i) => (
              <span key={i} className="fc__chip">{label}</span>
            ))}
          </div>
        )}
        <h3 className="fc__title">{flow.name}</h3>
        {flow.description && (
          <p className="fc__desc">{flow.description}</p>
        )}

        {/* Acciones: visibles en hover */}
        <div className="fc__actions" data-no-details>
          <span className="fc__token">{tokenCost} tokens</span>
          <button
            type="button"
            className={`fc__icon-btn fc__icon-btn--like ${liked ? 'is-active' : ''}`}
            onClick={handleLike}
            aria-label={liked ? 'Quitar me gusta' : 'Me gusta'}
            aria-pressed={liked}
          >
            <span aria-hidden>❤</span>
          </button>
          <button
            type="button"
            className={`fc__icon-btn fc__icon-btn--save ${saved ? 'is-active' : ''}`}
            onClick={handleSave}
            aria-label={saved ? 'Quitar de guardados' : 'Guardar'}
            aria-pressed={saved}
          >
            <span aria-hidden>🔖</span>
          </button>
          <button
            type="button"
            className="fc__cta"
            onClick={handleRun}
            aria-label={`Iniciar ${flow.name}`}
          >
            Iniciar
          </button>
        </div>
      </div>
    </article>
  );
}

export default FlowCard;
