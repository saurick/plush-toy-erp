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
	err error
	ctx context.Context
}

func (r *traceInventoryRepo) PostPurchaseReceipt(ctx context.Context, id int) (*PurchaseReceipt, error) {
	r.ctx = ctx
	return &PurchaseReceipt{ID: id}, r.err
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
