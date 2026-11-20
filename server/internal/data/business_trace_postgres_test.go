package data

import (
	"context"
	"errors"
	"io"
	"net"
	"os"
	"strings"
	"sync"
	"testing"

	"server/internal/biz"
	"server/internal/conf"
	"server/internal/data/model/ent"
	"server/internal/data/model/ent/inventorytxn"
	pkglogger "server/pkg/logger"

	"entgo.io/ent/dialect"
	entsql "entgo.io/ent/dialect/sql"
	"github.com/XSAM/otelsql"
	"github.com/go-kratos/kratos/v2/log"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/stdlib"
	"github.com/shopspring/decimal"
	"go.opentelemetry.io/otel"
	"go.opentelemetry.io/otel/codes"
	"go.opentelemetry.io/otel/exporters/otlp/otlptrace/otlptracehttp"
	"go.opentelemetry.io/otel/sdk/resource"
	sdktrace "go.opentelemetry.io/otel/sdk/trace"
	"go.opentelemetry.io/otel/sdk/trace/tracetest"
	semconv "go.opentelemetry.io/otel/semconv/v1.26.0"
	"go.opentelemetry.io/otel/trace"
)

// These tests use the production driver, business hooks and SQL trace options
// against the migrated disposable database. Fixtures and readback run outside
// the measured operation, so setup queries cannot satisfy the trace assertions.
func TestInventoryPostgresBusinessTrace(t *testing.T) {
	if os.Getenv("INVENTORY_PG_TEST") != "1" {
		t.Skip("requires the disposable PostgreSQL integration environment")
	}
	dsn := os.Getenv("INVENTORY_PG_TEST_DB_URL")
	if dsn == "" {
		t.Fatal("INVENTORY_PG_TEST_DB_URL is required")
	}
	recorder := tracetest.NewSpanRecorder()
	options := []sdktrace.TracerProviderOption{
		sdktrace.WithSpanProcessor(recorder), sdktrace.WithSampler(sdktrace.AlwaysSample()),
		sdktrace.WithResource(resource.NewSchemaless(semconv.ServiceNameKey.String("plush-business-trace-verification"))),
	}
	if endpoint := os.Getenv("BUSINESS_TRACE_OTLP_ENDPOINT"); endpoint != "" {
		host, _, err := net.SplitHostPort(endpoint)
		if err != nil || net.ParseIP(host) == nil || !net.ParseIP(host).IsLoopback() {
			t.Fatal("trace verification exporter must use an isolated loopback collector")
		}
		exporter, err := otlptracehttp.New(context.Background(), otlptracehttp.WithEndpoint(endpoint), otlptracehttp.WithInsecure())
		if err != nil {
			t.Fatal(err)
		}
		options = append(options, sdktrace.WithBatcher(exporter))
	}
	tp := sdktrace.NewTracerProvider(options...)
	previous := otel.GetTracerProvider()
	otel.SetTracerProvider(tp)
	t.Cleanup(func() {
		if err := tp.Shutdown(context.Background()); err != nil {
			t.Error(err)
		}
		otel.SetTracerProvider(previous)
	})
	t.Run("production_connection", func(t *testing.T) {
		d, cleanup, err := NewData(&conf.Data{Postgres: &conf.Data_Postgres{Dsn: dsn}}, log.NewStdLogger(io.Discard))
		if err != nil {
			t.Fatal(err)
		}
		t.Cleanup(cleanup)
		ctx, parent := tp.Tracer("verification").Start(context.Background(), "verification.production_connection")
		var result int
		err = d.SQLDB().QueryRowContext(ctx, "SELECT 1").Scan(&result)
		parent.End()
		if err != nil {
			t.Fatal(err)
		}
		if result != 1 {
			t.Fatalf("production NewData query returned %d, want 1", result)
		}
		for _, span := range recorder.Ended() {
			if span.Name() == "sql.conn.query" && span.SpanContext().TraceID() == parent.SpanContext().TraceID() && span.Parent().SpanID() == parent.SpanContext().SpanID() {
				return
			}
		}
		t.Fatal("production NewData query has no SQL child span")
	})
	config, err := pgx.ParseConfig(dsn)
	if err != nil {
		t.Fatal("invalid disposable PostgreSQL configuration")
	}
	writes := &businessTraceWriteRecorder{}
	config.Tracer = writes
	db := otelsql.OpenDB(stdlib.GetConnector(*config), otelsql.WithSpanOptions(postgresSQLSpanOptions()))
	client := newBusinessEntClient(ent.Driver(entsql.OpenDB(dialect.Postgres, db)))
	t.Cleanup(func() { _ = client.Close() })
	d := &Data{postgres: client, sqldb: db, sqlDialect: dialect.Postgres}
	h := businessTracePostgresHarness{data: d, client: client, tp: tp, recorder: recorder, writes: writes}
	t.Run("purchase_receipt_access", func(t *testing.T) { h.purchaseReceipt(t, false) })
	t.Run("purchase_receipt_process", func(t *testing.T) { h.purchaseReceipt(t, true) })
	t.Run("shipment_actor", func(t *testing.T) { h.shipment(t, false) })
	t.Run("shipment_process", func(t *testing.T) { h.shipment(t, true) })
	t.Run("finance_receipt", func(t *testing.T) { h.payment(t, biz.FinanceFactReceivable) })
	t.Run("finance_payment", func(t *testing.T) { h.payment(t, biz.FinanceFactPayable) })
	if err := tp.ForceFlush(context.Background()); err != nil {
		t.Fatal(err)
	}
}

