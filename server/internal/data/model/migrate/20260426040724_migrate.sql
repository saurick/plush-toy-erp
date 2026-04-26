-- Modify "purchase_return_items" table
ALTER TABLE "purchase_return_items" DROP CONSTRAINT "purchase_return_items_purchase_receipt_items_purchase_return_it", ADD CONSTRAINT "purchase_return_items_purchase_receipt_items_purchase_return_it" FOREIGN KEY ("purchase_receipt_item_id") REFERENCES "purchase_receipt_items" ("id") ON UPDATE NO ACTION ON DELETE NO ACTION;
-- Modify "purchase_returns" table
ALTER TABLE "purchase_returns" DROP CONSTRAINT "purchase_returns_purchase_receipts_purchase_returns", ADD CONSTRAINT "purchase_returns_purchase_receipts_purchase_returns" FOREIGN KEY ("purchase_receipt_id") REFERENCES "purchase_receipts" ("id") ON UPDATE NO ACTION ON DELETE NO ACTION;
