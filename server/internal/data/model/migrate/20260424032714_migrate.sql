-- Modify "admin_users" table
ALTER TABLE "admin_users" ADD COLUMN "erp_preferences" character varying NOT NULL DEFAULT '{}';
