package server

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	stdhttp "net/http"
	"runtime"
	"strings"
	"sync/atomic"
	"time"

	httpx "github.com/go-kratos/kratos/v2/transport/http"
)

type runtimeMetricCounters struct {
	rpcRequests          atomic.Uint64
	rpcErrors            atomic.Uint64
	rpcDurationNanos     atomic.Uint64
	pdfAdmitted          atomic.Uint64
	pdfAdmissionRejected atomic.Uint64
	pdfQueueTimeouts     atomic.Uint64
	pdfRenderSucceeded   atomic.Uint64
	pdfRenderFailed      atomic.Uint64
	pdfRenderTimeouts    atomic.Uint64
	pdfRenderNanos       atomic.Uint64
	pdfOutputBytes       atomic.Uint64
	pdfChromeStarts      atomic.Uint64
}

var sharedRuntimeMetricCounters runtimeMetricCounters

func (m *runtimeMetricCounters) observeRPC(duration time.Duration, failed bool) {
	if m == nil {
		return
	}
	m.rpcRequests.Add(1)
	m.rpcDurationNanos.Add(uint64(max(duration, 0)))
	if failed {
		m.rpcErrors.Add(1)
	}
}

func (m *runtimeMetricCounters) observePDFRender(duration time.Duration, outputBytes int, err error) {
	if m == nil {
		return
	}
	m.pdfRenderNanos.Add(uint64(max(duration, 0)))
	if err != nil {
		m.pdfRenderFailed.Add(1)
		if errors.Is(err, context.DeadlineExceeded) {
			m.pdfRenderTimeouts.Add(1)
		}
		return
	}
	m.pdfRenderSucceeded.Add(1)
	if outputBytes > 0 {
		m.pdfOutputBytes.Add(uint64(outputBytes))
	}
}

func registerRuntimeMetrics(
	srv *httpx.Server,
	db *sql.DB,
	pdfGate *templatePDFRenderGate,
	pdfWarmup templatePDFWarmupReadiness,
) {
	if srv == nil {
		return
	}
	srv.Handle("/metrics", stdhttp.HandlerFunc(func(w stdhttp.ResponseWriter, r *stdhttp.Request) {
		if r.Method != stdhttp.MethodGet && r.Method != stdhttp.MethodHead {
			w.Header().Set("Allow", "GET, HEAD")
			stdhttp.Error(w, "method not allowed", stdhttp.StatusMethodNotAllowed)
			return
		}

		w.Header().Set("Cache-Control", "no-store")
		w.Header().Set("Content-Type", "text/plain; version=0.0.4; charset=utf-8")
		w.WriteHeader(stdhttp.StatusOK)
		if r.Method == stdhttp.MethodHead {
			return
		}
		_, _ = w.Write([]byte(renderRuntimeMetrics(db, pdfGate, pdfWarmup)))
	}))
}

