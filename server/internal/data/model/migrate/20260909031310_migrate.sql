-- Preserve existing warehouse identities and balances; uncertain classifications require manual completion.
UPDATE "warehouses" SET "type" = CASE
 WHEN "type" IN ('RAW', 'RAW_MATERIAL') THEN 'MATERIAL'
 WHEN "type" IN ('MATERIAL', 'MAIN_MATERIAL', 'AUXILIARY_MATERIAL', 'PACKAGING_MATERIAL', 'OTHER_MATERIAL', 'FINISHED_GOODS') THEN "type"
 ELSE 'UNCLASSIFIED' END;
-- Modify "warehouses" table
ALTER TABLE "warehouses" ADD CONSTRAINT "warehouses_type_check" CHECK ((type)::text = ANY ((ARRAY['MAIN_MATERIAL'::character varying, 'AUXILIARY_MATERIAL'::character varying, 'PACKAGING_MATERIAL'::character varying, 'OTHER_MATERIAL'::character varying, 'MATERIAL'::character varying, 'FINISHED_GOODS'::character varying, 'UNCLASSIFIED'::character varying])::text[]));
-- Modify "materials" table
ALTER TABLE "materials" ADD CONSTRAINT "materials_stock_category_check" CHECK ((stock_category)::text = ANY ((ARRAY['MAIN'::character varying, 'AUXILIARY'::character varying, 'PACKAGING'::character varying, 'OTHER'::character varying, 'UNCLASSIFIED'::character varying])::text[])), ADD COLUMN "stock_category" character varying NOT NULL DEFAULT 'UNCLASSIFIED', ADD COLUMN "default_warehouse_id" bigint NULL, ADD CONSTRAINT "materials_warehouses_default_warehouse" FOREIGN KEY ("default_warehouse_id") REFERENCES "warehouses" ("id") ON UPDATE NO ACTION ON DELETE NO ACTION;
-- Create index "material_stock_category" to table: "materials"
CREATE INDEX "material_stock_category" ON "materials" ("stock_category");

UPDATE "materials" SET "stock_category" = CASE "category"
 WHEN '主料' THEN 'MAIN' WHEN '辅料' THEN 'AUXILIARY'
 WHEN '包材' THEN 'PACKAGING' WHEN '包装材料' THEN 'PACKAGING'
 WHEN '其他材料' THEN 'OTHER' ELSE 'UNCLASSIFIED' END;

INSERT INTO "permissions" ("permission_key", "name", "module", "action", "resource", "builtin", "created_at", "updated_at")
VALUES ('warehouse.manage', '维护仓库', 'warehouse', 'manage', 'warehouse', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("permission_key") DO NOTHING;
INSERT INTO "role_permissions" ("role_id", "permission_id", "created_at")
SELECT r."id", p."id", CURRENT_TIMESTAMP FROM "roles" r JOIN "permissions" p ON p."permission_key" = 'warehouse.manage'
WHERE r."role_key" IN ('boss', 'warehouse') AND r."role_type" = 'business_default'
ON CONFLICT ("role_id", "permission_id") DO NOTHING;
UPDATE "roles" SET "version" = "version" + 1, "updated_at" = CURRENT_TIMESTAMP
WHERE "role_key" IN ('boss', 'warehouse') AND "role_type" = 'business_default';

-- migration-risk: maintenance
-- affected-table: materials, warehouses, permissions, role_permissions, roles
-- expected-lock: ACCESS EXCLUSIVE on materials and warehouses for column and constraint changes; row locks for deterministic classification and builtin permission updates
-- preflight: scripts/qa/populated-upgrade-preflight.sh
-- recovery: restore the verified pre-migration database backup with its matching product version to recover original free-text warehouse types and material classifications
-- maintenance-required: true
