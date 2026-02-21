-- Migración: likes y guardados en catálogo de flujos
-- - Triggers que mantienen content_flows.likes_count y saves_count
-- La tabla user_flow_likes está en schema.sql.

-- 1. Trigger: actualizar content_flows.likes_count al insertar/eliminar en user_flow_likes
CREATE OR REPLACE FUNCTION public.sync_flow_likes_count()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.content_flows
    SET likes_count = COALESCE(likes_count, 0) + 1
    WHERE id = NEW.flow_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.content_flows
    SET likes_count = GREATEST(COALESCE(likes_count, 0) - 1, 0)
    WHERE id = OLD.flow_id;
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS tr_sync_flow_likes_count ON public.user_flow_likes;
CREATE TRIGGER tr_sync_flow_likes_count
  AFTER INSERT OR DELETE ON public.user_flow_likes
  FOR EACH ROW EXECUTE PROCEDURE public.sync_flow_likes_count();

-- 3. Trigger: actualizar content_flows.saves_count al cambiar is_favorite en user_flow_favorites
CREATE OR REPLACE FUNCTION public.sync_flow_saves_count()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _flow_id uuid;
  _inc integer;
BEGIN
  IF TG_OP = 'INSERT' THEN
    _flow_id := NEW.flow_id;
    _inc := CASE WHEN NEW.is_favorite THEN 1 ELSE 0 END;
  ELSIF TG_OP = 'UPDATE' THEN
    _flow_id := NEW.flow_id;
    IF OLD.is_favorite = NEW.is_favorite THEN
      RETURN NEW;
    END IF;
    _inc := CASE WHEN NEW.is_favorite THEN 1 ELSE -1 END;
  ELSIF TG_OP = 'DELETE' THEN
    _flow_id := OLD.flow_id;
    _inc := CASE WHEN OLD.is_favorite THEN -1 ELSE 0 END;
  END IF;

  IF _inc != 0 THEN
    UPDATE public.content_flows
    SET saves_count = GREATEST(COALESCE(saves_count, 0) + _inc, 0)
    WHERE id = _flow_id;
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS tr_sync_flow_saves_count ON public.user_flow_favorites;
CREATE TRIGGER tr_sync_flow_saves_count
  AFTER INSERT OR UPDATE OF is_favorite OR DELETE ON public.user_flow_favorites
  FOR EACH ROW EXECUTE PROCEDURE public.sync_flow_saves_count();

-- Comentarios
COMMENT ON TABLE public.user_flow_likes IS 'Likes por usuario en flujos del catálogo; los triggers actualizan content_flows.likes_count';