type businessTracePostgresHarness struct {
	data     *Data
	client   *ent.Client
	tp       *sdktrace.TracerProvider
	recorder *tracetest.SpanRecorder
	writes   *businessTraceWriteRecorder
}

type businessTraceWrite struct {
	operation string
	span      trace.SpanContext
}

// Observe writes below otelsql's parent filter: a write with a lost context
// emits no SQL span, but must still fail this test. Never retain SQL or args.
type businessTraceWriteRecorder struct {
	mu     sync.Mutex
	writes []businessTraceWrite
}

func (r *businessTraceWriteRecorder) TraceQueryStart(ctx context.Context, _ *pgx.Conn, data pgx.TraceQueryStartData) context.Context {
	fields := strings.Fields(data.SQL)
	if len(fields) > 0 {
		switch operation := strings.ToUpper(fields[0]); operation {
		case "INSERT", "UPDATE", "DELETE":
			r.mu.Lock()
			r.writes = append(r.writes, businessTraceWrite{operation: operation, span: trace.SpanContextFromContext(ctx)})
			r.mu.Unlock()
		}
	}
	return ctx
}

func (*businessTraceWriteRecorder) TraceQueryEnd(context.Context, *pgx.Conn, pgx.TraceQueryEndData) {}

func (r *businessTraceWriteRecorder) take() []businessTraceWrite {
	r.mu.Lock()
	defer r.mu.Unlock()
	writes := r.writes
	r.writes = nil
	return writes
}

func (h *businessTracePostgresHarness) check(t *testing.T, label, operation string, wantErr error, requireWrites bool, call func(context.Context) error) {
	t.Helper()
	ctx := pkglogger.WithRequestID(context.Background(), "business-trace-"+postgresTestSuffix())
	ctx, parent := h.tp.Tracer("verification").Start(ctx, "verification."+label)
	h.writes.take()
	err := call(ctx)
	writes := h.writes.take()
	parent.End()
	if !errors.Is(err, wantErr) {
		t.Fatalf("%s error=%v want=%v", label, err, wantErr)
	}
	var business sdktrace.ReadOnlySpan
	spans := h.recorder.Ended()
	byID := make(map[trace.SpanID]sdktrace.ReadOnlySpan)
	for _, span := range spans {
		if span.SpanContext().TraceID() != parent.SpanContext().TraceID() {
			continue
		}
		byID[span.SpanContext().SpanID()] = span
		if span.Name() == operation && span.Parent().SpanID() == parent.SpanContext().SpanID() {
			business = span
		}
		for _, attr := range span.Attributes() {
			if strings.Contains(string(attr.Key), "statement") || strings.Contains(string(attr.Key), "query.text") || strings.Contains(attr.Value.AsString(), "private-trace-") {
				t.Fatalf("%s leaked SQL or fixture payload", label)
			}
		}
	}
	if business == nil {
		t.Fatalf("%s has no request child %s", label, operation)
	}
	wantStatus := codes.Ok
	if wantErr != nil {
		wantStatus = codes.Error
	}
	if business.Status().Code != wantStatus {
		t.Fatalf("%s trace status=%v", label, business.Status())
	}
	sqlChildren := 0
	for _, span := range spans {
		if span.SpanContext().TraceID() == parent.SpanContext().TraceID() && span.Parent().SpanID() == business.SpanContext().SpanID() && strings.HasPrefix(span.Name(), "sql.") {
			sqlChildren++
		}
	}
	if sqlChildren == 0 {
		t.Fatalf("%s has no SQL children", label)
	}
	if requireWrites && len(writes) == 0 {
		t.Fatalf("%s observed no business writes", label)
	}
	for _, write := range writes {
		span := byID[write.span.SpanID()]
		if !write.span.IsValid() || write.span.TraceID() != parent.SpanContext().TraceID() || span == nil || !strings.HasPrefix(span.Name(), "sql.") {
			t.Fatalf("%s %s write lost its SQL trace context", label, write.operation)
		}
		for span != nil && span.SpanContext().SpanID() != business.SpanContext().SpanID() {
			span = byID[span.Parent().SpanID()]
		}
		if span == nil {
			t.Fatalf("%s %s write is outside the business span", label, write.operation)
		}
	}
	t.Logf("business_trace label=%s trace_id=%s operation=%s sql_children=%d sql_writes=%d", label, parent.SpanContext().TraceID(), operation, sqlChildren, len(writes))
}

