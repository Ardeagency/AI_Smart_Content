-- Migration: RPC para cobrar créditos cuando un video se guarda exitosamente (página Video).
-- Ejecutar en Supabase SQL Editor después de revisar.

-- RPC: Deducción de créditos por generación de video (Kling). Registra en credit_usage.
-- Retorna success, new_available; si no hay créditos suficientes no modifica y retorna success=false.
CREATE OR REPLACE FUNCTION public.deduct_credits_for_video(
  p_organization_id uuid,
  p_user_id uuid,
  p_amount integer DEFAULT 25
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_new_available integer;
  v_current integer;
BEGIN
  IF p_amount IS NULL OR p_amount < 1 THEN
    RETURN jsonb_build_object('success', false, 'error_message', 'invalid_amount');
  END IF;

  -- Solo permitir si el llamador es el usuario indicado y pertenece a la organización
  IF auth.uid() IS DISTINCT FROM p_user_id THEN
    RETURN jsonb_build_object('success', false, 'error_message', 'forbidden');
  END IF;
  IF NOT (public.is_org_member(p_organization_id) OR (SELECT owner_user_id FROM public.organizations WHERE id = p_organization_id) = auth.uid()) THEN
    RETURN jsonb_build_object('success', false, 'error_message', 'forbidden');
  END IF;

  -- Descontar solo si hay saldo suficiente
  UPDATE public.organization_credits
  SET
    credits_available = credits_available - p_amount,
    updated_at = now()
  WHERE organization_id = p_organization_id
    AND credits_available >= p_amount
  RETURNING credits_available INTO v_new_available;

  IF NOT FOUND THEN
    SELECT credits_available INTO v_current
    FROM public.organization_credits
    WHERE organization_id = p_organization_id;
    RETURN jsonb_build_object(
      'success', false,
      'error_message', 'insufficient_credits',
      'credits_available', COALESCE(v_current, 0)
    );
  END IF;

  -- Registrar uso en credit_usage
  INSERT INTO public.credit_usage (user_id, organization_id, credits_used, operation_type, description)
  VALUES (p_user_id, p_organization_id, p_amount, 'video', 'Generación de video Kling');

  RETURN jsonb_build_object(
    'success', true,
    'new_available', v_new_available
  );
END;
$$;

COMMENT ON FUNCTION public.deduct_credits_for_video(uuid, uuid, integer) IS 'Cobra créditos cuando un video se guarda exitosamente en la página Video. Por defecto 25 créditos.';

GRANT EXECUTE ON FUNCTION public.deduct_credits_for_video(uuid, uuid, integer) TO authenticated;
