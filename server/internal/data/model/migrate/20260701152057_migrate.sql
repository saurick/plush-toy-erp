-- Create index "processinstance_process_key_business_ref_type_business_ref_id" to table: "process_instances"
CREATE UNIQUE INDEX "processinstance_process_key_business_ref_type_business_ref_id" ON "process_instances" ("process_key", "business_ref_type", "business_ref_id");
