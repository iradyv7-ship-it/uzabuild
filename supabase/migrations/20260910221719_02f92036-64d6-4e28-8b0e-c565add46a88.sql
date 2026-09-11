CREATE OR REPLACE FUNCTION public.can_see_thread(_thread_id uuid, _project_id uuid, _user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT public.is_thread_participant(_thread_id, _user_id)
      OR (
        public.can_access_project(_project_id, _user_id)
        AND NOT public.is_client_user(_user_id)
        AND coalesce(
          (SELECT t.thread_type FROM public.coordination_threads t WHERE t.id = _thread_id),
          'group'
        ) <> 'direct'
      );
$function$;