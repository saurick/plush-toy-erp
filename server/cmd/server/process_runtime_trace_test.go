package main

import (
	"context"
	"errors"
	"io"
	"strings"
	"testing"

	"server/internal/biz"

	"github.com/go-kratos/kratos/v2/log"
	"go.opentelemetry.io/otel"
	"go.opentelemetry.io/otel/codes"
	sdktrace "go.opentelemetry.io/otel/sdk/trace"
	"go.opentelemetry.io/otel/sdk/trace/tracetest"
	oteltrace "go.opentelemetry.io/otel/trace"
)

type tracedSettlementRunner struct {
	contexts []context.Context
	failed   bool
}

func (r *tracedSettlementRunner) ReconcilePendingLinkedWorkflowTasks(ctx context.Context, _, _ int) (*biz.ProcessLinkedWorkflowTaskReconcileResult, error) {
	r.contexts = append(r.contexts, ctx)
	if r.failed {
		return nil, errors.New("private-workflow-error")
	}
	return &biz.ProcessLinkedWorkflowTaskReconcileResult{}, nil
}

func (r *tracedSettlementRunner) ReconcilePendingProcessRuntimeNodes(ctx context.Context, _, _ int) (*biz.ProcessRuntimeNodeReconcileResult, error) {
	r.contexts = append(r.contexts, ctx)
	if r.failed {
		return &biz.ProcessRuntimeNodeReconcileResult{Scanned: 1, LastScannedProcessNodeID: 1, Failures: []biz.ProcessRuntimeNodeReconcileFailure{{Err: errors.New("private-node-error")}}}, nil
	}
	return &biz.ProcessRuntimeNodeReconcileResult{}, nil
}

func TestProcessRuntimeTraceCorrelatesBackgroundOperationsAndFailures(t *testing.T) {
	previous := otel.GetTracerProvider()
	defer otel.SetTracerProvider(previous)
	for _, failed := range []bool{false, true} {
		recorder := tracetest.NewSpanRecorder()
		tp := sdktrace.NewTracerProvider(sdktrace.WithSpanProcessor(recorder))
		otel.SetTracerProvider(tp)
		runner := &tracedSettlementRunner{failed: failed}
		r := newProcessRuntimeWorkflowReconciler(runner, log.NewStdLogger(io.Discard))
		r.runOnce(context.Background())
		spans := recorder.Ended()
		if len(spans) != 2 || len(runner.contexts) != 2 {
			t.Fatal("background operations have no trace boundaries")
		}
		for i, span := range spans {
			if !strings.HasPrefix(span.Name(), "background.process_runtime.reconcile_") || span.SpanContext().TraceID() != oteltrace.SpanContextFromContext(runner.contexts[i]).TraceID() {
				t.Fatal("background SQL cannot follow its operation")
			}
			want := codes.Ok
			if failed {
				want = codes.Error
			}
			if span.Status().Code != want || strings.Contains(span.Status().Description, "private-") {
				t.Fatal("background failure is missing or leaked")
			}
		}
		_ = tp.Shutdown(context.Background())
	}
}
