package server

import (
	"bytes"
	"context"
	"errors"
	"io"
	"net/http/httptest"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"testing"
	"time"

	"server/internal/biz"

	"github.com/go-kratos/kratos/v2/log"
	"github.com/go-kratos/kratos/v2/middleware"
	httpx "github.com/go-kratos/kratos/v2/transport/http"
)

func TestParseRenderTemplatePDFRequest(t *testing.T) {
	t.Parallel()

	body := `{"title":"采购合同","file_name":"purchase.pdf","template_key":"material-purchase-contract","html":"<html><body>ok</body></html>"}`
	req := httptest.NewRequest("POST", "/templates/render-pdf", bytes.NewBufferString(body))

	parsed, err := parseRenderTemplatePDFRequest(req)
	if err != nil {
		t.Fatalf("parseRenderTemplatePDFRequest() error = %v", err)
	}

	if parsed.TemplateKey != "material-purchase-contract" {
		t.Fatalf("TemplateKey = %q", parsed.TemplateKey)
	}
}

func TestParseRenderTemplatePDFRequestRejectsTransportCustomerAndBaseURL(t *testing.T) {
	t.Parallel()

	for _, body := range []string{
		`{"html":"<html><body>ok</body></html>","customer_key":"yoyoosun"}`,
		`{"html":"<html><body>ok</body></html>","base_url":"https://example.invalid"}`,
	} {
		req := httptest.NewRequest("POST", "/templates/render-pdf", bytes.NewBufferString(body))
		if _, err := parseRenderTemplatePDFRequest(req); err == nil {
			t.Fatalf("expected removed transport field to be rejected: %s", body)
		}
	}
}

func TestReadTemplatePDFRequestBodyRejectsTooLargePayload(t *testing.T) {
	t.Parallel()

	_, err := readTemplatePDFRequestBody(strings.NewReader(strings.Repeat("a", 33)), 32)
	if !errors.Is(err, errTemplatePDFPayloadTooLarge) {
		t.Fatalf("expected errTemplatePDFPayloadTooLarge, got %v", err)
	}
}

func TestParseRenderTemplatePDFRequestAllowsLargeImageSnapshotPayload(t *testing.T) {
	t.Parallel()

	body := `{"html":"<html><body>` + strings.Repeat("a", 4<<20) + `</body></html>"}`
	req := httptest.NewRequest("POST", "/templates/render-pdf", bytes.NewBufferString(body))

	if _, err := parseRenderTemplatePDFRequest(req); err != nil {
		t.Fatalf("payload above the former 3 MiB limit should pass: %v", err)
	}
}

func TestBuildRenderPDFFilename(t *testing.T) {
	t.Parallel()

	testCases := []struct {
		in   string
		want string
	}{
		{in: "purchase.pdf", want: "purchase.pdf"},
		{in: "采购 合同", want: "template_preview.pdf"},
		{in: "processing-contract v2", want: "processing-contract_v2.pdf"},
	}

	for _, tc := range testCases {
		if got := buildRenderPDFFilename(tc.in, ""); got != tc.want {
			t.Fatalf("buildRenderPDFFilename(%q) = %q, want %q", tc.in, got, tc.want)
		}
	}
}

type stubTemplatePDFModuleGuard struct {
	customerKey string
	session     *biz.EffectiveSession
	err         error
	strictCalls int
}

func (g *stubTemplatePDFModuleGuard) GetEffectiveSessionRequiringActiveRevision(_ context.Context, customerKey string, _ *biz.AdminUser) (*biz.EffectiveSession, error) {
	g.customerKey = customerKey
	g.strictCalls++
	return g.session, g.err
}

