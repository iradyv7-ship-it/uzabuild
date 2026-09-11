ALTER TABLE public.proformas
  ADD COLUMN IF NOT EXISTS signed_by_name text,
  ADD COLUMN IF NOT EXISTS signed_by_title text,
  ADD COLUMN IF NOT EXISTS signed_at timestamptz;

CREATE TABLE IF NOT EXISTS public.admin_bootstrap_emails (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL UNIQUE,
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.admin_bootstrap_emails TO authenticated;
GRANT ALL ON public.admin_bootstrap_emails TO service_role;
ALTER TABLE public.admin_bootstrap_emails ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins manage the admin bootstrap list" ON public.admin_bootstrap_emails;
CREATE POLICY "Admins manage the admin bootstrap list"
  ON public.admin_bootstrap_emails FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin'))
  WITH CHECK (public.has_role(auth.uid(),'admin'));

INSERT INTO public.admin_bootstrap_emails (email, note)
VALUES ('uzasolutionsrda@gmail.com', 'UZA Solutions owner account')
ON CONFLICT (email) DO NOTHING;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO public.profiles (id, full_name, email)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name',''), NEW.email)
  ON CONFLICT (id) DO NOTHING;

  IF NEW.raw_user_meta_data->>'role' IS NOT NULL THEN
    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.id, (NEW.raw_user_meta_data->>'role')::public.app_role)
    ON CONFLICT DO NOTHING;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.admin_bootstrap_emails b
    WHERE lower(b.email) = lower(NEW.email)
  ) THEN
    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.id, 'admin')
    ON CONFLICT DO NOTHING;
  END IF;

  RETURN NEW;
END; $function$;

-- Existing account with a bootstrap email becomes admin immediately.
INSERT INTO public.user_roles (user_id, role)
SELECT u.id, 'admin'::public.app_role
FROM auth.users u
JOIN public.admin_bootstrap_emails b ON lower(b.email) = lower(u.email)
ON CONFLICT DO NOTHING;