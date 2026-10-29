package data

import (
	"context"
	"fmt"
	"io"
	"testing"

	"entgo.io/ent/dialect/sql"
	"github.com/go-kratos/kratos/v2/log"
	"github.com/shopspring/decimal"
	"server/internal/biz"
	"server/internal/data/model/ent"
)

func TestInventoryQuantitySeparatesUnreservedIssuableAndRestricted(t *testing.T) {
	ctx := context.Background()
	data, client := openInventoryRepoTestData(t, "inventory_quantity_semantics")
	f := createInventoryTestFixtures(t, ctx, client)
	uc := biz.NewInventoryUsecase(NewInventoryRepo(data, log.NewStdLogger(io.Discard)))
	for _, subject := range []string{biz.InventorySubjectMaterial, biz.InventorySubjectProduct} {
		subjectID, warehouseID := f.materialID, f.warehouseID
		if subject == biz.InventorySubjectProduct {
			subjectID, warehouseID = f.productID, f.productWarehouseID
		}
		for _, state := range []string{biz.InventoryLotActive, biz.InventoryLotHold, biz.InventoryLotRejected, biz.InventoryLotDisabled} {
			lot := createTestInventoryLot(t, ctx, uc, subject, subjectID, subject+state)
			_, err := uc.ApplyInventoryTxnAndUpdateBalance(ctx, &biz.InventoryTxnCreate{SubjectType: subject, SubjectID: subjectID, WarehouseID: warehouseID, LotID: &lot.ID, UnitID: f.unitID, TxnType: biz.InventoryTxnIn, Direction: 1, Quantity: decimal.NewFromInt(10), SourceType: "TEST", IdempotencyKey: subject + state})
			if err != nil {
				t.Fatal(err)
			}
			forceLotStatus(t, ctx, client, lot.ID, state)
			rows, total, err := uc.ListInventoryBalances(ctx, biz.InventoryBalanceFilter{SubjectType: subject, SubjectID: subjectID, WarehouseID: warehouseID, LotID: lot.ID})
			if err != nil || total != 1 || len(rows) != 1 {
				t.Fatalf("rows=%v total=%d error=%v", rows, total, err)
			}
			row := rows[0]
			if row.Quantity.String() != "10" || row.AvailableQuantity.String() != "10" || row.LotStatus != state {
				t.Fatalf("lost on-hand/unreserved: %+v", row)
			}
			issuable, restricted, shippable := "0", "0", "0"
			if state == biz.InventoryLotActive {
				if subject == biz.InventorySubjectMaterial {
					issuable = "10"
				} else {
					shippable = "10"
				}
			} else {
				restricted = "10"
			}
			if row.IssuableQuantity.String() != issuable || row.RestrictedQuantity.String() != restricted || row.ReadyToShipQuantity.String() != shippable {
				t.Fatalf("%s/%s: %+v", subject, state, row)
			}
		}
	}
}

func TestInventoryTxnSourceResolutionIsBoundedAndMissingSourcesStayEmpty(t *testing.T) {
	ctx := context.Background()
	data, _ := openInventoryRepoTestData(t, "inventory_source_batch")
	kinds := []string{"PURCHASE_RECEIPT", "PURCHASE_RETURN", "PURCHASE_RECEIPT_ADJUSTMENT", "PRODUCTION_FACT", "OUTSOURCING_FACT", "SHIPMENT", "INVENTORY_OPERATION", "PRODUCTION_EXCEPTION", "OUTSOURCING_DISPOSITION"}
	queries := 0
	client := ent.NewClient(ent.Driver(sql.OpenDB(data.sqlDialect, data.sqldb)), ent.Debug(), ent.Log(func(...any) { queries++ }))
	for _, size := range []int{1, 50, 200} {
		txns := []*biz.InventoryTxn{}
		for _, kind := range kinds {
			for i := 0; i < size; i++ {
				id := i + 1
				txns = append(txns, &biz.InventoryTxn{SourceType: kind, SourceID: &id})
			}
		}
		queries = 0
		if err := hydrateInventoryTxnSources(ctx, client, txns); err != nil {
			t.Fatal(err)
		}
		if queries != len(kinds) {
			t.Fatalf("size=%d queries=%d want=%d", size, queries, len(kinds))
		}
		for _, txn := range txns {
			if txn.SourceNo != "" || txn.SourceDocumentID != 0 || txn.SourceDocumentType != "" {
				t.Fatal("invented missing source", fmt.Sprint(txn))
			}
		}
	}
}
