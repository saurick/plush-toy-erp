package biz

import (
	"context"
	"errors"
	"strings"
	"testing"

	"go.opentelemetry.io/otel"
	"go.opentelemetry.io/otel/codes"
	sdktrace "go.opentelemetry.io/otel/sdk/trace"
	"go.opentelemetry.io/otel/sdk/trace/tracetest"
	oteltrace "go.opentelemetry.io/otel/trace"
)

type traceInventoryRepo struct {
	InventoryRepo
	PurchaseReceiptAccessRepo
	err error
	ctx context.Context
}

func (r *traceInventoryRepo) PostPurchaseReceipt(ctx context.Context, id int) (*PurchaseReceipt, error) {
	r.ctx = ctx
	return &PurchaseReceipt{ID: id}, r.err
}

func (r *traceInventoryRepo) PostPurchaseReceiptForAccess(ctx context.Context, id int, scope WarehouseDataScope) (*PurchaseReceipt, error) {
	if !scope.Allows(3) {
		return nil, ErrDataScopeForbidden
	}
	return r.PostPurchaseReceipt(ctx, id)
}

func TestBusinessTraceWarehouseScopedReceiptKeepsParentAndFailure(t *testing.T) {
	previous := otel.GetTracerProvider()
	defer otel.SetTracerProvider(previous)
	for _, repoErr := range []error{nil, errors.New("private-customer-payload")} {
		recorder := tracetest.NewSpanRecorder()
		tp := sdktrace.NewTracerProvider(sdktrace.WithSpanProcessor(recorder))
		otel.SetTracerProvider(tp)
		ctx, parent := tp.Tracer("test.request").Start(context.Background(), "request")
		repo := &traceInventoryRepo{err: repoErr}
		_, err := NewInventoryUsecase(repo).PostPurchaseReceiptForAccess(ctx, 7, WarehouseDataScope{Mode: DataScopeModeAssigned, WarehouseIDs: []int{3}})
		if !errors.Is(err, repoErr) || oteltrace.SpanContextFromContext(repo.ctx).TraceID() != parent.SpanContext().TraceID() {
			t.Fatal("warehouse access entry lost the error or request context")
		}
		spans := recorder.Ended()
		if len(spans) != 1 || spans[0].Name() != "inventory.post_purchase_receipt" || spans[0].Parent().SpanID() != parent.SpanContext().SpanID() {
			t.Fatal("warehouse access entry has no request child span")
		}
		if (spans[0].Status().Code == codes.Error) != (repoErr != nil) || strings.Contains(spans[0].Status().Description, "private-") {
			t.Fatal("warehouse access failure is missing or leaked")
		}
		parent.End()
		_ = tp.Shutdown(context.Background())
	}
}

func TestBusinessTraceKeepsParentAndObservesRepositoryFailure(t *testing.T) {
	previous := otel.GetTracerProvider()
	defer otel.SetTracerProvider(previous)
	for _, failed := range []bool{false, true} {
		recorder := tracetest.NewSpanRecorder()
		tp := sdktrace.NewTracerProvider(sdktrace.WithSpanProcessor(recorder))
		otel.SetTracerProvider(tp)
		ctx, parent := tp.Tracer("test.request").Start(context.Background(), "request")
		repo := &traceInventoryRepo{}
		if failed {
			repo.err = errors.New("private-customer-payload")
		}
		got, err := NewInventoryUsecase(repo).PostPurchaseReceipt(ctx, 7)
		if got == nil || got.ID != 7 || !errors.Is(err, repo.err) {
			t.Fatal("tracing changed repository result")
		}
		if oteltrace.SpanContextFromContext(repo.ctx).TraceID() != parent.SpanContext().TraceID() {
			t.Fatal("repository context lost the operation trace")
		}
		spans := recorder.Ended()
		if len(spans) != 1 || spans[0].Name() != "inventory.post_purchase_receipt" || spans[0].Parent().SpanID() != parent.SpanContext().SpanID() {
			t.Fatal("business span is not a request child")
		}
		want := codes.Ok
		if failed {
			want = codes.Error
		}
		if spans[0].Status().Code != want || strings.Contains(spans[0].Status().Description, "private-") {
			t.Fatal("business failure is missing or leaked")
		}
		parent.End()
		_ = tp.Shutdown(context.Background())
	}
}

