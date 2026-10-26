CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS public.app_users (
    username TEXT PRIMARY KEY,
    display_name TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO public.app_users (username, display_name, password_hash)
VALUES
    ('santosh', 'Santosh', public.crypt('santosh', public.gen_salt('bf', 12))),
    ('santoshi', 'Santoshi', public.crypt('santoshi', public.gen_salt('bf', 12))),
    ('suresh', 'Suresh', public.crypt('suresh', public.gen_salt('bf', 12))),
    ('guru', 'Guru', public.crypt('guru', public.gen_salt('bf', 12)))
ON CONFLICT (username) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.query_feedback (
    query_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id TEXT NOT NULL REFERENCES public.app_users(username) ON DELETE CASCADE,
    input_text TEXT NOT NULL,
    generated_query TEXT,
    feedback TEXT CHECK (feedback IN ('Thumbs Up', 'Thumbs Down')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    feedback_updated_at TIMESTAMPTZ
);

ALTER TABLE public.query_feedback
    ADD COLUMN IF NOT EXISTS workflow_data JSONB;

CREATE INDEX IF NOT EXISTS idx_query_feedback_user_created
    ON public.query_feedback (user_id, created_at DESC);

CREATE OR REPLACE FUNCTION public.authenticate_app_user(
    p_username TEXT,
    p_password TEXT
)
RETURNS TABLE (username TEXT, display_name TEXT)
LANGUAGE SQL
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
    SELECT users.username, users.display_name
    FROM public.app_users AS users
    WHERE users.username = p_username
      AND users.password_hash = public.crypt(p_password, users.password_hash)
$function$;

REVOKE ALL ON public.app_users FROM PUBLIC;
REVOKE ALL ON public.app_users FROM data_guide_readonly;
REVOKE ALL ON FUNCTION public.authenticate_app_user(TEXT, TEXT) FROM PUBLIC;

GRANT CONNECT ON DATABASE teamdb TO data_guide_readonly;
GRANT USAGE ON SCHEMA public TO data_guide_readonly;
GRANT EXECUTE ON FUNCTION public.authenticate_app_user(TEXT, TEXT)
    TO data_guide_readonly;
GRANT SELECT, INSERT, UPDATE ON public.query_feedback
    TO data_guide_readonly;

ALTER ROLE data_guide_readonly RESET default_transaction_read_only;
