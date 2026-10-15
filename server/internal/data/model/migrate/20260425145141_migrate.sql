-- Create index "bomheader_product_id" to table: "bom_headers"
CREATE UNIQUE INDEX "bomheader_product_id" ON "bom_headers" ("product_id") WHERE ((status)::text = 'ACTIVE'::text);
-- Modify "bom_items" table
ALTER TABLE "bom_items" ADD CONSTRAINT "bom_items_loss_rate_non_negative" CHECK (loss_rate >= (0)::numeric), ADD CONSTRAINT "bom_items_quantity_positive" CHECK (quantity > (0)::numeric);
-- Modify "inventory_balances" table
ALTER TABLE "inventory_balances" DROP CONSTRAINT "inventory_balances_inventory_lots_inventory_balances", ADD CONSTRAINT "inventory_balances_inventory_lots_inventory_balances" FOREIGN KEY ("lot_id") REFERENCES "inventory_lots" ("id") ON UPDATE NO ACTION ON DELETE NO ACTION;
-- Modify "inventory_txns" table
ALTER TABLE "inventory_txns" DROP CONSTRAINT "inventory_txns_inventory_lots_inventory_txns", ADD CONSTRAINT "inventory_txns_inventory_lots_inventory_txns" FOREIGN KEY ("lot_id") REFERENCES "inventory_lots" ("id") ON UPDATE NO ACTION ON DELETE NO ACTION;