func TestTemplatePDFReferencedModuleKeys(t *testing.T) {
	t.Parallel()

	tests := []struct {
		templateKey string
		want        []string
		wantOK      bool
	}{
		{templateKey: "material-purchase-contract", want: []string{"purchase_orders"}, wantOK: true},
		{templateKey: "processing-contract", want: []string{"outsourcing_orders"}, wantOK: true},
		{templateKey: "engineering-material-detail", want: []string{"material_bom"}, wantOK: true},
		{templateKey: "engineering-color-card", want: []string{"material_bom"}, wantOK: true},
		{templateKey: "engineering-work-instruction", want: []string{"material_bom"}, wantOK: true},
		{templateKey: "unknown-template", want: nil, wantOK: false},
	}

	for _, tt := range tests {
		got, ok := templatePDFReferencedModuleKeys(tt.templateKey)
		if ok != tt.wantOK || strings.Join(got, ",") != strings.Join(tt.want, ",") {
			t.Fatalf("templatePDFReferencedModuleKeys(%q) = %#v, want %#v", tt.templateKey, got, tt.want)
		}
	}
}

func TestRuntimeTemplatePDFCustomerKeyUsesDeploymentConfiguration(t *testing.T) {
	t.Setenv("ERP_CUSTOMER_KEY", " yoyoosun ")
	if got := runtimeTemplatePDFCustomerKey(); got != "yoyoosun" {
		t.Fatalf("runtime customer key = %q", got)
	}
}

func TestEnforceTemplatePDFModulesEnabled(t *testing.T) {
	t.Parallel()

	session := &biz.EffectiveSession{Modules: map[string]string{"purchase_orders": "enabled"}}
	if err := enforceTemplatePDFModulesEnabled(session, "material-purchase-contract"); err != nil {
		t.Fatalf("enforceTemplatePDFModulesEnabled() error = %v", err)
	}

	disabledSession := &biz.EffectiveSession{Modules: map[string]string{"outsourcing_orders": "disabled"}}
	if err := enforceTemplatePDFModulesEnabled(disabledSession, "processing-contract"); !errors.Is(err, biz.ErrForbidden) {
		t.Fatalf("expected ErrForbidden for disabled module, got %v", err)
	}

	if err := enforceTemplatePDFModulesEnabled(nil, "material-purchase-contract"); !errors.Is(err, biz.ErrForbidden) {
		t.Fatalf("nil session must fail closed, got %v", err)
	}

	if err := enforceTemplatePDFModulesEnabled(session, "unknown-template"); !errors.Is(err, biz.ErrBadParam) {
		t.Fatalf("unknown template should be rejected, got %v", err)
	}
}

func TestAuthorizeTemplatePDFRequestRequiresRealtimePermissionEffectiveActionAndModule(t *testing.T) {
	t.Setenv("ERP_CUSTOMER_KEY", biz.DefaultCustomerKey)
	admin := &biz.AdminUser{Permissions: []string{biz.PermissionERPPrintTemplateRead}}

	allowed := &stubTemplatePDFModuleGuard{session: &biz.EffectiveSession{
		Actions: []string{biz.PermissionERPPrintTemplateRead},
		Modules: map[string]string{"purchase_orders": "enabled"},
	}}
	if err := authorizeTemplatePDFRequest(context.Background(), allowed, admin, biz.DefaultCustomerKey, "material-purchase-contract"); err != nil {
		t.Fatalf("authorizeTemplatePDFRequest() error = %v", err)
	}
	if allowed.strictCalls != 1 {
		t.Fatalf("strict entitlement calls = %d, want 1", allowed.strictCalls)
	}

	missingRBAC := &biz.AdminUser{}
	if err := authorizeTemplatePDFRequest(context.Background(), allowed, missingRBAC, biz.DefaultCustomerKey, "material-purchase-contract"); !errors.Is(err, biz.ErrForbidden) {
		t.Fatalf("missing RBAC permission should fail closed, got %v", err)
	}

	missingActiveRevision := &stubTemplatePDFModuleGuard{}
	if err := authorizeTemplatePDFRequest(context.Background(), missingActiveRevision, admin, biz.DefaultCustomerKey, "material-purchase-contract"); !errors.Is(err, biz.ErrForbidden) {
		t.Fatalf("demo without active revision entitlement should fail closed, got %v", err)
	}

	disabledModule := &stubTemplatePDFModuleGuard{session: &biz.EffectiveSession{
		Actions: []string{biz.PermissionERPPrintTemplateRead},
		Modules: map[string]string{"purchase_orders": "disabled"},
	}}
	if err := authorizeTemplatePDFRequest(context.Background(), disabledModule, admin, biz.DefaultCustomerKey, "material-purchase-contract"); !errors.Is(err, biz.ErrForbidden) {
		t.Fatalf("disabled module should fail closed, got %v", err)
	}
}