func (h *businessTracePostgresHarness) command(t *testing.T, key, refType string, refID, actorID int, payload map[string]any) (*biz.ProcessRuntimeUsecase, *biz.ProcessDomainCommandExecution) {
	t.Helper()
	ctx := context.Background()
	repo := NewProcessRuntimeRepo(h.data, log.NewStdLogger(io.Discard))
	suffix := postgresTestSuffix()
	instance, nodes, err := repo.CreateProcessInstance(ctx, &biz.ProcessInstanceCreate{
		ProcessKey: "trace_verification_" + suffix, ProcessVersion: "v1", ConfigRevision: "trace-verification",
		DefinitionHash: "sha256:trace-verification-" + suffix, BusinessRefType: refType, BusinessRefID: refID,
		IdempotencyKey: "trace-process/" + suffix, Status: biz.ProcessStatusActive,
		Nodes: []biz.ProcessNodeInstanceCreate{{NodeKey: "execute", NodeType: biz.ProcessNodeTypeDomainCommand, Attempt: 1, Status: biz.ProcessNodeStatusWaiting, PolicySnapshot: map[string]any{"command_key": key}}},
	}, actorID)
	if err != nil {
		t.Fatal(err)
	}
	node := activateProcessNodeForTest(t, ctx, repo, instance, nodes[0])
	uc := biz.NewProcessRuntimeUsecase(repo, NewWorkflowRepo(h.data, log.NewStdLogger(io.Discard)))
	return uc, &biz.ProcessDomainCommandExecution{ProcessInstanceID: instance.ID, ProcessNodeInstanceID: node.ID, ExpectedVersion: node.Version, CommandKey: key, IdempotencyKey: "trace-command/" + suffix, Payload: payload}
}

