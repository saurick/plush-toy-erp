-- Modify "admin_users" table
ALTER TABLE "admin_users" ADD COLUMN "phone" character varying NULL, ADD COLUMN "mobile_role_permissions" character varying NOT NULL DEFAULT '';
-- Create index "adminuser_phone" to table: "admin_users"
CREATE UNIQUE INDEX "adminuser_phone" ON "admin_users" ("phone");
