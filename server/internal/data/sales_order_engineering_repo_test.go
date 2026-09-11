package data

import (
	"server/internal/attachmentstore"
	"context"
	"errors"
	"strings"
	"testing"
	"time"

	"github.com/shopspring/decimal"
	"server/internal/biz"
	"server/internal/data/model/ent/salesorderitem"
)

func TestSalesOrderDemandBeforeEngineeringAndSampling(t *testing.T) {
	ctx := context.Background()
	uc, client := openSalesOrderRepoTest(t, "sales_order_demand_engineering")
	defer mustCloseEntClient(t, client)
	customer := createSalesOrderTestCustomer(t, ctx, client, "DEMAND-CUSTOMER", true)
	unit := createSalesOrderTestUnit(t, ctx, client, "DEMAND-PCS", true)
	name, customerNo, process := "客户要求的毛绒玩偶", "CLIENT-STYLE", "绣花面部"
	tax, freight := biz.SalesOrderTaxModeNone, biz.SalesOrderFreightTermsIncluded
	price := decimal.NewFromInt(15)
	in := &biz.SalesOrderMutation{OrderNo: "DEMAND-ORDER", CustomerID: customer.ID, Currency: "CNY", OrderDate: time.Now(), TaxMode: &tax, FreightTerms: &freight}
	line := &biz.SalesOrderItemSaveMutation{SalesOrderItemMutation: biz.SalesOrderItemMutation{
		LineNo: 1, UnitID: unit.ID, RequestedProductName: &name, CustomerProductNo: &customerNo, ProcessRequirement: &process,
		OrderedQuantity: decimal.NewFromInt(1000), PreShipmentSampleQuantity: decimal.NewFromInt(12), UnitPrice: &price,
		ProductCodeSnapshot: &customerNo, ProductNameSnapshot: &name,
	}}
	saved, err := uc.SaveSalesOrderWithItems(ctx, 0, in, []*biz.SalesOrderItemSaveMutation{line})
	if err != nil {
		t.Fatalf("save order before product exists: %v", err)
	}
	item := saved.Items[0]
	if item.ProductID != 0 || item.ProductNameSnapshot != nil || item.ProductCodeSnapshot != nil || item.RequestedProductName == nil || *item.RequestedProductName != name {
		t.Fatalf("demand must not fabricate product snapshots: %+v", item)
	}
	if !client.SalesOrderItem.Query().Where(salesorderitem.ID(item.ID), salesorderitem.ProductIDIsNil()).ExistX(ctx) {
		t.Fatal("unassigned product must be SQL NULL")
	}
	if item.Amount.String() != "15000" || !item.OrderedQuantity.Add(item.PreShipmentSampleQuantity).Equal(decimal.NewFromInt(1012)) {
		t.Fatal("samples affect production quantity, not ordered goods amount")
	}
	if _, count, err := uc.ListSalesOrders(ctx, biz.SalesOrderFilter{Keyword: customerNo}); err != nil || count != 1 {
		t.Fatalf("find order by customer requirement: count=%d error=%v", count, err)
	}
	if _, err := uc.SubmitSalesOrder(ctx, saved.Order.ID); err != nil {
		t.Fatalf("submit without product/BOM: %v", err)
	}
	if _, err := uc.ActivateSalesOrder(ctx, saved.Order.ID); err != nil {
		t.Fatalf("activate without product/BOM: %v", err)
	}
	product := createSalesOrderTestProduct(t, ctx, client, unit.ID, "ENGINEERED-PRODUCT", true)
	bom := client.BOMHeader.Create().SetProductID(product.ID).SetVersion("V1").SaveX(ctx)
	mutation := biz.SalesOrderEngineeringItemMutation{ID: item.ID, ProductID: product.ID, SampleBOMID: &bom.ID, ExpectedBOMVersion: bom.UpdatedAt.UnixMicro(), EngineeringStatus: biz.SalesOrderEngineeringPreparing}
	apply := func(wantErr error) {
		t.Helper()
		before := client.SalesOrder.GetX(ctx, saved.Order.ID)
		result, err := uc.SaveSalesOrderEngineering(ctx, &biz.SalesOrderEngineeringMutation{SalesOrderID: before.ID, ExpectedVersion: before.Version, ActorID: 42, Items: []biz.SalesOrderEngineeringItemMutation{mutation}})
		if !errors.Is(err, wantErr) {
			t.Fatalf("engineering status %s: got %v want %v", mutation.EngineeringStatus, err, wantErr)
		}
		if wantErr != nil {
			if client.SalesOrder.GetX(ctx, before.ID).Version != before.Version {
				t.Fatal("failed engineering save advanced order version")
			}
			return
		}
		if result.Order.Version != before.Version+1 {
			t.Fatal("engineering must use aggregate CAS")
		}
	}
	apply(nil)
	mutation.EngineeringStatus = biz.SalesOrderEngineeringSampling
	apply(biz.ErrSalesOrderEngineeringNotReady)
	material := client.Material.Create().SetCode("SAMPLE-FABRIC").SetName("绒布").SetDefaultUnitID(unit.ID).SaveX(ctx)
	client.BOMItem.Create().SetBomHeaderID(bom.ID).SetMaterialID(material.ID).SetUnitID(unit.ID).SetQuantity(decimal.NewFromInt(1)).SetLossRate(decimal.Zero).SaveX(ctx)
	apply(biz.ErrSalesOrderEngineeringNotReady)
	client.BusinessAttachment.Create().SetOwnerType(biz.BusinessAttachmentOwnerProduct).SetOwnerID(product.ID).SetAttachmentType(biz.BusinessAttachmentTypeProductImage).
		SetSlotKey(biz.BusinessAttachmentProductImageSlotPrimary).SetFileName("fixture.png").SetMimeType("image/png").SetFileSize(1).SetObjectKey(attachmentstore.NewKey()).SetSha256(strings.Repeat("a", 64)).SaveX(ctx)
	apply(nil)
	mutation.EngineeringStatus = biz.SalesOrderEngineeringConfirmed
	apply(biz.ErrSalesOrderEngineeringTransition)
	note := "样品尺寸与工艺已确认"
	mutation.SampleNote = &note
	apply(nil)
	confirmed := client.SalesOrderItem.GetX(ctx, item.ID)
	if confirmed.SampleConfirmedAt == nil || confirmed.SampleConfirmedBy == nil || *confirmed.SampleConfirmedBy != 42 {
		t.Fatal("sample confirmation must retain actor and time")
	}
	if confirmed.RequestedProductName == nil || *confirmed.RequestedProductName != name || confirmed.Amount.String() != "15000" || confirmed.OrderedQuantity.String() != "1000" {
		t.Fatal("engineering changed customer demand or commercial commitment")
	}
	mutation.ProductID, mutation.SampleBOMID = 0, nil
	mutation.EngineeringStatus = biz.SalesOrderEngineeringPreparing
	reason := "重新核对客户尺寸后再建档"
	mutation.SampleNote = &reason
	apply(nil)
	cleared := client.SalesOrderItem.GetX(ctx, item.ID)
	if cleared.ProductID != 0 || cleared.SampleBomID != nil || cleared.ProductNameSnapshot != nil || cleared.SampleConfirmedAt != nil || *cleared.RequestedProductName != name {
		t.Fatal("source clear left stale engineering data or erased demand")
	}
	stale := client.SalesOrder.GetX(ctx, saved.Order.ID).Version - 1
	if _, err := uc.SaveSalesOrderEngineering(ctx, &biz.SalesOrderEngineeringMutation{SalesOrderID: saved.Order.ID, ExpectedVersion: stale, ActorID: 42, Items: []biz.SalesOrderEngineeringItemMutation{mutation}}); !errors.Is(err, biz.ErrSalesOrderConflict) {
		t.Fatalf("stale writer: %v", err)
	}
}

