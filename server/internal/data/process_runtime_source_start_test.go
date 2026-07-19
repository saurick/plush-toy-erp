package data

import (
	"context"
	"errors"
	"io"
	"testing"
	"time"

	"server/internal/biz"
	"server/internal/data/model/ent/enttest"
	"server/internal/data/model/ent/processinstance"

	"entgo.io/ent/dialect"
	"github.com/go-kratos/kratos/v2/log"
	_ "github.com/mattn/go-sqlite3"
)

func sourceBoundProcessCreate(processKey, refType string, refID int, idempotencyKey string) *biz.ProcessInstanceCreate {
	forged := "FORGED-SOURCE-NO"
	return &biz.ProcessInstanceCreate{
		ProcessKey:      processKey,
		ProcessVersion:  "v1",
		ConfigRevision:  "source-start-rev",
		DefinitionHash:  "sha256:source-start",
		BusinessRefType: refType,
		BusinessRefID:   refID,
		BusinessRefNo:   &forged,
		IdempotencyKey:  idempotencyKey,
		Status:          biz.ProcessStatusActive,
		Nodes: []biz.ProcessNodeInstanceCreate{{
			NodeKey: "start", NodeType: biz.ProcessNodeTypeDomainCommand, Attempt: 1,
			Status: biz.ProcessNodeStatusWaiting, PolicySnapshot: map[string]any{"command_key": "source.start"},
		}},
	}
}

func TestProcessRuntimeSourceCreateCanonicalizesAndLimitsAdvancedStateToReplay(t *testing.T) {
	ctx := context.Background()
	client := enttest.Open(t, dialect.SQLite, "file:process_runtime_source_start?mode=memory&cache=shared&_fk=1")
	defer mustCloseEntClient(t, client)
	repo := NewProcessRuntimeRepo(&Data{postgres: client, sqlDialect: dialect.SQLite}, log.NewStdLogger(io.Discard))
	suffix := postgresTestSuffix()
	customer := createSalesOrderTestCustomer(t, ctx, client, "SRC-"+suffix, true)
	order := client.SalesOrder.Create().
		SetOrderNo("SO-SOURCE-" + suffix).
		SetCustomerID(customer.ID).
		SetOrderDate(time.Now().UTC()).
		SetLifecycleStatus(biz.SalesOrderStatusDraft).
		SaveX(ctx)
	in := sourceBoundProcessCreate(biz.ProcessKeySalesOrderAcceptance, "sales_order", order.ID, "source-start/"+suffix)

	created, _, err := repo.CreateProcessInstanceFromSource(ctx, in, 7)
	if err != nil {
		t.Fatalf("atomic source create: %v", err)
	}
	if created.BusinessRefNo == nil || *created.BusinessRefNo != order.OrderNo {
		t.Fatalf("business ref no = %#v, want canonical %q", created.BusinessRefNo, order.OrderNo)
	}
	client.SalesOrder.UpdateOneID(order.ID).SetLifecycleStatus(biz.SalesOrderStatusSubmitted).SaveX(ctx)
	replayed, _, err := repo.CreateProcessInstanceFromSource(ctx, in, 7)
	if err != nil || replayed.ID != created.ID {
		t.Fatalf("submitted exact replay = %#v, %v", replayed, err)
	}
	changedKey := *in
	changedKey.IdempotencyKey += "/changed"
	if _, _, err := repo.CreateProcessInstanceFromSource(ctx, &changedKey, 7); !errors.Is(err, biz.ErrProcessInstanceExists) {
		t.Fatalf("different key error = %v, want process exists", err)
	}

	advanced := client.SalesOrder.Create().
		SetOrderNo("SO-ADVANCED-" + suffix).
		SetCustomerID(customer.ID).
		SetOrderDate(time.Now().UTC()).
		SetLifecycleStatus(biz.SalesOrderStatusSubmitted).
		SaveX(ctx)
	if _, _, err := repo.CreateProcessInstanceFromSource(ctx, sourceBoundProcessCreate(
		biz.ProcessKeySalesOrderAcceptance, "sales_order", advanced.ID, "source-start/advanced/"+suffix,
	), 7); !errors.Is(err, biz.ErrBadParam) {
		t.Fatalf("new submitted source error = %v, want bad param", err)
	}
}

