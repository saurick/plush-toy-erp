package server

import (
	"strings"
	"testing"
)

func TestRenderRuntimeMetricsIncludesBoundedPDFState(t *testing.T) {
	gate := newTemplatePDFRenderGate(2, 1)
	warmup := newTemplatePDFWarmupState()
	releaseAdmission, ok := gate.TryAdmit()
	if !ok {
		t.Fatal("expected first PDF request to be admitted")
	}
	defer releaseAdmission()

	metrics := renderRuntimeMetrics(nil, gate, warmup)
	for _, line := range []string{
		"plush_erp_go_goroutines ",
		"plush_erp_go_heap_alloc_bytes ",
		"plush_erp_pdf_render_limit 2\n",
		"plush_erp_pdf_queue_capacity 1\n",
		"plush_erp_pdf_admitted 1\n",
		"plush_erp_pdf_warmup_ready 0\n",
	} {
		if !strings.Contains(metrics, line) {
			t.Fatalf("metrics missing %q:\n%s", line, metrics)
		}
	}
}
