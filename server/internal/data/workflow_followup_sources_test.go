package data

import (
	"context"
	"errors"
	"io"
	"testing"
	"time"

	"entgo.io/ent/dialect"
	"github.com/go-kratos/kratos/v2/log"
	"server/internal/biz"
	"server/internal/data/model/ent/enttest"
)

func TestWorkflowFollowupSourcesReadCanonicalNumbersAndStates(t *testing.T) {
	ctx := context.Background()
	client := enttest.Open(t, dialect.SQLite, "file:followup_sources?mode=memory&cache=shared&_fk=1")
	defer mustCloseEntClient(t, client)
	uc := biz.NewWorkflowUsecase(NewWorkflowRepo(&Data{postgres: client, sqlDialect: dialect.SQLite}, log.NewStdLogger(io.Discard)))
	supplier := createPurchaseOrderTestSupplier(t, ctx, client, "FOLLOWUP-S", true)
	purchase := client.PurchaseOrder.Create().SetPurchaseOrderNo("PO-FOLLOWUP").SetSupplierID(supplier.ID).SetPurchaseDate(time.Now()).SaveX(ctx)
	outsourcing := client.OutsourcingOrder.Create().SetOutsourcingOrderNo("OS-FOLLOWUP").SetSupplierID(supplier.ID).SetOrderDate(time.Now()).SaveX(ctx)
	actor := client.AdminUser.Create().SetUsername("followup_reader").SetPasswordHash("hash").SaveX(ctx)
	production := client.ProductionOrder.Create().SetOrderNo("MO-FOLLOWUP").SetCreatedBy(actor.ID).SaveX(ctx)
	shipment := client.Shipment.Create().SetShipmentNo("SH-FOLLOWUP").SetIdempotencyKey("followup-shipment").SaveX(ctx)
	for _, tc := range []struct {
		kind       string
		id         int
		no, status string
	}{
		{"purchase_order", purchase.ID, purchase.PurchaseOrderNo, "draft"},
		{"outsourcing_order", outsourcing.ID, outsourcing.OutsourcingOrderNo, "draft"},
		{"production_order", production.ID, production.OrderNo, "DRAFT"},
		{"shipment", shipment.ID, shipment.ShipmentNo, "DRAFT"},
	} {
		source, err := uc.GetFollowupSource(ctx, tc.kind, tc.id)
		if err != nil || source.No != tc.no || source.Status != tc.status || source.Type != tc.kind || source.ID != tc.id {
			t.Fatalf("source %s: %#v %v", tc.kind, source, err)
		}
		if _, err = uc.GetFollowupSource(ctx, tc.kind, 999); !errors.Is(err, biz.ErrWorkflowTaskNotFound) {
			t.Fatalf("missing source %s: %v", tc.kind, err)
		}
	}
}
