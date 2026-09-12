package data

import (
	"context"
	"errors"
	"github.com/shopspring/decimal"
	"reflect"
	"server/internal/biz"
	"strings"
	"testing"
	"time"
)

func TestSalesOrderImportedLinesPersistEvidenceWithoutWritingFacts(t *testing.T) {
	ctx := context.Background()
	uc, client := openSalesOrderRepoTest(t, "sales_order_import_source")
	defer mustCloseEntClient(t, client)
	customer := createSalesOrderTestCustomer(t, ctx, client, "C-IMPORT", true)
	unit := createSalesOrderTestUnit(t, ctx, client, "PCS-IMPORT", true)
	name := "模拟订货产品"
	order := &biz.SalesOrderMutation{OrderNo: "SO-IMPORT-PERSIST", CustomerID: customer.ID, Currency: "CNY", OrderDate: time.Date(2026, 9, 1, 0, 0, 0, 0, time.UTC)}
	line := biz.SalesOrderItemMutation{LineNo: 1, UnitID: unit.ID, RequestedProductName: &name, OrderedQuantity: decimal.NewFromInt(1000), PreShipmentSampleQuantity: decimal.NewFromInt(12), ImportSource: map[string]any{
		"file_name": "订单.xlsx", "file_sha256": strings.Repeat("a", 64), "sheet_name": "订单", "row_number": 5,
		"cells": []any{map[string]any{"column": 16, "label": "设计师", "value": "原表设计师"}, map[string]any{"column": 11, "label": "未出货数", "value": "123"}},
	}}
	created, err := uc.SaveSalesOrderWithItems(ctx, 0, order, []*biz.SalesOrderItemSaveMutation{{SalesOrderItemMutation: line}, {SalesOrderItemMutation: func() biz.SalesOrderItemMutation {
		other := line
		other.LineNo = 2
		other.ImportSource = nil
		return other
	}()}})
	if err != nil {
		t.Fatal(err)
	}
	if len(created.Items) != 2 || created.Items[0].ImportSource == nil {
		t.Fatal("header and all imported lines must persist together")
	}
	readItems, _, err := uc.ListSalesOrderItems(ctx, biz.SalesOrderItemFilter{SalesOrderID: created.Order.ID})
	if err != nil {
		t.Fatal(err)
	}
	item := readItems[0]
	if item.Designer != nil || item.ProductID != 0 || item.UnshippedQuantity == nil || item.UnshippedQuantity.String() != "1000" {
		t.Fatalf("source evidence became a business fact: %+v", item)
	}
	if client.Shipment.Query().CountX(ctx) != 0 || client.InventoryTxn.Query().CountX(ctx) != 0 || client.FinanceFact.Query().CountX(ctx) != 0 {
		t.Fatal("import generated downstream facts")
	}
	if _, err := uc.SaveSalesOrderWithItems(ctx, 0, order, []*biz.SalesOrderItemSaveMutation{{SalesOrderItemMutation: line}}); err == nil {
		t.Fatal("duplicate order number accepted")
	}
	if client.SalesOrder.Query().CountX(ctx) != 1 || client.SalesOrderItem.Query().CountX(ctx) != 2 {
		t.Fatal("failed duplicate left partial records")
	}
	line.ImportSource = item.ImportSource
	line.SalesOrderID = item.SalesOrderID
	updated, err := uc.UpdateSalesOrderItem(ctx, item.ID, &line)
	if err != nil || !reflect.DeepEqual(updated.ImportSource, item.ImportSource) {
		t.Fatalf("evidence roundtrip: %v", err)
	}
	line.ImportSource = nil
	updated, err = uc.UpdateSalesOrderItem(ctx, item.ID, &line)
	if err != nil || !reflect.DeepEqual(updated.ImportSource, item.ImportSource) {
		t.Fatalf("omitting evidence erased it: %v", err)
	}
	changed := map[string]any{}
	for key, value := range item.ImportSource {
		changed[key] = value
	}
	changed["row_number"] = 6
	line.ImportSource = changed
	if _, err := uc.UpdateSalesOrderItem(ctx, item.ID, &line); !errors.Is(err, biz.ErrBadParam) {
		t.Fatalf("overwrote original evidence: %v", err)
	}
}