func TestSalesOrderDemandReplaceAndClear(t *testing.T) {
	ctx := context.Background()
	uc, client := openSalesOrderRepoTest(t, "sales_order_demand_replace")
	defer mustCloseEntClient(t, client)
	customer := createSalesOrderTestCustomer(t, ctx, client, "REPLACE-C", true)
	unit := createSalesOrderTestUnit(t, ctx, client, "REPLACE-U", true)
	product := createSalesOrderTestProduct(t, ctx, client, unit.ID, "REPLACE-P", true)
	name, code, requirement := "原始需求", "款号", "原始工艺"
	in := &biz.SalesOrderMutation{OrderNo: "REPLACE-ORDER", CustomerID: customer.ID, Currency: "CNY", OrderDate: time.Now()}
	line := &biz.SalesOrderItemSaveMutation{SalesOrderItemMutation: biz.SalesOrderItemMutation{LineNo: 1, ProductID: product.ID, UnitID: unit.ID, OrderedQuantity: decimal.NewFromInt(5), RequestedProductName: &name, CustomerProductNo: &code, ProcessRequirement: &requirement, OrderCategory: "REPEAT", PreShipmentSampleQuantity: decimal.NewFromInt(2)}}
	saved, err := uc.SaveSalesOrderWithItems(ctx, 0, in, []*biz.SalesOrderItemSaveMutation{line})
	if err != nil {
		t.Fatal(err)
	}
	line.ID = saved.Items[0].ID
	line.ProductID, line.CustomerProductNo, line.ProcessRequirement = 0, nil, nil
	line.OrderCategory, line.PreShipmentSampleQuantity = "NEW", decimal.Zero
	newName := "改后的需求"
	line.RequestedProductName = &newName
	in.ExpectedVersion = saved.Order.Version
	replaced, err := uc.SaveSalesOrderWithItems(ctx, saved.Order.ID, in, []*biz.SalesOrderItemSaveMutation{line})
	if err != nil {
		t.Fatal(err)
	}
	row := replaced.Items[0]
	if row.ProductID != 0 || row.CustomerProductNo != nil || row.ProcessRequirement != nil || !row.PreShipmentSampleQuantity.IsZero() || row.OrderCategory != "NEW" || *row.RequestedProductName != newName {
		t.Fatalf("replace/clear: %+v", row)
	}
	line.PreShipmentSampleQuantity = decimal.RequireFromString("0.0000001")
	in.ExpectedVersion = replaced.Order.Version
	if _, err := uc.SaveSalesOrderWithItems(ctx, saved.Order.ID, in, []*biz.SalesOrderItemSaveMutation{line}); !errors.Is(err, biz.ErrBadParam) {
		t.Fatalf("invalid sample precision: %v", err)
	}
	line.PreShipmentSampleQuantity = decimal.Zero
	line.RequestedProductName = nil
	if _, err := uc.SaveSalesOrderWithItems(ctx, saved.Order.ID, in, []*biz.SalesOrderItemSaveMutation{line}); !errors.Is(err, biz.ErrBadParam) {
		t.Fatalf("empty demand: %v", err)
	}
}