func TestRegisterTemplatePDFHandlerRunsKratosAuthenticationMiddleware(t *testing.T) {
	t.Parallel()

	middlewareCalls := 0
	srv := httpx.NewServer(httpx.Middleware(func(next middleware.Handler) middleware.Handler {
		return func(ctx context.Context, req any) (any, error) {
			middlewareCalls++
			ctx = biz.WithCurrentAdmin(ctx, &biz.AdminUser{ID: 1})
			return next(ctx, req)
		}
	}))
	registerTemplatePDFHandler(
		srv,
		log.NewStdLogger(io.Discard),
		nil,
		nil,
		&stubTemplatePDFModuleGuard{},
	)

	req := httptest.NewRequest(
		"POST",
		"/templates/render-pdf",
		bytes.NewBufferString(`{"template_key":"material-purchase-contract","html":"<html><body>ok</body></html>"}`),
	)
	res := httptest.NewRecorder()
	srv.ServeHTTP(res, req)

	if middlewareCalls != 1 {
		t.Fatalf("Kratos authentication middleware calls = %d, want 1", middlewareCalls)
	}
	if res.Code != 403 {
		t.Fatalf("session-validated admin without print permission status = %d, want 403", res.Code)
	}
}

func TestResolveTemplatePDFRenderConcurrency(t *testing.T) {
	t.Parallel()

	testCases := []struct {
		raw  string
		want int
	}{
		{raw: "", want: defaultTemplatePDFRenderConcurrency},
		{raw: "abc", want: defaultTemplatePDFRenderConcurrency},
		{raw: "0", want: defaultTemplatePDFRenderConcurrency},
		{raw: "4", want: 4},
		{raw: "8", want: 8},
	}

	for _, tc := range testCases {
		if got := resolveTemplatePDFRenderConcurrency(tc.raw); got != tc.want {
			t.Fatalf("resolveTemplatePDFRenderConcurrency(%q) = %d, want %d", tc.raw, got, tc.want)
		}
	}
}

func TestTemplatePDFResourceBudgetContract(t *testing.T) {
	t.Parallel()

	if maxTemplatePDFRequestBody != 128<<20 {
		t.Fatalf("request body budget = %d, want 128 MiB", maxTemplatePDFRequestBody)
	}
	if maxTemplateHTMLSize != 96<<20 {
		t.Fatalf("HTML budget = %d, want 96 MiB", maxTemplateHTMLSize)
	}
	if maxTemplatePDFEmbeddedTotalBytes != 64<<20 {
		t.Fatalf("embedded image budget = %d, want 64 MiB", maxTemplatePDFEmbeddedTotalBytes)
	}
	if defaultTemplatePDFRenderConcurrency != 4 {
		t.Fatalf("default render concurrency = %d, want 4", defaultTemplatePDFRenderConcurrency)
	}
}

func TestResolveTemplatePDFWarmupEnabled(t *testing.T) {
	t.Parallel()

	testCases := []struct {
		name string
		raw  string
		want bool
	}{
		{name: "default enabled", want: true},
		{name: "async", raw: "async", want: true},
		{name: "true", raw: "true", want: true},
		{name: "off", raw: "off", want: false},
		{name: "unexpected disables", raw: "unexpected", want: false},
	}

	for _, tc := range testCases {
		tc := tc
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			if got := resolveTemplatePDFWarmupEnabled(tc.raw); got != tc.want {
				t.Fatalf("resolveTemplatePDFWarmupEnabled(%q) = %v, want %v", tc.raw, got, tc.want)
			}
		})
	}
}

