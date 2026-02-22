/**
 * Ejemplo de uso de FlowCard con datos mock (content_flows).
 * Incluye: catalog, myFlows, callbacks y estado de usuario.
 */
import React from 'react';
import { FlowCard } from './FlowCard';

const MOCK_FLOWS = [
  {
    id: 'a1b2c3d4-e5f6-7890-abcd-111111111111',
    name: 'Generador de Reels Virales',
    description: 'Crea reels optimizados para TikTok e Instagram con hooks potentes y CTAs que convierten.',
    flow_image_url: 'https://images.unsplash.com/photo-1611162617474-5b21e879e113?w=680&h=520&fit=crop',
    output_type: 'video',
    token_cost: 3,
    flow_category_type: 'manual',
    execution_mode: 'multi_step',
    execution_strategy: 'linear',
    status: 'published',
    created_at: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
    likes_count: 124,
    saves_count: 89,
    run_count: 512,
    version: '1.2.0',
    show_in_catalog: true,
    slug: 'reels-virales',
  },
  {
    id: 'b2c3d4e5-f6a7-8901-bcde-222222222222',
    name: 'Posts con IA para LinkedIn',
    description: 'Escribe posts profesionales que encajan con tu marca y generan engagement.',
    flow_image_url: null,
    output_type: 'text',
    token_cost: 1,
    flow_category_type: 'manual',
    execution_mode: 'single_step',
    execution_strategy: 'linear',
    status: 'published',
    created_at: new Date(Date.now() - 12 * 24 * 60 * 60 * 1000).toISOString(),
    likes_count: 0,
    saves_count: 0,
    run_count: 0,
    version: '1.0.0',
    show_in_catalog: true,
    slug: 'posts-linkedin',
  },
  {
    id: 'c3d4e5f6-a7b8-9012-cdef-333333333333',
    name: 'Thumbnails que hacen clic',
    description: 'Diseña miniaturas para YouTube con composición y texto que disparan el CTR.',
    flow_image_url: 'https://images.unsplash.com/photo-1611162616305-c69b3fa7fbe0?w=680&h=520&fit=crop',
    output_type: 'image',
    token_cost: 2,
    flow_category_type: 'manual',
    execution_mode: 'sequential',
    execution_strategy: 'conditional',
    status: 'draft',
    created_at: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
    likes_count: 45,
    saves_count: 32,
    run_count: 78,
    version: '2.0.0-beta',
    show_in_catalog: false,
    slug: 'thumbnails-youtube',
  },
];

const MOCK_USER_STATE = {
  isLoggedIn: true,
  likedFlowIds: ['a1b2c3d4-e5f6-7890-abcd-111111111111'],
  savedFlowIds: [],
  isOwner: (flowId) => flowId === 'c3d4e5f6-a7b8-9012-cdef-333333333333',
  isAdmin: false,
  onRequireLogin: () => console.log('Modal login'),
};

export function FlowCardExample() {
  const handleRun = (flowId) => console.log('Run flow', flowId);
  const handleLike = (flowId, active) => console.log('Like', flowId, active);
  const handleSave = (flowId, active) => console.log('Save', flowId, active);
  const handleOpenDetails = (flowId) => console.log('Open details', flowId);

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '24px', padding: '24px', background: 'var(--bg-primary)' }}>
      {MOCK_FLOWS.map((flow) => (
        <FlowCard
          key={flow.id}
          flow={flow}
          userState={{
            ...MOCK_USER_STATE,
            likedFlowIds: MOCK_USER_STATE.likedFlowIds,
            savedFlowIds: MOCK_USER_STATE.savedFlowIds,
            isOwner: MOCK_USER_STATE.isOwner(flow.id),
          }}
          variant={flow.status === 'draft' ? 'myFlows' : 'catalog'}
          onRun={handleRun}
          onLike={handleLike}
          onSave={handleSave}
          onOpenDetails={handleOpenDetails}
        />
      ))}
    </div>
  );
}

export default FlowCardExample;
