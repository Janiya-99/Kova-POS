-- Transition Platform Control Plane root login exclusively to KOVA Admin Team credentials

DO $$
BEGIN
    IF to_regclass('public.platform_admins') IS NOT NULL THEN
        IF to_regclass('public.platform_admin_sessions') IS NOT NULL THEN
            UPDATE platform_admin_sessions
            SET
                revoked_at = COALESCE(revoked_at, NOW()),
                revoked_reason = COALESCE(NULLIF(revoked_reason, ''), 'Migrated to KOVA Platform Admin login')
            WHERE admin_id IN (
                SELECT id FROM platform_admins WHERE LOWER(email) = 'admin@zonaplatform.com'
            )
              AND revoked_at IS NULL;
        END IF;

        -- Migrate legacy Zona Platform root admin row in-place if admin@kovapos.com does not exist yet
        UPDATE platform_admins
        SET
            email = 'admin@kovapos.com',
            full_name = 'Kova Root Admin',
            password_hash = crypt('Kova@2026!', gen_salt('bf', 10)),
            title = 'Kova Platform SuperAdmin',
            is_active = TRUE,
            updated_at = NOW()
        WHERE LOWER(email) = 'admin@zonaplatform.com'
          AND NOT EXISTS (
              SELECT 1 FROM platform_admins WHERE LOWER(email) = 'admin@kovapos.com'
          );

        -- Remove any leftover legacy zonaplatform row if admin@kovapos.com already existed
        DELETE FROM platform_admins
        WHERE LOWER(email) = 'admin@zonaplatform.com'
          AND EXISTS (
              SELECT 1 FROM platform_admins WHERE LOWER(email) = 'admin@kovapos.com'
          );

        -- Ensure the KOVA Platform SuperAdmin account exists if neither row existed
        INSERT INTO platform_admins (email, full_name, password_hash, title, is_active)
        SELECT
            'admin@kovapos.com',
            'Kova Root Admin',
            crypt('Kova@2026!', gen_salt('bf', 10)),
            'Kova Platform SuperAdmin',
            TRUE
        WHERE NOT EXISTS (
            SELECT 1 FROM platform_admins WHERE LOWER(email) = 'admin@kovapos.com'
        );
    END IF;
END $$;