func TestProcessSourceStatusAllowedSeparatesNewStartFromReplay(t *testing.T) {
	tests := []struct {
		name     string
		process  string
		refType  string
		status   string
		newStart bool
		replay   bool
	}{
		{name: "sales draft", process: biz.ProcessKeySalesOrderAcceptance, refType: "sales_order", status: biz.SalesOrderStatusDraft, newStart: true, replay: true},
		{name: "sales submitted replay", process: biz.ProcessKeySalesOrderAcceptance, refType: "sales_order", status: biz.SalesOrderStatusSubmitted, replay: true},
		{name: "purchase approved", process: biz.ProcessKeyMaterialSupply, refType: "purchase_order", status: biz.PurchaseOrderStatusApproved, newStart: true, replay: true},
		{name: "shipment draft", process: biz.ProcessKeyFinishedGoodsDelivery, refType: "shipment", status: biz.ShipmentStatusDraft, newStart: true, replay: true},
		{name: "shipment shipped replay", process: biz.ProcessKeyFinishedGoodsDelivery, refType: "shipment", status: biz.ShipmentStatusShipped, replay: true},
		{name: "shipment cancelled", process: biz.ProcessKeyFinishedGoodsDelivery, refType: "shipment", status: biz.ShipmentStatusCancelled},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			in := &biz.ProcessInstanceCreate{ProcessKey: tt.process, BusinessRefType: tt.refType}
			if got := processSourceStatusAllowed(in, tt.status, false); got != tt.newStart {
				t.Fatalf("new start allowed = %v, want %v", got, tt.newStart)
			}
			if got := processSourceStatusAllowed(in, tt.status, true); got != tt.replay {
				t.Fatalf("replay allowed = %v, want %v", got, tt.replay)
			}
		})
	}
}

func TestProcessRuntimePostgresSourceTransitionCannotDriftIntoProcessCreate(t *testing.T) {
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()
	data, client := openPurchaseReceiptPostgresTestData(t)
	repo := NewProcessRuntimeRepo(data, log.NewStdLogger(io.Discard))
	suffix := postgresTestSuffix()
	customer := createSalesOrderTestCustomer(t, ctx, client, "SRC-PG-"+suffix, true)
	order := client.SalesOrder.Create().
		SetOrderNo("SO-SOURCE-PG-" + suffix).
		SetCustomerID(customer.ID).
		SetOrderDate(time.Now().UTC()).
		SetLifecycleStatus(biz.SalesOrderStatusDraft).
		SaveX(ctx)
	in := sourceBoundProcessCreate(biz.ProcessKeySalesOrderAcceptance, "sales_order", order.ID, "source-start-pg/"+suffix)

	transition, err := data.sqldb.BeginTx(ctx, nil)
	if err != nil {
		t.Fatalf("begin source transition: %v", err)
	}
	if _, err := transition.ExecContext(ctx, "SELECT id FROM sales_orders WHERE id = $1 FOR UPDATE", order.ID); err != nil {
		t.Fatalf("lock source transition: %v", err)
	}
	result := make(chan error, 1)
	go func() {
		_, _, createErr := repo.CreateProcessInstanceFromSource(ctx, in, 7)
		result <- createErr
	}()
	if _, err := transition.ExecContext(ctx, "UPDATE sales_orders SET lifecycle_status = $1 WHERE id = $2", biz.SalesOrderStatusClosed, order.ID); err != nil {
		t.Fatalf("advance source while start waits: %v", err)
	}
	if err := transition.Commit(); err != nil {
		t.Fatalf("commit source transition: %v", err)
	}
	if createErr := <-result; !errors.Is(createErr, biz.ErrBadParam) {
		t.Fatalf("atomic start after concurrent source transition error = %v, want bad param", createErr)
	}
	if count := client.ProcessInstance.Query().Where(
		processinstance.ProcessKey(biz.ProcessKeySalesOrderAcceptance),
		processinstance.BusinessRefType("sales_order"),
		processinstance.BusinessRefID(order.ID),
	).CountX(ctx); count != 0 {
		t.Fatalf("invalid concurrent source created %d process instances", count)
	}
}