func TestTemplatePDFWarmupStateReadyTransitions(t *testing.T) {
	t.Parallel()

	state := newTemplatePDFWarmupState()
	if ready, body, err := state.TemplatePDFWarmupReady(); ready || body != "pdf warmup not ready" || err != nil {
		t.Fatalf("initial readiness = (%v, %q, %v), want not ready", ready, body, err)
	}

	if !state.beginRun() {
		t.Fatal("beginRun() = false, want true")
	}
	if ready, body, err := state.TemplatePDFWarmupReady(); ready || body != "pdf warmup not ready" || err != nil {
		t.Fatalf("running readiness = (%v, %q, %v), want not ready", ready, body, err)
	}

	state.finishRun(templatePDFWarmupReady, nil)
	if ready, body, err := state.TemplatePDFWarmupReady(); !ready || body != "" || err != nil {
		t.Fatalf("ready readiness = (%v, %q, %v), want ready", ready, body, err)
	}
}

func TestTemplatePDFWarmupStateFailedAndDisabled(t *testing.T) {
	t.Parallel()

	state := newTemplatePDFWarmupState()
	if !state.beginRun() {
		t.Fatal("beginRun() = false, want true")
	}
	warmupErr := errors.New("chromium missing")
	state.finishRun(templatePDFWarmupFailed, warmupErr)
	if ready, body, err := state.TemplatePDFWarmupReady(); ready || body != "pdf warmup failed" || !errors.Is(err, warmupErr) {
		t.Fatalf("failed readiness = (%v, %q, %v), want failed", ready, body, err)
	}

	state.setDisabled()
	if ready, body, err := state.TemplatePDFWarmupReady(); !ready || body != "" || err != nil {
		t.Fatalf("disabled readiness = (%v, %q, %v), want ready", ready, body, err)
	}
}

type templatePDFDoneObservedContext struct {
	context.Context
	doneObserved chan struct{}
}

func (c *templatePDFDoneObservedContext) Done() <-chan struct{} {
	close(c.doneObserved)
	return c.Context.Done()
}

func TestTemplatePDFWarmupStateWaitIfRunning(t *testing.T) {
	t.Parallel()

	state := newTemplatePDFWarmupState()
	if wait, err := state.WaitIfRunning(context.Background()); wait != 0 || err != nil {
		t.Fatalf("WaitIfRunning(pending) = (%s, %v), want no wait", wait, err)
	}

	if !state.beginRun() {
		t.Fatal("beginRun() = false, want true")
	}
	waitCtx, cancel := context.WithTimeout(context.Background(), time.Second)
	defer cancel()
	observedCtx := &templatePDFDoneObservedContext{
		Context:      waitCtx,
		doneObserved: make(chan struct{}),
	}
	done := make(chan error, 1)
	go func() {
		_, err := state.WaitIfRunning(observedCtx)
		done <- err
	}()

	select {
	case <-observedCtx.doneObserved:
	case <-waitCtx.Done():
		t.Fatal("WaitIfRunning() did not start waiting")
	}
	state.finishRun(templatePDFWarmupReady, nil)

	select {
	case err := <-done:
		if err != nil {
			t.Fatalf("WaitIfRunning() error = %v", err)
		}
	case <-time.After(time.Second):
		t.Fatal("WaitIfRunning() did not return after warmup finished")
	}
}

func TestResolveTemplatePDFChromeExecPath(t *testing.T) {
	t.Parallel()

	got, err := resolveTemplatePDFChromeExecPath("/custom/chrome", func(file string) (string, error) {
		if file == "/custom/chrome" {
			return file, nil
		}
		return "", errors.New("not found")
	})
	if err != nil {
		t.Fatalf("resolveTemplatePDFChromeExecPath(env) error = %v", err)
	}
	if got != "/custom/chrome" {
		t.Fatalf("resolveTemplatePDFChromeExecPath(env) = %q", got)
	}
}

