-- Modify "admin_users" table
ALTER TABLE "admin_users" ADD COLUMN "level" smallint NOT NULL DEFAULT 0, ADD COLUMN "menu_permissions" character varying NOT NULL DEFAULT '';
-- Create index "adminuser_level" to table: "admin_users"
CREATE INDEX "adminuser_level" ON "admin_users" ("level");
