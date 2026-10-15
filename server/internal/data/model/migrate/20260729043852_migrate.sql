-- Modify "roles" table
ALTER TABLE "roles" ADD COLUMN "secondary_menu_paths" jsonb NOT NULL DEFAULT '[]';