func TestResolveTemplatePDFChromeExecPathNotFound(t *testing.T) {
	t.Setenv("HOME", t.TempDir())
	_, err := resolveTemplatePDFChromeExecPath("", func(file string) (string, error) {
		return "", errors.New("not found")
	})
	if err == nil {
		t.Fatal("resolveTemplatePDFChromeExecPath() expected error when not found")
	}
}

func TestResolveTemplatePDFChromeExecPathUsesNativeCandidates(t *testing.T) {
	t.Parallel()

	calls := make([]string, 0, 4)
	got, err := resolveTemplatePDFChromeExecPath("", func(file string) (string, error) {
		calls = append(calls, file)
		if file == "chromium-browser" {
			return "/usr/bin/chromium-browser", nil
		}
		return "", errors.New("not found")
	})
	if err != nil {
		t.Fatalf("resolveTemplatePDFChromeExecPath() error = %v", err)
	}
	if got != "/usr/bin/chromium-browser" {
		t.Fatalf("resolveTemplatePDFChromeExecPath() = %q, want /usr/bin/chromium-browser", got)
	}

	wantOrder := make([]string, 0, 4)
	for _, candidate := range templatePDFChromeExecCandidates(runtime.GOOS) {
		wantOrder = append(wantOrder, candidate)
		if candidate == "chromium-browser" {
			break
		}
	}
	if strings.Join(calls, ",") != strings.Join(wantOrder, ",") {
		t.Fatalf("lookup order = %v, want %v", calls, wantOrder)
	}
}

func TestResolveTemplatePDFPlaywrightChromeExecPath(t *testing.T) {
	tempHome := t.TempDir()
	chromePath := filepath.Join(tempHome, ".cache", "ms-playwright", "chromium-1208", "chrome-linux64", "chrome")
	if err := os.MkdirAll(filepath.Dir(chromePath), 0755); err != nil {
		t.Fatalf("MkdirAll() error = %v", err)
	}
	if err := os.WriteFile(chromePath, []byte("#!/bin/sh\n"), 0755); err != nil {
		t.Fatalf("WriteFile() error = %v", err)
	}
	t.Setenv("HOME", tempHome)

	got, err := resolveTemplatePDFPlaywrightChromeExecPath()
	if err != nil {
		t.Fatalf("resolveTemplatePDFPlaywrightChromeExecPath() error = %v", err)
	}
	if got != chromePath {
		t.Fatalf("resolveTemplatePDFPlaywrightChromeExecPath() = %q, want %q", got, chromePath)
	}
}

func TestTemplatePDFChromeManagerAcquireReuseAliveRuntime(t *testing.T) {
	t.Parallel()

	launchCount := 0
	manager := newTemplatePDFChromeManager(func(_ context.Context, chromeExecPath string) (*templatePDFChromeRuntime, string, error) {
		launchCount++
		if chromeExecPath != "/usr/bin/chromium" {
			t.Fatalf("chromeExecPath = %q", chromeExecPath)
		}
		return &templatePDFChromeRuntime{exited: make(chan struct{})}, "ws://127.0.0.1:9222/devtools/browser/reused", nil
	})

	runtimeA, wsURLA, err := manager.Acquire(context.Background(), "/usr/bin/chromium")
	if err != nil {
		t.Fatalf("Acquire() error = %v", err)
	}
	runtimeB, wsURLB, err := manager.Acquire(context.Background(), "/usr/bin/chromium")
	if err != nil {
		t.Fatalf("Acquire() second error = %v", err)
	}

	if launchCount != 1 {
		t.Fatalf("launchCount = %d, want 1", launchCount)
	}
	if runtimeA != runtimeB {
		t.Fatal("Acquire() should reuse alive runtime")
	}
	if wsURLA != wsURLB {
		t.Fatalf("wsURL mismatch: %q != %q", wsURLA, wsURLB)
	}
}

