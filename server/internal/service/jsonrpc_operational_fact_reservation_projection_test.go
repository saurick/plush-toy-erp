package service

import (
	"context"
	"testing"
	"time"

	"server/internal/biz"
	"server/internal/errcode"

	"github.com/shopspring/decimal"
)

type stockReservationProjectionRepo struct {
	stubBusinessDashboardOperationalFactRepo
	calls int
	scope biz.StockReservationReadScope
}

func (r *stockReservationProjectionRepo) ListStockReservationsForAccess(
	_ context.Context,
	_ biz.OperationalFactFilter,
	scope biz.StockReservationReadScope,
) ([]*biz.StockReservation, int, error) {
	r.calls++
	r.scope = scope
	salesOrderID := 11
	salesOrderItemID := 12
	salesOrderNo := "SO-RESERVATION-READ"
	salesOrderLineNo := 3
	productSkuID := 22
	productSkuCode := "SKU-RESERVATION-READ"
	productSkuName := "蓝色"
	lotID := 32
	lotNo := "LOT-RESERVATION-READ"
	return []*biz.StockReservation{{
		ID:               1,
		ReservationNo:    "RES-READ-001",
		Status:           biz.StockReservationStatusActive,
		SalesOrderID:     &salesOrderID,
		SalesOrderItemID: &salesOrderItemID,
		SalesOrderNo:     &salesOrderNo,
		SalesOrderLineNo: &salesOrderLineNo,
		ProductID:        21,
		ProductSkuID:     &productSkuID,
		ProductCode:      "PROD-RESERVATION-READ",
		ProductName:      "毛绒兔",
		ProductSkuCode:   &productSkuCode,
		ProductSkuName:   &productSkuName,
		WarehouseID:      31,
		WarehouseCode:    "WH-RESERVATION-READ",
		WarehouseName:    "成品仓",
		UnitID:           41,
		UnitCode:         "PCS",
		UnitName:         "个",
		LotID:            &lotID,
		LotNo:            &lotNo,
		Quantity:         decimal.RequireFromString("0.000001"),
		IdempotencyKey:   "reservation-read-projection",
		ReservedAt:       time.Unix(1, 0),
		CreatedAt:        time.Unix(1, 0),
		UpdatedAt:        time.Unix(1, 0),
	}}, 1, nil
}

func TestListStockReservationsFailsClosedWithoutReadPermission(t *testing.T) {
	repo := &stockReservationProjectionRepo{}
	dispatcher := newOperationalFactJSONRPCTestDataWithRepo(
		t,
		workflowJSONRPCAdmin([]string{biz.SalesRoleKey}),
		repo,
	)

	_, result, err := dispatcher.handleOperationalFact(
		workflowJSONRPCAdminContext(),
		"list_stock_reservations",
		"reservation-read-denied",
		nil,
	)
	if err != nil {
		t.Fatalf("list_stock_reservations err = %v", err)
	}
	if result == nil || result.Code != errcode.PermissionDenied.Code {
		t.Fatalf("result = %#v, want permission denied", result)
	}
	if repo.calls != 0 {
		t.Fatalf("repository calls = %d, want 0", repo.calls)
	}
}

func TestListStockReservationsScopesReadableReferencesByEffectivePermission(t *testing.T) {
	tests := []struct {
		name              string
		roleKeys          []string
		permissions       []string
		wantSales         bool
		wantInventory     bool
		wantSalesRead     bool
		wantInventoryRead bool
	}{
		{
			name:        "sales order header only keeps readable source redacted",
			roleKeys:    []string{biz.SalesRoleKey},
			permissions: []string{biz.PermissionSalesOrderRead},
		},
		{
			name:          "sales order and line expose readable source",
			roleKeys:      []string{biz.SalesRoleKey},
			permissions:   []string{biz.PermissionSalesOrderRead, biz.PermissionSalesOrderItemRead},
			wantSales:     true,
			wantSalesRead: true,
		},
		{
			name:              "inventory read exposes stock references",
			roleKeys:          []string{biz.WarehouseRoleKey},
			permissions:       []string{biz.PermissionWarehouseInventoryRead},
			wantInventory:     true,
			wantInventoryRead: true,
		},
		{
			name:              "combined access exposes both projections",
			roleKeys:          []string{biz.SalesRoleKey, biz.WarehouseRoleKey},
			permissions:       []string{biz.PermissionSalesOrderRead, biz.PermissionSalesOrderItemRead, biz.PermissionWarehouseInventoryRead},
			wantSales:         true,
			wantInventory:     true,
			wantSalesRead:     true,
			wantInventoryRead: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			repo := &stockReservationProjectionRepo{}
			dispatcher := newOperationalFactJSONRPCTestDataWithRepo(
				t,
				workflowJSONRPCAdmin(tt.roleKeys, tt.permissions...),
				repo,
			)

			_, result, err := dispatcher.handleOperationalFact(
				workflowJSONRPCAdminContext(),
				"list_stock_reservations",
				"reservation-read-scope",
				nil,
			)
			if err != nil {
				t.Fatalf("list_stock_reservations err = %v", err)
			}
			if result == nil || result.Code != errcode.OK.Code {
				t.Fatalf("result = %#v, want OK", result)
			}
			if repo.calls != 1 {
				t.Fatalf("repository calls = %d, want 1", repo.calls)
			}
			if repo.scope.IncludeSalesOrderReferences != tt.wantSalesRead ||
				repo.scope.IncludeInventoryReferences != tt.wantInventoryRead {
				t.Fatalf("scope = %#v", repo.scope)
			}

			rawItems, ok := result.Data.AsMap()["stock_reservations"].([]any)
			if !ok || len(rawItems) != 1 {
				t.Fatalf("stock_reservations = %#v", result.Data.AsMap()["stock_reservations"])
			}
			item, ok := rawItems[0].(map[string]any)
			if !ok {
				t.Fatalf("stock reservation item = %#v", rawItems[0])
			}
			if item["quantity"] != "0.000001" {
				t.Fatalf("quantity = %#v, want exact six-decimal value", item["quantity"])
			}
			for _, rawID := range []string{
				"sales_order_id",
				"sales_order_item_id",
				"product_id",
				"product_sku_id",
				"warehouse_id",
				"unit_id",
				"lot_id",
			} {
				if _, exists := item[rawID]; !exists {
					t.Fatalf("stable raw id %q missing from %#v", rawID, item)
				}
			}
			_, hasSalesOrderNo := item["sales_order_no"]
			_, hasSalesOrderLineNo := item["sales_order_line_no"]
			if hasSalesOrderNo != tt.wantSales || hasSalesOrderLineNo != tt.wantSales {
				t.Fatalf("sales projection keys = (%t, %t), want %t: %#v", hasSalesOrderNo, hasSalesOrderLineNo, tt.wantSales, item)
			}
			_, hasProductName := item["product_name"]
			_, hasWarehouseName := item["warehouse_name"]
			_, hasLotNo := item["lot_no"]
			if hasProductName != tt.wantInventory ||
				hasWarehouseName != tt.wantInventory ||
				hasLotNo != tt.wantInventory {
				t.Fatalf("inventory projection keys = (%t, %t, %t), want %t: %#v", hasProductName, hasWarehouseName, hasLotNo, tt.wantInventory, item)
			}
		})
	}
}