func TestBusinessTraceObservesEarlyValidationExit(t *testing.T) {
	previous := otel.GetTracerProvider()
	defer otel.SetTracerProvider(previous)
	recorder := tracetest.NewSpanRecorder()
	tp := sdktrace.NewTracerProvider(sdktrace.WithSpanProcessor(recorder))
	defer func() { _ = tp.Shutdown(context.Background()) }()
	otel.SetTracerProvider(tp)
	_, err := NewInventoryUsecase(nil).PostPurchaseReceipt(context.Background(), 0)
	if !errors.Is(err, ErrBadParam) {
		t.Fatal("validation changed")
	}
	spans := recorder.Ended()
	if len(spans) != 1 || spans[0].Status().Code != codes.Error {
		t.Fatal("early exit is invisible in trace")
	}
}

func TestBusinessTraceProcessCommandUsesRegisteredNameAndSafeFailure(t *testing.T) {
	previous := otel.GetTracerProvider()
	defer otel.SetTracerProvider(previous)
	for _, registered := range []bool{false, true} {
		recorder := tracetest.NewSpanRecorder()
		tp := sdktrace.NewTracerProvider(sdktrace.WithSpanProcessor(recorder))
		otel.SetTracerProvider(tp)
		key := ProcessDomainCommandFinancePaymentPost
		if !registered {
			key = "private-unregistered-command"
		}
		repo := &memProcessRuntimeRepo{
			process: &ProcessInstance{ID: 10},
			nodes:   []*ProcessNodeInstance{{ID: 20, ProcessInstanceID: 10, NodeType: ProcessNodeTypeDomainCommand, Status: ProcessNodeStatusActive, Version: 1, PolicySnapshot: map[string]any{"command_key": key}}},
		}
		uc := NewProcessRuntimeUsecase(repo, nil)
		wantErr := ErrProcessDomainCommandHandlerNotFound
		wantName := "process.execute_domain_command"
		if registered {
			wantErr = errors.New("private-validation-detail")
			if err := uc.RegisterDomainCommandHandler(key, &stubProcessDomainCommandHandler{validateErr: wantErr}); err != nil {
				t.Fatal(err)
			}
			wantName = "process." + key
		}
		ctx, parent := tp.Tracer("test.request").Start(context.Background(), "request")
		_, err := uc.ExecuteDomainCommandNode(ctx, &ProcessDomainCommandExecution{ProcessInstanceID: 10, ProcessNodeInstanceID: 20, ExpectedVersion: 1, IdempotencyKey: "private-intent", Payload: map[string]any{"reason": "private-payload"}}, 7)
		if !errors.Is(err, wantErr) {
			t.Fatalf("command error=%v want=%v", err, wantErr)
		}
		spans := recorder.Ended()
		if len(spans) != 1 || spans[0].Name() != wantName || spans[0].Status().Code != codes.Error || spans[0].Parent().SpanID() != parent.SpanContext().SpanID() {
			t.Fatal("command trace lost its registered name, parent or failure")
		}
		anchors := map[string]int64{}
		for _, attr := range spans[0].Attributes() {
			if strings.Contains(attr.Value.AsString(), "private-") {
				t.Fatal("command trace leaked payload or unregistered input")
			}
			anchors[string(attr.Key)] = attr.Value.AsInt64()
		}
		if anchors["process.instance_id"] != 10 || anchors["process.node_id"] != 20 || strings.Contains(spans[0].Status().Description, "private-") {
			t.Fatal("command anchors or safe failure description missing")
		}
		parent.End()
		_ = tp.Shutdown(context.Background())
	}
}
