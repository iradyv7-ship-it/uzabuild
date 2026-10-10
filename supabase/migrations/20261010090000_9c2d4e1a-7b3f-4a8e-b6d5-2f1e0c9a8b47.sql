-- Self sign-up can no longer claim a staff seat.
--
-- handle_new_user() (last replaced in 20260912121500) granted whatever `role`
-- the sign-up form put in the user's metadata, from a whitelist that included
-- every internal seat. The public sign-up page offered architect, QS, interior
-- designer, MEP engineer and project manager, so anyone on the internet could
-- create an internal account and read every client record and the priced
-- catalog (is_internal_user / can_see_costs only check that a non-client role
-- exists).
--
-- Staff seats are granted only by an invitation (src/lib/invitations.functions.ts
-- upserts user_roles explicitly with the service role), by role_bootstrap_emails
-- or admin_bootstrap_emails, or by an admin. A self sign-up may only ever be a
-- client — which sees nothing until a project lead adds them to a project.
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

  -- Metadata is user-supplied: the only seat it can ever produce is 'client'.
  IF requested = 'client' THEN
    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.id, 'client')
    ON CONFLICT DO NOTHING;
  END IF;

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
