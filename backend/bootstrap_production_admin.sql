-- Production admin bootstrap.
--
-- 1. Create the user in Supabase Auth first, with the same mobile/password that
--    the admin will use to sign in.
-- 2. Copy that Auth user's UUID into admin_auth_user_id below.
-- 3. Run after `uv run alembic upgrade head`:
--
--    psql "$DATABASE_URL" \
--      -v admin_auth_user_id='00000000-0000-0000-0000-000000000000' \
--      -v admin_mobile='+919876543210' \
--      -v admin_display_name='Admin Name' \
--      -f backend/bootstrap_production_admin.sql

\set ON_ERROR_STOP on

BEGIN;

INSERT INTO users (id, auth_user_id, mobile, display_name)
VALUES (gen_random_uuid(), :'admin_auth_user_id'::uuid, :'admin_mobile', :'admin_display_name')
ON CONFLICT (mobile) DO UPDATE
SET auth_user_id = EXCLUDED.auth_user_id,
    display_name = EXCLUDED.display_name;

WITH target_user AS (
    SELECT id FROM users WHERE mobile = :'admin_mobile'
), target_society AS (
    SELECT id FROM societies ORDER BY created_at ASC LIMIT 1
)
INSERT INTO society_memberships (id, user_id, society_id, status)
SELECT gen_random_uuid(), target_user.id, target_society.id, 'ACTIVE'
FROM target_user, target_society
WHERE NOT EXISTS (
    SELECT 1
    FROM society_memberships existing
    WHERE existing.user_id = target_user.id
      AND existing.society_id = target_society.id
);

WITH target_user AS (
    SELECT id FROM users WHERE mobile = :'admin_mobile'
), target_membership AS (
    SELECT society_memberships.id
    FROM society_memberships
    JOIN target_user ON target_user.id = society_memberships.user_id
    WHERE society_memberships.status = 'ACTIVE'
    ORDER BY society_memberships.created_at ASC
    LIMIT 1
), admin_role AS (
    SELECT id FROM roles WHERE key = 'SOCIETY_ADMIN'
)
INSERT INTO membership_roles (society_membership_id, role_id)
SELECT target_membership.id, admin_role.id
FROM target_membership, admin_role
ON CONFLICT DO NOTHING;

COMMIT;
