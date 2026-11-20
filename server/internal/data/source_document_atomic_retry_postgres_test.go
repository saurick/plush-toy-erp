package data

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"testing"
	"time"

	"server/internal/biz"
	"server/internal/data/model/ent"
	"server/internal/data/model/ent/outsourcingorderitem"
	"server/internal/data/model/ent/purchaseorderitem"
	"server/internal/data/model/ent/salesorderitem"

	"github.com/go-kratos/kratos/v2/log"
	"github.com/shopspring/decimal"
)

// Fail after the aggregate header and a new child line have been written. A retry
// must use the original version and retain the original line's identity.
func TestSourceDocumentPostgresAggregateFailureRollsBackAndRetries(t *testing.T) {
	for _, kind := range []string{"sales", "purchase", "outsourcing"} {
		t.Run(kind, func(t *testing.T) {
			ctx := context.Background()
			data, client := openPurchaseReceiptPostgresTestData(t)
			logger := log.NewStdLogger(io.Discard)
			suffix := postgresTestSuffix()
			unit := createTestUnit(t, ctx, client, "ATOMIC-U-"+suffix)
			date := time.Date(2026, 10, 16, 0, 0, 0, 0, time.UTC)
			var orderID, lineID, version int
			var save func(string, bool) error
			var read func() (any, any)
			injected := errors.New("simulated new aggregate line storage failure")
			failInsert := false
			failures := 0
			hook := func(next ent.Mutator) ent.Mutator {
				return ent.MutateFunc(func(ctx context.Context, mutation ent.Mutation) (ent.Value, error) {
					value, err := next.Mutate(ctx, mutation)
					if err == nil && failInsert && mutation.Op().Is(ent.OpCreate) {
						failures++
						return nil, injected
					}
					return value, err
				})
			}
			switch kind {
			case "sales":
				product := createTestProduct(t, ctx, client, unit.ID, "ATOMIC-P-"+suffix)
				customer := createSalesOrderTestCustomer(t, ctx, client, "ATOMIC-C-"+suffix, true)
				uc := biz.NewSalesOrderUsecase(NewSalesOrderRepo(data, logger))
				save = func(note string, extra bool) error {
					quantity := int64(2)
					if extra {
						quantity = 4
					}
					items := []*biz.SalesOrderItemSaveMutation{{ID: lineID, SalesOrderItemMutation: biz.SalesOrderItemMutation{LineNo: 1, ProductID: product.ID, UnitID: unit.ID, OrderedQuantity: decimal.NewFromInt(quantity)}}}
					if extra {
						items = append(items, &biz.SalesOrderItemSaveMutation{SalesOrderItemMutation: biz.SalesOrderItemMutation{LineNo: 2, ProductID: product.ID, UnitID: unit.ID, OrderedQuantity: decimal.NewFromInt(3)}})
					}
					result, err := uc.SaveSalesOrderWithItems(ctx, orderID, &biz.SalesOrderMutation{OrderNo: "ATOMIC-SO-" + suffix, CustomerID: customer.ID, OrderDate: date, Currency: "CNY", Note: &note, TaxMode: new(biz.SalesOrderTaxModeNone), FreightTerms: new(biz.SalesOrderFreightTermsIncluded), ExpectedVersion: version}, items)
					if err == nil {
						orderID, lineID = result.Order.ID, result.Items[0].ID
					}
					return err
				}
				read = func() (any, any) {
					return client.SalesOrder.GetX(ctx, orderID), client.SalesOrderItem.Query().Where(salesorderitem.SalesOrderID(orderID)).Order(ent.Asc(salesorderitem.FieldLineNo)).AllX(ctx)
				}
				client.SalesOrderItem.Use(hook)
			case "purchase":
				material := createTestMaterial(t, ctx, client, unit.ID, "ATOMIC-M-"+suffix)
				supplier := createPurchaseOrderTestSupplier(t, ctx, client, "ATOMIC-S-"+suffix, true)
				uc := biz.NewPurchaseOrderUsecase(NewPurchaseOrderRepo(data, logger))
				save = func(note string, extra bool) error {
					quantity := int64(2)
					if extra {
						quantity = 4
					}
					items := []*biz.PurchaseOrderItemSaveMutation{{ID: lineID, PurchaseOrderItemMutation: biz.PurchaseOrderItemMutation{LineNo: 1, MaterialID: material.ID, UnitID: unit.ID, PurchasedQuantity: decimal.NewFromInt(quantity)}}}
					if extra {
						items = append(items, &biz.PurchaseOrderItemSaveMutation{PurchaseOrderItemMutation: biz.PurchaseOrderItemMutation{LineNo: 2, MaterialID: material.ID, UnitID: unit.ID, PurchasedQuantity: decimal.NewFromInt(3)}})
					}
					result, err := uc.SavePurchaseOrderWithItems(ctx, orderID, &biz.PurchaseOrderMutation{PurchaseOrderNo: "ATOMIC-PO-" + suffix, SupplierID: supplier.ID, PaymentTermDays: new(int), PurchaseDate: date, Currency: "CNY", Note: &note, ExpectedVersion: version}, items)
					if err == nil {
						orderID, lineID = result.Order.ID, result.Items[0].ID
					}
					return err
				}
				read = func() (any, any) {
					return client.PurchaseOrder.GetX(ctx, orderID), client.PurchaseOrderItem.Query().Where(purchaseorderitem.PurchaseOrderID(orderID)).Order(ent.Asc(purchaseorderitem.FieldLineNo)).AllX(ctx)
				}
				client.PurchaseOrderItem.Use(hook)
			case "outsourcing":
				material := createTestMaterial(t, ctx, client, unit.ID, "ATOMIC-M-"+suffix)
				supplier := createPurchaseOrderTestSupplier(t, ctx, client, "ATOMIC-S-"+suffix, true)
				process := client.Process.Create().SetCode("ATOMIC-PROC-" + suffix).SetName("模拟材料加工").SetOutsourcingEnabled(true).SaveX(ctx)
				uc := biz.NewOutsourcingOrderUsecase(NewOutsourcingOrderRepo(data, logger))
				save = func(note string, extra bool) error {
					quantity := int64(2)
					if extra {
						quantity = 4
					}
					items := []*biz.OutsourcingOrderItemSaveMutation{{ID: lineID, OutsourcingOrderItemMutation: biz.OutsourcingOrderItemMutation{LineNo: 1, SubjectType: biz.OutsourcingOrderSubjectMaterial, MaterialID: &material.ID, ProcessID: process.ID, UnitID: unit.ID, OutsourcingQuantity: decimal.NewFromInt(quantity)}}}
					if extra {
						items = append(items, &biz.OutsourcingOrderItemSaveMutation{OutsourcingOrderItemMutation: biz.OutsourcingOrderItemMutation{LineNo: 2, SubjectType: biz.OutsourcingOrderSubjectMaterial, MaterialID: &material.ID, ProcessID: process.ID, UnitID: unit.ID, OutsourcingQuantity: decimal.NewFromInt(3)}})
					}
					result, err := uc.SaveOutsourcingOrderWithItems(ctx, orderID, &biz.OutsourcingOrderMutation{OutsourcingOrderNo: "ATOMIC-OUT-" + suffix, SupplierID: supplier.ID, PaymentTermDays: new(int), OrderDate: date, Currency: "CNY", Note: &note, ExpectedVersion: version}, items)
					if err == nil {
						orderID, lineID = result.Order.ID, result.Items[0].ID
					}
					return err
				}
				read = func() (any, any) {
					return client.OutsourcingOrder.GetX(ctx, orderID), client.OutsourcingOrderItem.Query().Where(outsourcingorderitem.OutsourcingOrderID(orderID)).Order(ent.Asc(outsourcingorderitem.FieldLineNo)).AllX(ctx)
				}
				client.OutsourcingOrderItem.Use(hook)
			}
			if err := save("original", false); err != nil {
				t.Fatalf("create aggregate: %v", err)
			}
			version = 1
			originalLine := lineID
			encode := func() string {
				header, items := read()
				value, err := json.Marshal([]any{header, items})
				if err != nil {
					t.Fatal(err)
				}
				return string(value)
			}
			before := encode()
			failInsert = true
			if err := save("pending retry", true); !errors.Is(err, injected) {
				t.Fatalf("expected storage failure after earlier writes, got %v", err)
			}
			if failures != 1 || encode() != before {
				t.Fatalf("failed save must restore the full header, version and lines; failures=%d", failures)
			}
			failInsert = false
			if err := save("pending retry", true); err != nil {
				t.Fatalf("retry original version after rollback: %v", err)
			}
			header, items := read()
			encoded, err := json.Marshal(header)
			if err != nil {
				t.Fatal(err)
			}
			var stored struct {
				Version int    `json:"version"`
				Note    string `json:"note"`
			}
			if err := json.Unmarshal(encoded, &stored); err != nil {
				t.Fatal(err)
			}
			encodedItems, err := json.Marshal(items)
			if err != nil {
				t.Fatal(err)
			}
			var lines []struct {
				ID     int `json:"id"`
				LineNo int `json:"line_no"`
			}
			if err := json.Unmarshal(encodedItems, &lines); err != nil {
				t.Fatal(err)
			}
			if stored.Version != 2 || stored.Note != "pending retry" || len(lines) != 2 || lines[0].ID != originalLine || lines[0].LineNo != 1 || lines[1].LineNo != 2 {
				t.Fatalf("retry lost aggregate identity or duplicated lines: header=%s items=%s", encoded, encodedItems)
			}
			var amounts []map[string]json.RawMessage
			if err := json.Unmarshal(encodedItems, &amounts); err != nil {
				t.Fatal(err)
			}
			quantityKey := map[string]string{"sales": "ordered_quantity", "purchase": "purchased_quantity", "outsourcing": "outsourcing_quantity"}[kind]
			for index, expected := range []string{"4", "3"} {
				var actual decimal.Decimal
				if err := json.Unmarshal(amounts[index][quantityKey], &actual); err != nil || !actual.Equal(decimal.RequireFromString(expected)) {
					t.Fatalf("retry quantity line %d = %s, want %s; err=%v", index+1, amounts[index][quantityKey], expected, err)
				}
			}
			after := encode()
			conflict := map[string]error{"sales": biz.ErrSalesOrderConflict, "purchase": biz.ErrPurchaseOrderConflict, "outsourcing": biz.ErrOutsourcingOrderConflict}[kind]
			if err := save("stale duplicate", true); !errors.Is(err, conflict) || encode() != after {
				t.Fatalf("reusing the consumed version must reject without another write: %v", err)
			}
		})
	}
}
