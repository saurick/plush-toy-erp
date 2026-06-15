package data

import (
	"context"
	"testing"
	"time"

	"server/internal/data/model/ent"
	"server/internal/data/model/ent/enttest"

	"entgo.io/ent/dialect"
	_ "github.com/mattn/go-sqlite3"
	"github.com/shopspring/decimal"
)

func TestProductSKUSchemaLinksCoreProductFlows(t *testing.T) {
	ctx := context.Background()
	client := enttest.Open(t, dialect.SQLite, "file:product_sku_schema?mode=memory&cache=shared&_fk=1")
	defer mustCloseEntClient(t, client)

	unit := createTestUnit(t, ctx, client, "PCS-SKU")
	product := createTestProduct(t, ctx, client, unit.ID, "PRD-SKU-001")
	customer := client.Customer.Create().
		SetCode("CUS-SKU-001").
		SetName("SKU 测试客户").
		SaveX(ctx)
	warehouse := createTestWarehouse(t, ctx, client, "SKU-WH-01")

	sku := client.ProductSKU.Create().
		SetProductID(product.ID).
		SetSkuCode("SKU-001-RED-S").
		SetSkuName("红色小号").
		SetBarcode("690000000001").
		SetCustomerSku("CUST-SKU-RED-S").
		SetColor("红色").
		SetColorNo("RED-01").
		SetSize("S").
		SetPackagingVersion("BOX-A").
		SetDefaultUnitID(unit.ID).
		SaveX(ctx)

	if _, err := client.ProductSKU.Create().
		SetProductID(product.ID).
		SetSkuCode("SKU-001-RED-S").
		Save(ctx); !ent.IsConstraintError(err) {
		t.Fatalf("expected duplicate sku_code to be rejected, got %v", err)
	}

	order := client.SalesOrder.Create().
		SetOrderNo("SO-SKU-001").
		SetCustomerID(customer.ID).
		SetCustomerSnapshot(map[string]any{"name": customer.Name}).
		SetOrderDate(time.Now()).
		SetLifecycleStatus("draft").
		SaveX(ctx)
	orderItem := client.SalesOrderItem.Create().
		SetSalesOrderID(order.ID).
		SetLineNo(1).
		SetProductID(product.ID).
		SetProductSkuID(sku.ID).
		SetUnitID(unit.ID).
		SetOrderedQuantity(decimal.NewFromInt(10)).
		SaveX(ctx)
	if got := orderItem.ProductSkuID; got == nil || *got != sku.ID {
		t.Fatalf("expected sales order item to reference sku %d, got %v", sku.ID, got)
	}

	lot := client.InventoryLot.Create().
		SetSubjectType("PRODUCT").
		SetSubjectID(product.ID).
		SetProductSkuID(sku.ID).
		SetLotNo("LOT-SKU-001").
		SaveX(ctx)
	if got := lot.ProductSkuID; got == nil || *got != sku.ID {
		t.Fatalf("expected inventory lot to reference sku %d, got %v", sku.ID, got)
	}

	shipment := client.Shipment.Create().
		SetShipmentNo("SHIP-SKU-001").
		SetStatus("DRAFT").
		SetIdempotencyKey("SHIP-SKU-001").
		SaveX(ctx)
	shipmentItem := client.ShipmentItem.Create().
		SetShipmentID(shipment.ID).
		SetSalesOrderItemID(orderItem.ID).
		SetProductID(product.ID).
		SetProductSkuID(sku.ID).
		SetWarehouseID(warehouse.ID).
		SetUnitID(unit.ID).
		SetInventoryLotID(lot.ID).
		SetQuantity(decimal.NewFromInt(2)).
		SaveX(ctx)
	if got := shipmentItem.ProductSkuID; got == nil || *got != sku.ID {
		t.Fatalf("expected shipment item to reference sku %d, got %v", sku.ID, got)
	}

	reservation := client.StockReservation.Create().
		SetReservationNo("RSV-SKU-001").
		SetSalesOrderID(order.ID).
		SetSalesOrderItemID(orderItem.ID).
		SetProductID(product.ID).
		SetProductSkuID(sku.ID).
		SetWarehouseID(warehouse.ID).
		SetUnitID(unit.ID).
		SetInventoryLotID(lot.ID).
		SetQuantity(decimal.NewFromInt(2)).
		SetIdempotencyKey("RSV-SKU-001").
		SaveX(ctx)
	if got := reservation.ProductSkuID; got == nil || *got != sku.ID {
		t.Fatalf("expected stock reservation to reference sku %d, got %v", sku.ID, got)
	}
}
