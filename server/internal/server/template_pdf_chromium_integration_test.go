package server

import (
	"context"
	"net/http"
	"net/http/httptest"
	"os"
	"os/exec"
	"strings"
	"sync/atomic"
	"testing"
	"time"
)

func TestTemplatePDFChromiumSecurityIntegration(t *testing.T) {
	if strings.TrimSpace(os.Getenv("ERP_PDF_CHROMIUM_INTEGRATION")) != "1" {
		t.Skip("set ERP_PDF_CHROMIUM_INTEGRATION=1 to run the local Chromium security smoke")
	}

	chromePath := strings.TrimSpace(os.Getenv("ERP_PDF_CHROME_PATH"))
	if chromePath == "" {
		resolved, err := resolveTemplatePDFChromeExecPath("", exec.LookPath)
		if err != nil {
			t.Fatalf("resolve local Chrome: %v", err)
		}
		chromePath = resolved
	}
	t.Setenv("ERP_PDF_CHROME_PATH", chromePath)
	sharedTemplatePDFChromeManager.Close()
	t.Cleanup(sharedTemplatePDFChromeManager.Close)

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	pdfBytes, err := renderTemplateHTMLToPDF(ctx, `<!doctype html><html><body><p>安全 PDF 集成测试</p></body></html>`, 1)
	if err != nil {
		t.Fatalf("render safe static HTML: %v", err)
	}
	if !strings.HasPrefix(string(pdfBytes), "%PDF") {
		t.Fatalf("rendered bytes do not have PDF signature: %q", pdfBytes[:min(len(pdfBytes), 8)])
	}

	var egressHits atomic.Int64
	egressSink := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		egressHits.Add(1)
		w.Header().Set("Content-Type", "image/png")
		_, _ = w.Write([]byte("not-needed"))
	}))
	defer egressSink.Close()

	egressCtx, egressCancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer egressCancel()
	_, renderErr := renderTemplateHTMLToPDF(
		egressCtx,
		`<!doctype html><html><body><img src="`+egressSink.URL+`/must-not-be-requested.png"></body></html>`,
		1,
	)
	if hits := egressHits.Load(); hits != 0 {
		t.Fatalf("Chromium network guard allowed %d request(s) to the egress sink", hits)
	}
	if renderErr != nil {
		t.Logf("blocked subresource caused render error (fail-closed): %v", renderErr)
	}
}