func TestTemplatePDFChromeManagerAcquireRelaunchExitedRuntime(t *testing.T) {
	t.Parallel()

	launchCount := 0
	manager := newTemplatePDFChromeManager(func(_ context.Context, _ string) (*templatePDFChromeRuntime, string, error) {
		launchCount++
		return &templatePDFChromeRuntime{exited: make(chan struct{})}, "ws://127.0.0.1:9222/devtools/browser/test", nil
	})

	runtimeA, _, err := manager.Acquire(context.Background(), "/usr/bin/chromium")
	if err != nil {
		t.Fatalf("Acquire() error = %v", err)
	}
	close(runtimeA.exited)

	runtimeB, _, err := manager.Acquire(context.Background(), "/usr/bin/chromium")
	if err != nil {
		t.Fatalf("Acquire() second error = %v", err)
	}
	if launchCount != 2 {
		t.Fatalf("launchCount = %d, want 2", launchCount)
	}
	if runtimeA == runtimeB {
		t.Fatal("Acquire() should relaunch after runtime exit")
	}
}

func TestTemplatePDFChromeManagerCloseClearsRuntime(t *testing.T) {
	t.Parallel()

	tempDir := t.TempDir()
	runtime := &templatePDFChromeRuntime{
		exited:      make(chan struct{}),
		userDataDir: tempDir,
	}
	manager := newTemplatePDFChromeManager(func(_ context.Context, _ string) (*templatePDFChromeRuntime, string, error) {
		return runtime, "ws://127.0.0.1:9222/devtools/browser/test", nil
	})

	_, _, err := manager.Acquire(context.Background(), "/usr/bin/chromium")
	if err != nil {
		t.Fatalf("Acquire() error = %v", err)
	}

	close(runtime.exited)
	manager.Close()

	if manager.runtime != nil {
		t.Fatal("Close() should clear cached runtime")
	}
	if manager.wsURL != "" {
		t.Fatalf("Close() should clear wsURL, got %q", manager.wsURL)
	}
	if _, err := os.Stat(tempDir); !errors.Is(err, os.ErrNotExist) {
		t.Fatalf("expected temp dir removed, got err=%v", err)
	}
}

func TestAuthorizeTemplatePDFRequestDoesNotTrustClaimsWithoutCurrentAdmin(t *testing.T) {
	t.Parallel()

	ctx := biz.NewContextWithClaims(
		context.Background(),
		&biz.AuthClaims{
			UserID:   1,
			Username: "admin",
			Role:     biz.RoleAdmin,
		},
	)
	if _, ok := biz.GetCurrentAdminFromContext(ctx); ok {
		t.Fatal("claims-only context must not contain a session-validated admin")
	}

	guard := &stubTemplatePDFModuleGuard{session: &biz.EffectiveSession{
		Actions: []string{biz.PermissionERPPrintTemplateRead},
		Modules: map[string]string{"purchase_orders": "enabled"},
	}}
	if err := authorizeTemplatePDFRequest(ctx, guard, nil, biz.DefaultCustomerKey, "material-purchase-contract"); !errors.Is(err, biz.ErrForbidden) {
		t.Fatalf("claims-only context must fail closed, got %v", err)
	}
}

func TestTemplatePDFChromeArgsKeepSandboxEnabled(t *testing.T) {
	t.Parallel()

	args := templatePDFChromeArgs("/tmp/plush-pdf-profile", 9222)
	joined := strings.Join(args, "\n")
	if strings.Contains(joined, "--no-sandbox") || strings.Contains(joined, "--disable-setuid-sandbox") {
		t.Fatalf("Chrome sandbox must stay enabled: %v", args)
	}
	if !strings.Contains(joined, "--remote-debugging-address=127.0.0.1") {
		t.Fatalf("Chrome debugging must stay loopback-only: %v", args)
	}
}
