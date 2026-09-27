package data

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/shopspring/decimal"
	"server/internal/biz"
	"server/internal/data/model/ent"
)

func TestUnitQuantityGuardRejectsFractionalCountAcrossBusinessWrites(t *testing.T) {
	ctx := context.Background()
	_, client := openInventoryRepoTestData(t, "unit_quantity_guard")
	client.Use(unitQuantityGuard)
	u := client.Unit.Create().SetCode("UNIT-COUNT").SetName("个").SetPrecision(0).SaveX(ctx)
	builders := map[string]func() error{
		"sales": func() error {
			_, err := client.SalesOrderItem.Create().SetUnitID(u.ID).SetOrderedQuantity(decimal.RequireFromString("1.5")).Save(ctx)
			return err
		},
		"purchase": func() error {
			_, err := client.PurchaseOrderItem.Create().SetUnitID(u.ID).SetPurchasedQuantity(decimal.RequireFromString("1.5")).Save(ctx)
			return err
		},
		"outsourcing": func() error {
			_, err := client.OutsourcingOrderItem.Create().SetUnitID(u.ID).SetOutsourcingQuantity(decimal.RequireFromString("1.5")).Save(ctx)
			return err
		},
		"production": func() error {
			_, err := client.ProductionOrderItem.Create().SetUnitID(u.ID).SetPlannedQuantity(decimal.RequireFromString("1.5")).Save(ctx)
			return err
		},
		"arrival": func() error {
			_, err := client.PurchaseReceiptItem.Create().SetUnitID(u.ID).SetQuantity(decimal.RequireFromString("1.5")).Save(ctx)
			return err
		},
		"return": func() error {
			_, err := client.PurchaseReturnItem.Create().SetUnitID(u.ID).SetQuantity(decimal.RequireFromString("1.5")).Save(ctx)
			return err
		},
		"shipment": func() error {
			_, err := client.ShipmentItem.Create().SetUnitID(u.ID).SetQuantity(decimal.RequireFromString("1.5")).Save(ctx)
			return err
		},
		"inventory": func() error {
			_, err := client.InventoryTxn.Create().SetUnitID(u.ID).SetQuantity(decimal.RequireFromString("1.5")).Save(ctx)
			return err
		},
		"count": func() error {
			_, err := client.InventoryOperationItem.Create().SetUnitID(u.ID).SetCountedQuantity(decimal.RequireFromString("1.5")).Save(ctx)
			return err
		},
		"reserve": func() error {
			_, err := client.StockReservation.Create().SetUnitID(u.ID).SetQuantity(decimal.RequireFromString("1.5")).Save(ctx)
			return err
		},
	}
	for name, write := range builders {
		t.Run(name, func(t *testing.T) {
			var precisionErr *biz.UnitQuantityError
			if err := write(); !errors.As(err, &precisionErr) || precisionErr.Precision != 0 {
				t.Fatalf("expected integer quantity error, got %v", err)
			}
		})
	}
}

func TestUnitQuantityGuardRevalidatesEditsAndUnitSwitchWithoutAffectingStatus(t *testing.T) {
	ctx := context.Background()
	_, client := openInventoryRepoTestData(t, "unit_quantity_edit")
	client.Use(unitQuantityGuard)
	count := client.Unit.Create().SetCode("EA").SetName("个").SetPrecision(0).SaveX(ctx)
	kg := client.Unit.Create().SetCode("KG").SetName("千克").SetPrecision(3).SaveX(ctx)
	customer := client.Customer.Create().SetCode("SIM-UNIT-C").SetName("模拟单位客户").SaveX(ctx)
	order := client.SalesOrder.Create().SetOrderNo("SIM-UNIT-SO").SetCustomerID(customer.ID).SetOrderDate(time.Now()).SaveX(ctx)
	item := client.SalesOrderItem.Create().SetSalesOrderID(order.ID).SetLineNo(1).SetRequestedProductName("模拟散装材料").SetUnitID(kg.ID).SetOrderedQuantity(decimal.RequireFromString("1.125")).SaveX(ctx)
	_, err := client.SalesOrderItem.UpdateOneID(item.ID).SetOrderedQuantity(decimal.RequireFromString("1.0001")).Save(ctx)
	var precisionErr *biz.UnitQuantityError
	if !errors.As(err, &precisionErr) {
		t.Fatalf("accepted excess precision edit: %v", err)
	}
	_, err = client.SalesOrderItem.UpdateOneID(item.ID).SetUnitID(count.ID).Save(ctx)
	if !errors.As(err, &precisionErr) {
		t.Fatalf("unit switch did not revalidate existing quantity: %v", err)
	}
	unchanged := client.SalesOrderItem.GetX(ctx, item.ID)
	if unchanged.UnitID != kg.ID || unchanged.OrderedQuantity.String() != "1.125" {
		t.Fatalf("failed edit changed persisted row: %#v", unchanged)
	}
	updated := client.SalesOrderItem.UpdateOneID(item.ID).SetUnitID(count.ID).SetOrderedQuantity(decimal.NewFromInt(2)).SaveX(ctx)
	if updated.OrderedQuantity.String() != "2" {
		t.Fatal("valid unit and quantity change rejected")
	}
	client.SalesOrderItem.UpdateOneID(item.ID).SetLineStatus("closed").SaveX(ctx)
	if _, err := client.SalesOrderItem.Update().SetNote("单位无关的状态/备注更新").Save(ctx); err != nil {
		t.Fatalf("unrelated bulk update blocked: %v", err)
	}
}

func TestUnitQuantityGuardUsesTransactionUnitAndKeepsBOMCoefficients(t *testing.T) {
	ctx := context.Background()
	data, client := openInventoryRepoTestData(t, "unit_quantity_transaction")
	client.Use(unitQuantityGuard)
	u := client.Unit.Create().SetCode("UNIT-KG").SetName("千克").SetPrecision(3).SaveX(ctx)
	for _, raw := range []string{"0.001", "1.00000", "-1.125"} {
		if err := validateUnitQuantities(ctx, client, u.ID, decimal.RequireFromString(raw)); err != nil {
			t.Fatal(err)
		}
	}
	if err := validateUnitQuantities(ctx, client, u.ID, decimal.RequireFromString("0.0001")); err == nil {
		t.Fatal("accepted excess precision")
	}
	tx, err := (&inventoryRepo{data: data}).beginInventoryDBTx(ctx)
	if err != nil {
		t.Fatal(err)
	}
	defer func() {
		if err := tx.sqlTx.Rollback(); err != nil {
			t.Errorf("rollback quantity guard transaction: %v", err)
		}
	}()
	_, err = tx.client.InventoryTxn.Create().SetUnitID(u.ID).SetQuantity(decimal.RequireFromString("0.0001")).Save(ctx)
	var precisionErr *biz.UnitQuantityError
	if !errors.As(err, &precisionErr) {
		t.Fatalf("transaction guard missing: %v", err)
	}
	mutation := tx.client.BOMItem.Create().SetUnitID(u.ID).SetQuantity(decimal.RequireFromString("0.000001")).Mutation()
	called := false
	_, err = unitQuantityGuard(ent.MutateFunc(func(context.Context, ent.Mutation) (ent.Value, error) { called = true; return nil, nil })).Mutate(ctx, mutation)
	if err != nil || !called {
		t.Fatalf("BOM coefficient was rounded or rejected: %v", err)
	}
}
