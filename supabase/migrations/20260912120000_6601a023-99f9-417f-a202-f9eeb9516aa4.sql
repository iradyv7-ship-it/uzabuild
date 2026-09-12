-- Add the China Sourcing seat (Cecilia's role) to the app_role enum.
--
-- Kept in its own migration file, doing nothing else: Postgres will not let a
-- newly added enum value be used (cast, compared, inserted) inside the same
-- transaction that adds it, and this repo's migrations each run as one
-- transaction. The same pattern was used for 'client'/'procurement'/
-- 'project_manager' in 20260902110253_7fbc9a3d-5809-4a11-8d64-3f6084615b9d.sql.
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'china_sourcing';
