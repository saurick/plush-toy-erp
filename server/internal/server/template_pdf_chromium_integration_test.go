package server

import (
	"bytes"
	"context"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"os/exec"
	"strings"
	"sync/atomic"
	"testing"
	"time"

	"server/internal/biz"

	"github.com/go-kratos/kratos/v2/log"
	"github.com/go-kratos/kratos/v2/middleware"
	httpx "github.com/go-kratos/kratos/v2/transport/http"
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

	t.Run("http_route_streams_rendered_bytes", func(t *testing.T) {
		guard := &stubTemplatePDFModuleGuard{session: &biz.EffectiveSession{
			Actions: []string{biz.PermissionERPPrintTemplateRead},
			Modules: map[string]string{"purchase_orders": "enabled"},
		}}
		srv := httpx.NewServer(
			httpx.Timeout(45*time.Second),
			httpx.Filter(SecurityHeadersFilter(), RequestIDFilter(), JSONRPCBodyLimitFilter()),
			httpx.Middleware(func(next middleware.Handler) middleware.Handler {
				return func(ctx context.Context, req any) (any, error) {
					return next(biz.WithCurrentAdmin(ctx, &biz.AdminUser{
						ID: 1, Permissions: []string{biz.PermissionERPPrintTemplateRead},
					}), req)
				}
			}),
		)
		registerTemplatePDFHandler(srv, log.NewStdLogger(io.Discard), nil, nil, guard)
		server := httptest.NewServer(srv)
		t.Cleanup(server.Close)
		response, err := server.Client().Post(server.URL+"/templates/render-pdf", "application/json", bytes.NewBufferString(
			`{"template_key":"material-purchase-contract","html":"<!doctype html><html><body><p>真实 HTTP 输出验证</p></body></html>"}`,
		))
		if err != nil {
			t.Fatal(err)
		}
		t.Cleanup(func() {
			if err := response.Body.Close(); err != nil {
				t.Errorf("close rendered PDF response: %v", err)
			}
		})
		body, err := io.ReadAll(response.Body)
		if err != nil {
			t.Fatal(err)
		}
		if response.StatusCode != http.StatusOK || response.Header.Get("Content-Type") != "application/pdf" {
			t.Fatalf("PDF HTTP response: status=%d headers=%v body=%s", response.StatusCode, response.Header, body)
		}
		if len(body) < 2000 || !bytes.HasPrefix(body, []byte("%PDF-")) {
			t.Fatalf("rendered PDF did not reach HTTP body: bytes=%d headers=%v", len(body), response.Header)
		}
	})

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