func (h *businessTracePostgresHarness) purchaseReceipt(t *testing.T, process bool) {
	ctx := context.Background()
	f := createPurchaseReceiptPostgresFixtures(t, ctx, h.client)
	uc := biz.NewInventoryUsecase(NewInventoryRepo(h.data, log.NewStdLogger(io.Discard)))
	receipt, err := uc.CreatePurchaseReceiptDraft(ctx, &biz.PurchaseReceiptCreate{ReceiptNo: "TRACE-PR-" + f.suffix, SupplierName: "private-trace-supplier"})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := uc.AddPurchaseReceiptItem(ctx, &biz.PurchaseReceiptItemCreate{ReceiptID: receipt.ID, MaterialID: f.materialID, WarehouseID: f.warehouseID, UnitID: f.unitID, Quantity: decimal.NewFromInt(10), IdempotencyKey: "trace-line/" + f.suffix}); err != nil {
		t.Fatal(err)
	}
	call := func(ctx context.Context) error {
		_, err := uc.PostPurchaseReceiptForAccess(ctx, receipt.ID, biz.WarehouseDataScope{Mode: biz.DataScopeModeAssigned, WarehouseIDs: []int{f.warehouseID}})
		return err
	}
	operation := "inventory.post_purchase_receipt"
	if process {
		runtime, input := h.command(t, biz.ProcessDomainCommandInventoryPostInbound, "purchase_receipt", receipt.ID, 7, map[string]any{"purchase_receipt_id": receipt.ID})
		if err := biz.RegisterInventoryProcessDomainCommandHandlers(runtime, uc); err != nil {
			t.Fatal(err)
		}
		scope := biz.WarehouseDataScope{Mode: biz.DataScopeModeAll}
		input.WarehouseScope = &scope
		call = func(ctx context.Context) error { _, err := runtime.ExecuteDomainCommandNode(ctx, input, 7); return err }
		operation = "process." + biz.ProcessDomainCommandInventoryPostInbound
	}
	h.check(t, t.Name()+"_quality_pending", operation, biz.ErrPurchaseReceiptQualityPending, false, call)
	if got := h.client.PurchaseReceipt.GetX(ctx, receipt.ID); got.Status != biz.PurchaseReceiptStatusDraft {
		t.Fatal("rejected receipt was posted")
	}
	passAllPurchaseReceiptQualityInspections(t, ctx, uc, receipt.ID)
	h.check(t, t.Name()+"_success", operation, nil, true, call)
	h.check(t, t.Name()+"_replay", operation, nil, false, call)
	if got := h.client.PurchaseReceipt.GetX(ctx, receipt.ID); got.Status != biz.PurchaseReceiptStatusPosted {
		t.Fatal("receipt not posted")
	}
	if count := h.client.InventoryTxn.Query().Where(inventorytxn.SourceType(biz.PurchaseReceiptSourceType), inventorytxn.SourceID(receipt.ID), inventorytxn.TxnType(biz.InventoryTxnIn)).CountX(ctx); count != 1 {
		t.Fatalf("receipt IN count=%d", count)
	}
}

func (h *businessTracePostgresHarness) shipment(t *testing.T, process bool) {
	ctx := context.Background()
	f := createInventoryPostgresFixtures(t, ctx, h.client)
	repo := NewOperationalFactRepo(h.data, log.NewStdLogger(io.Discard))
	uc := biz.NewOperationalFactUsecase(repo)
	actor := h.client.AdminUser.Create().SetUsername("trace-ship-" + f.suffix).SetPasswordHash("test-password-hash").SaveX(ctx)
	item, err := uc.CreateShipmentDraftWithItems(ctx, &biz.ShipmentCreateWithItems{Shipment: &biz.ShipmentCreate{ShipmentNo: "TRACE-SHIP-" + f.suffix, IdempotencyKey: "trace-ship/" + f.suffix}, Items: []*biz.ShipmentItemCreate{{ProductID: f.productID, WarehouseID: f.productWarehouseID, UnitID: f.unitID, Quantity: decimal.NewFromInt(2)}}})
	if err != nil {
		t.Fatal(err)
	}
	submitAndCompleteShipmentReleaseTaskForTest(t, ctx, h.data, h.client, item.ID)
	operation := "shipment.ship"
	call := func(ctx context.Context) error {
		_, err := uc.ShipShipmentWithActor(ctx, item.ID, actor.ID)
		return err
	}
	if process {
		runtime, input := h.command(t, biz.ProcessDomainCommandShipmentShip, "shipment", item.ID, actor.ID, map[string]any{"shipment_id": item.ID})
		if err := biz.RegisterShipmentProcessDomainCommandHandlers(runtime, uc); err != nil {
			t.Fatal(err)
		}
		call = func(ctx context.Context) error {
			_, err := runtime.ExecuteDomainCommandNode(ctx, input, actor.ID)
			return err
		}
		operation = "process." + biz.ProcessDomainCommandShipmentShip
	}
	h.check(t, t.Name()+"_insufficient_stock", operation, biz.ErrInventoryInsufficientStock, false, call)
	if h.client.Shipment.GetX(ctx, item.ID).Status != biz.ShipmentStatusDraft {
		t.Fatal("failed shipment changed status")
	}
	_, err = NewInventoryRepo(h.data, log.NewStdLogger(io.Discard)).ApplyInventoryTxnAndUpdateBalance(ctx, &biz.InventoryTxnCreate{SubjectType: biz.InventorySubjectProduct, SubjectID: f.productID, WarehouseID: f.productWarehouseID, UnitID: f.unitID, TxnType: biz.InventoryTxnIn, Direction: 1, Quantity: decimal.NewFromInt(2), SourceType: "TRACE_FIXTURE", IdempotencyKey: "trace-stock/" + f.suffix})
	if err != nil {
		t.Fatal(err)
	}
	h.check(t, t.Name()+"_success", operation, nil, true, call)
	h.check(t, t.Name()+"_replay", operation, nil, false, call)
	if h.client.Shipment.GetX(ctx, item.ID).Status != biz.ShipmentStatusShipped {
		t.Fatal("shipment not shipped")
	}
	if count := h.client.InventoryTxn.Query().Where(inventorytxn.SourceType(biz.ShipmentSourceType), inventorytxn.SourceID(item.ID), inventorytxn.TxnType(biz.InventoryTxnOut)).CountX(ctx); count != 1 {
		t.Fatalf("shipment OUT count=%d", count)
	}
}

