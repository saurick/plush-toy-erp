-- Drop index "inventorytxn_reversal_of_txn_id" from table: "inventory_txns"
DROP INDEX "inventorytxn_reversal_of_txn_id";
-- Create index "inventorytxn_reversal_of_txn_id" to table: "inventory_txns"
CREATE UNIQUE INDEX "inventorytxn_reversal_of_txn_id" ON "inventory_txns" ("reversal_of_txn_id");
