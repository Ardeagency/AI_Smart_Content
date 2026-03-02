-- Eliminar flow_runs fantasma (sin output / producciones de texto fantasma)
-- Ejecutar en este orden por las FK: runs_outputs y runs_inputs referencian flow_runs(id)

-- 1) Borrar outputs asociados (si existen)
DELETE FROM public.runs_outputs
WHERE run_id IN (
  'baf447b8-fc56-498d-be72-da87173fd4de',
  '8a1c4bd4-78ce-43cf-87c6-9b54e8abcf10',
  '48558a0a-850b-4638-a0f3-51d7f9305c09',
  '528416a5-affb-4dd2-8e17-5f47ef247339',
  'db3b0f2f-1104-4ba1-a1d9-846a7b6b2a3c'
);

-- 2) Borrar inputs asociados (si existen)
DELETE FROM public.runs_inputs
WHERE run_id IN (
  'baf447b8-fc56-498d-be72-da87173fd4de',
  '8a1c4bd4-78ce-43cf-87c6-9b54e8abcf10',
  '48558a0a-850b-4638-a0f3-51d7f9305c09',
  '528416a5-affb-4dd2-8e17-5f47ef247339',
  'db3b0f2f-1104-4ba1-a1d9-846a7b6b2a3c'
);

-- 3) Borrar los flow_runs
DELETE FROM public.flow_runs
WHERE id IN (
  'baf447b8-fc56-498d-be72-da87173fd4de',
  '8a1c4bd4-78ce-43cf-87c6-9b54e8abcf10',
  '48558a0a-850b-4638-a0f3-51d7f9305c09',
  '528416a5-affb-4dd2-8e17-5f47ef247339',
  'db3b0f2f-1104-4ba1-a1d9-846a7b6b2a3c'
);