func renderRuntimeMetrics(db *sql.DB, pdfGate *templatePDFRenderGate, pdfWarmup templatePDFWarmupReadiness) string {
	var mem runtime.MemStats
	runtime.ReadMemStats(&mem)

	var out strings.Builder
	writeMetric(&out, "plush_erp_go_goroutines", "Current goroutine count.", float64(runtime.NumGoroutine()))
	writeMetric(&out, "plush_erp_go_heap_alloc_bytes", "Current allocated heap bytes.", float64(mem.HeapAlloc))
	writeMetric(&out, "plush_erp_go_heap_inuse_bytes", "Current in-use heap span bytes.", float64(mem.HeapInuse))
	writeMetric(&out, "plush_erp_go_heap_sys_bytes", "Heap bytes obtained from the operating system.", float64(mem.HeapSys))
	writeMetric(&out, "plush_erp_go_stack_inuse_bytes", "Current in-use stack bytes.", float64(mem.StackInuse))
	writeCounter(&out, "plush_erp_go_gc_cycles_total", "Completed garbage collection cycles.", float64(mem.NumGC))
	writeCounter(&out, "plush_erp_rpc_requests_total", "Completed JSON-RPC requests.", float64(sharedRuntimeMetricCounters.rpcRequests.Load()))
	writeCounter(&out, "plush_erp_rpc_errors_total", "JSON-RPC requests completed with an application or transport error.", float64(sharedRuntimeMetricCounters.rpcErrors.Load()))
	writeCounter(&out, "plush_erp_rpc_duration_seconds_total", "Cumulative JSON-RPC request duration.", time.Duration(sharedRuntimeMetricCounters.rpcDurationNanos.Load()).Seconds())

	if db != nil {
		stats := db.Stats()
		writeMetric(&out, "plush_erp_db_connections_max", "Configured maximum open database connections.", float64(stats.MaxOpenConnections))
		writeMetric(&out, "plush_erp_db_connections_open", "Current open database connections.", float64(stats.OpenConnections))
		writeMetric(&out, "plush_erp_db_connections_in_use", "Current in-use database connections.", float64(stats.InUse))
		writeMetric(&out, "plush_erp_db_connections_idle", "Current idle database connections.", float64(stats.Idle))
		writeCounter(&out, "plush_erp_db_wait_total", "Database connection waits.", float64(stats.WaitCount))
		writeCounter(&out, "plush_erp_db_wait_seconds_total", "Time spent waiting for database connections.", stats.WaitDuration.Seconds())
		writeCounter(&out, "plush_erp_db_connections_closed_idle_total", "Database connections closed for exceeding idle limits.", float64(stats.MaxIdleClosed+stats.MaxIdleTimeClosed))
		writeCounter(&out, "plush_erp_db_connections_closed_lifetime_total", "Database connections closed for exceeding maximum lifetime.", float64(stats.MaxLifetimeClosed))

		attachmentBytes, attachmentRows, err := readAttachmentStorageMetrics(db)
		if err == nil {
			writeMetric(&out, "plush_erp_attachment_relation_bytes", "PostgreSQL storage used by business attachments, including indexes and TOAST.", float64(attachmentBytes))
			writeMetric(&out, "plush_erp_attachment_rows_approx", "Approximate business attachment row count from PostgreSQL statistics.", attachmentRows)
			writeMetric(&out, "plush_erp_attachment_storage_query_success", "Whether the latest attachment storage probe succeeded.", 1)
		} else {
			writeMetric(&out, "plush_erp_attachment_storage_query_success", "Whether the latest attachment storage probe succeeded.", 0)
		}
	}

	if pdfGate != nil {
		writeMetric(&out, "plush_erp_pdf_render_limit", "Maximum concurrent PDF renders.", float64(pdfGate.Limit()))
		writeMetric(&out, "plush_erp_pdf_render_active", "Current active PDF renders.", float64(pdfGate.Active()))
		writeMetric(&out, "plush_erp_pdf_admitted", "Current PDF requests admitted for render or queue.", float64(pdfGate.Admitted()))
		writeMetric(&out, "plush_erp_pdf_queue_capacity", "Maximum queued PDF requests.", float64(pdfGate.QueueCapacity()))
		writeMetric(&out, "plush_erp_pdf_queued", "Current queued PDF requests.", float64(pdfGate.Queued()))
		writeCounter(&out, "plush_erp_pdf_admitted_total", "PDF requests admitted before body parsing.", float64(sharedRuntimeMetricCounters.pdfAdmitted.Load()))
		writeCounter(&out, "plush_erp_pdf_admission_rejected_total", "PDF requests rejected because render and queue admission was full.", float64(sharedRuntimeMetricCounters.pdfAdmissionRejected.Load()))
		writeCounter(&out, "plush_erp_pdf_queue_timeouts_total", "Admitted PDF requests that timed out waiting for a render slot.", float64(sharedRuntimeMetricCounters.pdfQueueTimeouts.Load()))
		writeCounter(&out, "plush_erp_pdf_render_succeeded_total", "Successful PDF renders.", float64(sharedRuntimeMetricCounters.pdfRenderSucceeded.Load()))
		writeCounter(&out, "plush_erp_pdf_render_failed_total", "Failed PDF renders.", float64(sharedRuntimeMetricCounters.pdfRenderFailed.Load()))
		writeCounter(&out, "plush_erp_pdf_render_timeouts_total", "PDF renders that failed because their context deadline expired.", float64(sharedRuntimeMetricCounters.pdfRenderTimeouts.Load()))
		writeCounter(&out, "plush_erp_pdf_render_duration_seconds_total", "Cumulative PDF render duration.", time.Duration(sharedRuntimeMetricCounters.pdfRenderNanos.Load()).Seconds())
		writeCounter(&out, "plush_erp_pdf_output_bytes_total", "Cumulative bytes produced by successful PDF renders.", float64(sharedRuntimeMetricCounters.pdfOutputBytes.Load()))
		writeCounter(&out, "plush_erp_pdf_chrome_starts_total", "Shared Chromium process starts.", float64(sharedRuntimeMetricCounters.pdfChromeStarts.Load()))
	}
	if pdfWarmup != nil {
		ready, _, _ := pdfWarmup.TemplatePDFWarmupReady()
		writeMetric(&out, "plush_erp_pdf_warmup_ready", "Whether PDF startup warmup is ready or explicitly disabled.", boolMetric(ready))
	}

	return out.String()
}

func boolMetric(value bool) float64 {
	if value {
		return 1
	}
	return 0
}

func readAttachmentStorageMetrics(db *sql.DB) (int64, float64, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 500*time.Millisecond)
	defer cancel()

	var relationBytes sql.NullInt64
	var approximateRows sql.NullFloat64
	err := db.QueryRowContext(ctx, `
		SELECT
			pg_total_relation_size(to_regclass('public.business_attachments')),
			COALESCE((
				SELECT reltuples
				FROM pg_class
				WHERE oid = to_regclass('public.business_attachments')
			), 0)
	`).Scan(&relationBytes, &approximateRows)
	if err != nil {
		return 0, 0, err
	}
	return relationBytes.Int64, approximateRows.Float64, nil
}

func writeMetric(out *strings.Builder, name string, help string, value float64) {
	fmt.Fprintf(out, "# HELP %s %s\n", name, help)
	fmt.Fprintf(out, "# TYPE %s gauge\n", name)
	fmt.Fprintf(out, "%s %g\n", name, value)
}

func writeCounter(out *strings.Builder, name string, help string, value float64) {
	fmt.Fprintf(out, "# HELP %s %s\n", name, help)
	fmt.Fprintf(out, "# TYPE %s counter\n", name)
	fmt.Fprintf(out, "%s %g\n", name, value)
}
