-- Cecilia's seat: UZA's real, China-based sourcing representative.
--
-- This repo has no general seed script and no project-independent staff
-- onboarding path -- the only existing onboarding mechanisms are (a)
-- InvitePanel's per-project `project_invitations` flow (requires a real
-- project row to attach to, and its email-sending half is an Admin Auth API
-- call that only application code, not a SQL migration, can make), and
-- (b) `admin_bootstrap_emails`, a small lookup table + handle_new_user()
-- trigger that grants a role automatically the moment an account with a
-- matching email is created -- used today to bootstrap the founder's admin
-- seat (20260907194128_...).
--
-- Cecilia's function (like the founder's admin seat) is not scoped to one
-- project, so (b)'s pattern is the closer fit. This generalises it from
-- "admin only" to any role, and seeds her row. When her account is actually
-- created (by an admin sending her a real Supabase invite to this address,
-- or by her signing up herself), the trigger grants her china_sourcing seat
-- immediately -- no project has to exist first, and no manual user_roles
-- edit is needed afterward.
CREATE TABLE public.role_bootstrap_emails (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  role public.app_role NOT NULL,
  full_name text,
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (email, role)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.role_bootstrap_emails TO authenticated;
GRANT ALL ON public.role_bootstrap_emails TO service_role;
ALTER TABLE public.role_bootstrap_emails ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins manage the role bootstrap list" ON public.role_bootstrap_emails;
CREATE POLICY "Admins manage the role bootstrap list"
  ON public.role_bootstrap_emails FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin'))
  WITH CHECK (public.has_role(auth.uid(),'admin'));

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  requested text := NEW.raw_user_meta_data->>'role';
  bootstrap_name text;
BEGIN
  SELECT full_name INTO bootstrap_name
  FROM public.role_bootstrap_emails
  WHERE lower(email) = lower(NEW.email)
  ORDER BY created_at
  LIMIT 1;

  INSERT INTO public.profiles (id, full_name, email)
  VALUES (
    NEW.id,
    COALESCE(NULLIF(NEW.raw_user_meta_data->>'full_name', ''), bootstrap_name, ''),
    NEW.email
  )
  ON CONFLICT (id) DO NOTHING;

  IF requested IS NOT NULL AND requested <> 'admin'
     AND requested IN ('architect','qs','interior_designer','mep_engineer','client','procurement','project_manager') THEN
    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.id, requested::public.app_role)
    ON CONFLICT DO NOTHING;
  END IF;

  -- Named-seat bootstrap (Cecilia and any future non-project-scoped seat).
  INSERT INTO public.user_roles (user_id, role)
  SELECT NEW.id, b.role
  FROM public.role_bootstrap_emails b
  WHERE lower(b.email) = lower(NEW.email)
  ON CONFLICT DO NOTHING;

  IF EXISTS (
    SELECT 1 FROM public.admin_bootstrap_emails b
    WHERE lower(b.email) = lower(NEW.email)
  ) THEN
    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.id, 'admin')
    ON CONFLICT DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$;

-- Existing account with a bootstrap email, same immediate-grant behaviour
-- admin_bootstrap_emails already applies for admin accounts.
INSERT INTO public.role_bootstrap_emails (email, role, full_name, note) VALUES
  ('cecilia@uza.rw', 'china_sourcing', 'Cecilia',
   'UZA''s China-based sourcing representative -- coordinates with Chinese manufacturers on quotes, specifications and logistics.')
ON CONFLICT (email, role) DO NOTHING;

INSERT INTO public.user_roles (user_id, role)
SELECT u.id, b.role
FROM auth.users u
JOIN public.role_bootstrap_emails b ON lower(b.email) = lower(u.email)
ON CONFLICT DO NOTHING;
