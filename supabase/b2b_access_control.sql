-- ============================================================================
-- SYNCRA ERP - MIGRACIÓN B2B CLOSED BETA (INVITE-ONLY & AUTHORIZED OWNERS)
-- Ejecuta este script en el SQL Editor de tu proyecto en Supabase
-- ============================================================================

-- 1. Añadir flag de Super Admin a la tabla profiles (si no existe)
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS is_super_admin BOOLEAN DEFAULT false;

-- 2. Tabla de Clientes Autorizados (Licencias Comerciales para crear Tenant)
CREATE TABLE IF NOT EXISTS public.authorized_owners (
  email TEXT PRIMARY KEY,
  company_notes TEXT,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.authorized_owners ENABLE ROW LEVEL SECURITY;

-- Política: un usuario autenticado solo puede consultar si su propio email está en la lista
DROP POLICY IF EXISTS "Users can check their own authorization" ON public.authorized_owners;
CREATE POLICY "Users can check their own authorization"
  ON public.authorized_owners
  FOR SELECT
  TO authenticated
  USING (lower(email) = lower(auth.jwt() ->> 'email'));

-- 3. Blindar el RPC create_tenant_and_assign_user con validación B2B estricta
CREATE OR REPLACE FUNCTION public.create_tenant_and_assign_user(
  p_name TEXT,
  p_slug TEXT,
  p_primary_color TEXT DEFAULT '#2563eb',
  p_logo_url TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_user_email TEXT;
  v_is_super_admin BOOLEAN;
  v_is_authorized BOOLEAN;
  v_new_tenant_id UUID;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'No autenticado';
  END IF;

  SELECT lower(email) INTO v_user_email FROM auth.users WHERE id = v_user_id;
  SELECT COALESCE(is_super_admin, false) INTO v_is_super_admin FROM public.profiles WHERE id = v_user_id;
  SELECT EXISTS(
    SELECT 1 FROM public.authorized_owners
    WHERE lower(email) = v_user_email AND used_at IS NULL
  ) INTO v_is_authorized;

  -- Bloqueo en capa de Base de Datos
  IF NOT v_is_super_admin AND NOT v_is_authorized THEN
    RAISE EXCEPTION 'Acceso denegado: Tu cuenta no cuenta con licencia activa para registrar una nueva empresa en Syncra ERP.';
  END IF;

  -- Crear empresa
  INSERT INTO public.tenants (name, slug, primary_color, logo_url)
  VALUES (p_name, p_slug, p_primary_color, p_logo_url)
  RETURNING id INTO v_new_tenant_id;

  -- Actualizar perfil como admin del nuevo tenant
  UPDATE public.profiles
  SET tenant_id = v_new_tenant_id,
      role = 'admin'
  WHERE id = v_user_id;

  -- Registrar membresía en tenant_members
  INSERT INTO public.tenant_members (tenant_id, user_id, role)
  VALUES (v_new_tenant_id, v_user_id, 'admin')
  ON CONFLICT (tenant_id, user_id) DO UPDATE SET role = 'admin';

  -- Marcar licencia de authorized_owners como consumida (si no es super_admin)
  IF v_is_authorized THEN
    UPDATE public.authorized_owners
    SET used_at = now()
    WHERE lower(email) = v_user_email;
  END IF;

  RETURN v_new_tenant_id;
END;
$$;

-- ============================================================================
-- 4. CONFIGURACIÓN INICIAL DE TU CUENTA (REEMPLAZA CON TU CORREO)
-- ============================================================================
-- Descomenta y ejecuta con tu correo para darte permisos de Super Admin:
-- UPDATE public.profiles
-- SET is_super_admin = true
-- WHERE id = (SELECT id FROM auth.users WHERE lower(email) = 'tu-correo@dominio.com');
--
-- Para autorizar a un nuevo cliente que compró el ERP antes de que se registre:
-- INSERT INTO public.authorized_owners (email, company_notes)
-- VALUES ('cliente@empresa.com', 'Plan Beta Comercial');

