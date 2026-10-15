-- Drop index "purchasereceiptadjustmentitem_adjustment_id_source_line_no" from table: "purchase_receipt_adjustment_items"
DROP INDEX "purchasereceiptadjustmentitem_adjustment_id_source_line_no";
-- Create index "purchasereceiptadjustmentitem_adjustment_id_source_line_no" to table: "purchase_receipt_adjustment_items"
CREATE INDEX "purchasereceiptadjustmentitem_adjustment_id_source_line_no" ON "purchase_receipt_adjustment_items" ("adjustment_id", "source_line_no") WHERE ((source_line_no IS NOT NULL) AND ((source_line_no)::text <> ''::text));
-- Drop index "purchasereceiptitem_receipt_id_source_line_no" from table: "purchase_receipt_items"
DROP INDEX "purchasereceiptitem_receipt_id_source_line_no";
-- Create index "purchasereceiptitem_receipt_id_source_line_no" to table: "purchase_receipt_items"
CREATE INDEX "purchasereceiptitem_receipt_id_source_line_no" ON "purchase_receipt_items" ("receipt_id", "source_line_no") WHERE ((source_line_no IS NOT NULL) AND ((source_line_no)::text <> ''::text));
-- Drop index "purchasereturnitem_return_id_source_line_no" from table: "purchase_return_items"
DROP INDEX "purchasereturnitem_return_id_source_line_no";
-- Create index "purchasereturnitem_return_id_source_line_no" to table: "purchase_return_items"
CREATE INDEX "purchasereturnitem_return_id_source_line_no" ON "purchase_return_items" ("return_id", "source_line_no") WHERE ((source_line_no IS NOT NULL) AND ((source_line_no)::text <> ''::text));
