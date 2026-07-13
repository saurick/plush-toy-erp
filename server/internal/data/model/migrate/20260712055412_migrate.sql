-- Create index "customerconfigrevision_customer_key" to table: "customer_config_revisions"
CREATE UNIQUE INDEX "customerconfigrevision_customer_key" ON "customer_config_revisions" ("customer_key") WHERE ((status)::text = 'active'::text);