func (h *businessTracePostgresHarness) payment(t *testing.T, factType string) {
	ctx := context.Background()
	fact := createPostedFinanceFactForCreditType(t, ctx, h.data, h.client, factType)
	suffix := postgresTestSuffix()
	creator := h.client.AdminUser.Create().SetUsername("trace-payment-maker-" + suffix).SetPasswordHash("test-password-hash").SaveX(ctx)
	actor := h.client.AdminUser.Create().SetUsername("trace-payment-checker-" + suffix).SetPasswordHash("test-password-hash").SaveX(ctx)
	uc := biz.NewOperationalFactUsecase(NewOperationalFactRepo(h.data, log.NewStdLogger(io.Discard)))
	direction := biz.FinancePaymentDirectionReceipt
	if factType == biz.FinanceFactPayable {
		direction = biz.FinancePaymentDirectionDisbursement
	}
	payment, err := uc.CreateFinancePayment(ctx, &biz.FinancePaymentCreate{PaymentNo: "TRACE-PAY-" + suffix, Direction: direction, CounterpartyType: fact.CounterpartyType, CounterpartyID: *fact.CounterpartyID, Amount: fact.Amount, Currency: fact.Currency, AccountRef: "private-trace-bank", EvidenceRef: "private-trace-evidence", IdempotencyKey: "trace-payment/" + suffix}, creator.ID)
	if err != nil {
		t.Fatal(err)
	}
	runtime, input := h.command(t, biz.ProcessDomainCommandFinancePaymentPost, "finance_payment", payment.ID, actor.ID, map[string]any{"finance_payment_id": payment.ID, "allocations": []any{map[string]any{"finance_fact_id": fact.ID, "amount": fact.Amount.String()}}})
	if err := biz.RegisterFinancePaymentProcessDomainCommandHandlers(runtime, uc); err != nil {
		t.Fatal(err)
	}
	call := func(ctx context.Context) error {
		_, err := runtime.ExecuteDomainCommandNode(ctx, input, actor.ID)
		return err
	}
	operation := "process." + biz.ProcessDomainCommandFinancePaymentPost
	h.check(t, t.Name()+"_approval_required", operation, biz.ErrBadParam, false, call)
	approval, approveInput := h.command(t, biz.ProcessDomainCommandFinancePaymentApprove, "finance_payment", payment.ID, actor.ID, map[string]any{"finance_payment_id": payment.ID, "reason": "private-trace-approval"})
	if err := biz.RegisterFinancePaymentProcessDomainCommandHandlers(approval, uc); err != nil {
		t.Fatal(err)
	}
	if _, err := approval.ExecuteDomainCommandNode(ctx, approveInput, actor.ID); err != nil {
		t.Fatal(err)
	}
	h.check(t, t.Name()+"_success", operation, nil, true, call)
	h.check(t, t.Name()+"_replay", operation, nil, false, call)
	posted, err := uc.GetFinancePayment(ctx, payment.ID)
	if err != nil || posted.Status != biz.FinancePaymentStatusPosted || len(posted.Allocations) != 1 {
		t.Fatalf("payment readback=%+v err=%v", posted, err)
	}
	if h.client.FinanceFact.GetX(ctx, fact.ID).Status != biz.OperationalFactStatusSettled {
		t.Fatal("finance fact not settled")
	}
}
