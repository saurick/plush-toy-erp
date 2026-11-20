-- Modify "roles" table
ALTER TABLE "roles" ADD COLUMN "navigation_mode" character varying NOT NULL DEFAULT 'recommended', ADD COLUMN "primary_menu_paths" jsonb NOT NULL DEFAULT '[]'::jsonb, ADD CONSTRAINT "roles_navigation_mode_allowed" CHECK (navigation_mode IN ('recommended', 'custom'));
