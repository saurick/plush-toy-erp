-- Modify "admin_users" table
ALTER TABLE "admin_users" ADD COLUMN "revoked_at" timestamptz NULL, ADD COLUMN "status_reason" character varying NULL, ADD COLUMN "status_changed_at" timestamptz NULL, ADD COLUMN "status_changed_by" bigint NULL;
