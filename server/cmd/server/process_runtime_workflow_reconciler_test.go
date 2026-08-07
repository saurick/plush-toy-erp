package main

import (
	"context"
	"io"
	"testing"
	"time"

	"server/internal/biz"

	"github.com/go-kratos/kratos/v2/log"
)

type stubProcessRuntimeWorkflowSettlementRunner struct {
	calls   chan processRuntimeWorkflowSettlementCall
	results []*biz.ProcessLinkedWorkflowTaskReconcileResult
}

type processRuntimeWorkflowSettlementCall struct {
	afterID int
	limit   int
}

func (s *stubProcessRuntimeWorkflowSettlementRunner) ReconcilePendingLinkedWorkflowTasks(_ context.Context, afterID int, limit int) (*biz.ProcessLinkedWorkflowTaskReconcileResult, error) {
	s.calls <- processRuntimeWorkflowSettlementCall{afterID: afterID, limit: limit}
	if len(s.results) > 0 {
		result := s.results[0]
		s.results = s.results[1:]
		return result, nil
	}
	return &biz.ProcessLinkedWorkflowTaskReconcileResult{}, nil
}

func TestProcessRuntimeWorkflowReconcilerRunsImmediatelyAndStops(t *testing.T) {
	runner := &stubProcessRuntimeWorkflowSettlementRunner{calls: make(chan processRuntimeWorkflowSettlementCall, 1)}
	reconciler := newProcessRuntimeWorkflowReconciler(runner, log.NewStdLogger(io.Discard))
	reconciler.interval = time.Hour
	reconciler.timeout = time.Second
	reconciler.batch = 7

	if err := reconciler.Start(context.Background()); err != nil {
		t.Fatalf("start reconciler: %v", err)
	}
	select {
	case call := <-runner.calls:
		if call.afterID != 0 || call.limit != 7 {
			t.Fatalf("reconcile call = %#v, want after=0 limit=7", call)
		}
	case <-time.After(time.Second):
		t.Fatal("reconciler did not run immediately")
	}
	stopCtx, cancel := context.WithTimeout(context.Background(), time.Second)
	defer cancel()
	if err := reconciler.Stop(stopCtx); err != nil {
		t.Fatalf("stop reconciler: %v", err)
	}
}

func TestProcessRuntimeWorkflowReconcilerAdvancesPastFailedBatchAndWraps(t *testing.T) {
	runner := &stubProcessRuntimeWorkflowSettlementRunner{
		calls: make(chan processRuntimeWorkflowSettlementCall, 4),
		results: []*biz.ProcessLinkedWorkflowTaskReconcileResult{
			{
				Scanned:                   100,
				LastScannedWorkflowTaskID: 100,
				Failures: []biz.ProcessLinkedWorkflowTaskReconcileFailure{{
					WorkflowTaskID: 1,
				}},
			},
			{Scanned: 1, Reconciled: 1, LastScannedWorkflowTaskID: 101},
			{},
			{Scanned: 1, Reconciled: 1, LastScannedWorkflowTaskID: 1},
		},
	}
	reconciler := newProcessRuntimeWorkflowReconciler(runner, log.NewStdLogger(io.Discard))
	reconciler.timeout = time.Second
	reconciler.batch = 100

	for range 4 {
		reconciler.runOnce(context.Background())
	}

	wantAfterIDs := []int{0, 100, 101, 0}
	for index, wantAfterID := range wantAfterIDs {
		select {
		case call := <-runner.calls:
			if call.afterID != wantAfterID || call.limit != 100 {
				t.Fatalf("call %d = %#v, want after=%d limit=100", index, call, wantAfterID)
			}
		default:
			t.Fatalf("missing reconcile call %d", index)
		}
	}
}
