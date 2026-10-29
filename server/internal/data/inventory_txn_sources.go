package data

import (
	"context"
	"server/internal/biz"
	"server/internal/data/model/ent"
	"server/internal/data/model/ent/inventoryoperation"
	"server/internal/data/model/ent/outsourcingfact"
	"server/internal/data/model/ent/outsourcingreturndisposition"
	"server/internal/data/model/ent/productionexceptiondecision"
	"server/internal/data/model/ent/productionfact"
	"server/internal/data/model/ent/purchasereceipt"
	"server/internal/data/model/ent/purchasereceiptadjustment"
	"server/internal/data/model/ent/purchasereturn"
	"server/internal/data/model/ent/shipment"
)

type inventoryTxnSourceKey struct {
	kind string
	id   int
}
type inventoryTxnSource struct {
	number, documentType string
	documentID           int
}

// Enrich only sources of the already scoped, paginated ledger rows. Each source
// kind costs one query regardless of the number of rows, including reversals.
func hydrateInventoryTxnSources(ctx context.Context, client *ent.Client, txns []*biz.InventoryTxn) error {
	ids := map[string][]int{}
	seen := map[inventoryTxnSourceKey]bool{}
	for _, txn := range txns {
		if txn.SourceID == nil {
			continue
		}
		key := inventoryTxnSourceKey{txn.SourceType, *txn.SourceID}
		if !seen[key] {
			ids[key.kind] = append(ids[key.kind], key.id)
			seen[key] = true
		}
	}
	sources := map[inventoryTxnSourceKey]inventoryTxnSource{}
	for kind, sourceIDs := range ids {
		switch kind {
		case "PURCHASE_RECEIPT":
			rows, err := client.PurchaseReceipt.Query().Where(purchasereceipt.IDIn(sourceIDs...)).All(ctx)
			if err != nil {
				return err
			}
			for _, row := range rows {
				sources[inventoryTxnSourceKey{kind, row.ID}] = inventoryTxnSource{row.ReceiptNo, "PURCHASE_RECEIPT", row.ID}
			}
		case "PURCHASE_RETURN":
			rows, err := client.PurchaseReturn.Query().Where(purchasereturn.IDIn(sourceIDs...)).All(ctx)
			if err != nil {
				return err
			}
			for _, row := range rows {
				source := inventoryTxnSource{number: row.ReturnNo}
				if row.PurchaseReceiptID != nil {
					source.documentType, source.documentID = "PURCHASE_RECEIPT", *row.PurchaseReceiptID
				} else if row.QualityInspectionID != nil {
					source.documentType, source.documentID = "QUALITY_INSPECTION", *row.QualityInspectionID
				}
				sources[inventoryTxnSourceKey{kind, row.ID}] = source
			}
		case "PURCHASE_RECEIPT_ADJUSTMENT":
			rows, err := client.PurchaseReceiptAdjustment.Query().Where(purchasereceiptadjustment.IDIn(sourceIDs...)).All(ctx)
			if err != nil {
				return err
			}
			for _, row := range rows {
				sources[inventoryTxnSourceKey{kind, row.ID}] = inventoryTxnSource{row.AdjustmentNo, "PURCHASE_RECEIPT", row.PurchaseReceiptID}
			}
		case "PRODUCTION_FACT":
			rows, err := client.ProductionFact.Query().Where(productionfact.IDIn(sourceIDs...)).All(ctx)
			if err != nil {
				return err
			}
			for _, row := range rows {
				sources[inventoryTxnSourceKey{kind, row.ID}] = inventoryTxnSource{row.FactNo, "PRODUCTION_FACT", row.ID}
			}
		case "OUTSOURCING_FACT":
			rows, err := client.OutsourcingFact.Query().Where(outsourcingfact.IDIn(sourceIDs...)).All(ctx)
			if err != nil {
				return err
			}
			for _, row := range rows {
				sources[inventoryTxnSourceKey{kind, row.ID}] = inventoryTxnSource{row.FactNo, "OUTSOURCING_FACT", row.ID}
			}
		case "SHIPMENT":
			rows, err := client.Shipment.Query().Where(shipment.IDIn(sourceIDs...)).All(ctx)
			if err != nil {
				return err
			}
			for _, row := range rows {
				sources[inventoryTxnSourceKey{kind, row.ID}] = inventoryTxnSource{row.ShipmentNo, "SHIPMENT", row.ID}
			}
		case "INVENTORY_OPERATION":
			rows, err := client.InventoryOperation.Query().Where(inventoryoperation.IDIn(sourceIDs...)).All(ctx)
			if err != nil {
				return err
			}
			for _, row := range rows {
				sources[inventoryTxnSourceKey{kind, row.ID}] = inventoryTxnSource{row.OperationNo, "INVENTORY_OPERATION", row.ID}
			}
		case "PRODUCTION_EXCEPTION":
			rows, err := client.ProductionExceptionDecision.Query().Where(productionexceptiondecision.IDIn(sourceIDs...)).All(ctx)
			if err != nil {
				return err
			}
			for _, row := range rows {
				sources[inventoryTxnSourceKey{kind, row.ID}] = inventoryTxnSource{row.DecisionNo, "PRODUCTION_EXCEPTION", row.ID}
			}
		case "OUTSOURCING_DISPOSITION":
			rows, err := client.OutsourcingReturnDisposition.Query().Where(outsourcingreturndisposition.IDIn(sourceIDs...)).All(ctx)
			if err != nil {
				return err
			}
			for _, row := range rows {
				sources[inventoryTxnSourceKey{kind, row.ID}] = inventoryTxnSource{row.DispositionNo, "OUTSOURCING_FACT", row.OutsourcingReturnFactID}
			}
		}
	}
	for _, txn := range txns {
		if txn.SourceID == nil {
			continue
		}
		source := sources[inventoryTxnSourceKey{txn.SourceType, *txn.SourceID}]
		txn.SourceNo, txn.SourceDocumentType, txn.SourceDocumentID = source.number, source.documentType, source.documentID
	}
	return nil
}
