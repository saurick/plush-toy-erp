package main

import (
	"context"
	"fmt"
	"sync"
	"time"

	"server/internal/biz"

	"github.com/go-kratos/kratos/v2/log"
)

const (
	processRuntimeWorkflowReconcileInterval = 30 * time.Second
	processRuntimeWorkflowReconcileTimeout  = 10 * time.Second
	processRuntimeWorkflowReconcileBatch    = biz.ProcessLinkedWorkflowTaskReconcileMaxLimit
)

type processRuntimeWorkflowSettlementRunner interface {
	ReconcilePendingLinkedWorkflowTasks(context.Context, int, int) (*biz.ProcessLinkedWorkflowTaskReconcileResult, error)
}

type processRuntimeWorkflowReconciler struct {
	runner   processRuntimeWorkflowSettlementRunner
	log      *log.Helper
	interval time.Duration
	timeout  time.Duration
	batch    int
	afterID  int

	mu     sync.Mutex
	cancel context.CancelFunc
	done   chan struct{}
}

func newProcessRuntimeWorkflowReconciler(runner processRuntimeWorkflowSettlementRunner, logger log.Logger) *processRuntimeWorkflowReconciler {
	return &processRuntimeWorkflowReconciler{
		runner:   runner,
		log:      log.NewHelper(log.With(logger, "module", "process_runtime_workflow_reconciler")),
		interval: processRuntimeWorkflowReconcileInterval,
		timeout:  processRuntimeWorkflowReconcileTimeout,
		batch:    processRuntimeWorkflowReconcileBatch,
	}
}

func (r *processRuntimeWorkflowReconciler) Start(ctx context.Context) error {
	if r == nil || r.runner == nil || r.log == nil || r.interval <= 0 || r.timeout <= 0 || r.batch < 1 || r.batch > biz.ProcessLinkedWorkflowTaskReconcileMaxLimit {
		return fmt.Errorf("invalid process runtime workflow reconciler configuration")
	}
	r.mu.Lock()
	defer r.mu.Unlock()
	if r.cancel != nil {
		return nil
	}
	baseCtx := context.Background()
	if ctx != nil {
		baseCtx = context.WithoutCancel(ctx)
	}
	runCtx, cancel := context.WithCancel(baseCtx)
	done := make(chan struct{})
	r.cancel = cancel
	r.done = done
	go r.loop(runCtx, done)
	r.log.Infow(
		"msg", "process runtime workflow reconciliation started",
		"component", "process_runtime_workflow_reconciler",
		"interval_ms", r.interval.Milliseconds(),
		"batch_limit", r.batch,
	)
	return nil
}

func (r *processRuntimeWorkflowReconciler) Stop(ctx context.Context) error {
	if r == nil {
		return nil
	}
	r.mu.Lock()
	cancel := r.cancel
	done := r.done
	r.mu.Unlock()
	if cancel == nil || done == nil {
		return nil
	}
	cancel()
	if ctx == nil {
		ctx = context.Background()
	}
	select {
	case <-done:
		r.mu.Lock()
		if r.done == done {
			r.cancel = nil
			r.done = nil
		}
		r.mu.Unlock()
		r.log.Infow(
			"msg", "process runtime workflow reconciliation stopped",
			"component", "process_runtime_workflow_reconciler",
		)
		return nil
	case <-ctx.Done():
		return ctx.Err()
	}
}

func (r *processRuntimeWorkflowReconciler) loop(ctx context.Context, done chan<- struct{}) {
	defer close(done)
	r.runOnce(ctx)
	ticker := time.NewTicker(r.interval)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			r.runOnce(ctx)
		}
	}
}

func (r *processRuntimeWorkflowReconciler) runOnce(ctx context.Context) {
	runCtx, cancel := context.WithTimeout(ctx, r.timeout)
	defer cancel()
	afterID := r.afterID
	result, err := r.runner.ReconcilePendingLinkedWorkflowTasks(runCtx, afterID, r.batch)
	if err != nil {
		r.log.Errorw(
			"msg", "process runtime workflow reconciliation failed",
			"component", "process_runtime_workflow_reconciler",
			"err", err,
		)
		return
	}
	if result == nil {
		r.log.Errorw(
			"msg", "process runtime workflow reconciliation returned no result",
			"component", "process_runtime_workflow_reconciler",
		)
		return
	}
	if result.Scanned == 0 {
		if afterID > 0 {
			r.afterID = 0
		}
		return
	}
	if result.LastScannedWorkflowTaskID <= afterID {
		r.log.Errorw(
			"msg", "process runtime workflow reconciliation returned an invalid cursor",
			"component", "process_runtime_workflow_reconciler",
			"after_workflow_task_id", afterID,
			"last_scanned_workflow_task_id", result.LastScannedWorkflowTaskID,
		)
		return
	}
	r.afterID = result.LastScannedWorkflowTaskID
	for _, failure := range result.Failures {
		r.log.Errorw(
			"msg", "process runtime workflow settlement failed",
			"component", "process_runtime_workflow_reconciler",
			"workflow_task_id", failure.WorkflowTaskID,
			"process_instance_id", failure.ProcessInstanceID,
			"process_node_instance_id", failure.ProcessNodeInstanceID,
			"err", failure.Err,
		)
	}
	fields := []any{
		"msg", "process runtime workflow reconciliation completed",
		"component", "process_runtime_workflow_reconciler",
		"scanned", result.Scanned,
		"reconciled", result.Reconciled,
		"failed", len(result.Failures),
		"last_scanned_workflow_task_id", result.LastScannedWorkflowTaskID,
	}
	if len(result.Failures) > 0 {
		r.log.Warnw(fields...)
		return
	}
	r.log.Infow(fields...)
}
