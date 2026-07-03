package server

import (
	"bytes"
	"context"
	"errors"
	"net/http/httptest"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"testing"
	"time"

	"server/internal/biz"
	"server/internal/conf"
	jwtutil "server/pkg/jwt"
)

func TestParseRenderTemplatePDFRequest(t *testing.T) {
	t.Parallel()

	body := `{"title":"采购合同","file_name":"purchase.pdf","template_key":"material-purchase-contract","customer_key":" yoyoosun ","html":"<html><body>ok</body></html>","base_url":"http://localhost:5173/erp/print-workspace/material-purchase-contract"}`
	req := httptest.NewRequest("POST", "/templates/render-pdf", bytes.NewBufferString(body))

	parsed, err := parseRenderTemplatePDFRequest(req)
	if err != nil {
		t.Fatalf("parseRenderTemplatePDFRequest() error = %v", err)
	}

	if parsed.BaseURL != "http://localhost:5173/erp/print-workspace/material-purchase-contract/" {
		t.Fatalf("BaseURL = %q", parsed.BaseURL)
	}
	if parsed.TemplateKey != "material-purchase-contract" {
		t.Fatalf("TemplateKey = %q", parsed.TemplateKey)
	}
	if parsed.CustomerKey != biz.DefaultCustomerKey {
		t.Fatalf("CustomerKey = %q", parsed.CustomerKey)
	}
}

func TestParseRenderTemplatePDFRequestInvalidBaseURL(t *testing.T) {
	t.Parallel()

	body := `{"html":"<html><body>ok</body></html>","base_url":"file:///tmp/test.html"}`
	req := httptest.NewRequest("POST", "/templates/render-pdf", bytes.NewBufferString(body))

	_, err := parseRenderTemplatePDFRequest(req)
	if err == nil || err.Error() != "base_url 非法" && err.Error() != "base_url 仅支持 http/https" {
		t.Fatalf("expected base_url error, got %v", err)
	}
}

func TestParseRenderTemplatePDFRequestTooLargePayload(t *testing.T) {
	t.Parallel()

	tooLargeBody := strings.Repeat("a", maxTemplatePDFRequestBody+8)
	req := httptest.NewRequest("POST", "/templates/render-pdf", bytes.NewBufferString(tooLargeBody))

	_, err := parseRenderTemplatePDFRequest(req)
	if !errors.Is(err, errTemplatePDFPayloadTooLarge) {
		t.Fatalf("expected errTemplatePDFPayloadTooLarge, got %v", err)
	}
}

func TestInjectTemplatePDFBaseTag(t *testing.T) {
	t.Parallel()

	got := injectTemplatePDFBaseTag("<html><head><title>x</title></head><body>ok</body></html>", "http://localhost:5173/")
	if !strings.Contains(got, `<base href="http://localhost:5173/">`) {
		t.Fatalf("injectTemplatePDFBaseTag() missing base tag: %s", got)
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
	moduleKeys  []string
	err         error
}

func (g *stubTemplatePDFModuleGuard) EnsureModuleKeysEnabled(_ context.Context, customerKey string, moduleKeys ...string) error {
	g.customerKey = customerKey
	g.moduleKeys = append([]string(nil), moduleKeys...)
	return g.err
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
		{templateKey: "unknown-template", want: nil, wantOK: false},
	}

	for _, tt := range tests {
		got, ok := templatePDFReferencedModuleKeys(tt.templateKey)
		if ok != tt.wantOK || strings.Join(got, ",") != strings.Join(tt.want, ",") {
			t.Fatalf("templatePDFReferencedModuleKeys(%q) = %#v, want %#v", tt.templateKey, got, tt.want)
		}
	}
}

func TestNormalizeTemplatePDFCustomerKeyDefaultsOnlyWhenMissing(t *testing.T) {
	t.Parallel()

	if got := normalizeTemplatePDFCustomerKey(" yoyoosun "); got != "yoyoosun" {
		t.Fatalf("customer key = %q", got)
	}
	if got := normalizeTemplatePDFCustomerKey(""); got != biz.DefaultCustomerKey {
		t.Fatalf("empty customer key should default, got %q", got)
	}
}

func TestEnforceTemplatePDFModulesEnabled(t *testing.T) {
	t.Parallel()

	guard := &stubTemplatePDFModuleGuard{}
	if err := enforceTemplatePDFModulesEnabled(
		context.Background(),
		guard,
		"",
		"material-purchase-contract",
	); err != nil {
		t.Fatalf("enforceTemplatePDFModulesEnabled() error = %v", err)
	}
	if guard.customerKey != biz.DefaultCustomerKey {
		t.Fatalf("customerKey = %q, want default", guard.customerKey)
	}
	if strings.Join(guard.moduleKeys, ",") != "purchase_orders" {
		t.Fatalf("moduleKeys = %#v", guard.moduleKeys)
	}

	disabledGuard := &stubTemplatePDFModuleGuard{err: biz.ErrBadParam}
	if err := enforceTemplatePDFModulesEnabled(
		context.Background(),
		disabledGuard,
		"yoyoosun",
		"processing-contract",
	); !errors.Is(err, biz.ErrBadParam) {
		t.Fatalf("expected ErrBadParam for disabled module, got %v", err)
	}
	if strings.Join(disabledGuard.moduleKeys, ",") != "outsourcing_orders" {
		t.Fatalf("moduleKeys = %#v", disabledGuard.moduleKeys)
	}

	noGuardErr := enforceTemplatePDFModulesEnabled(
		context.Background(),
		nil,
		"yoyoosun",
		"material-purchase-contract",
	)
	if noGuardErr != nil {
		t.Fatalf("nil guard should not block legacy tests, got %v", noGuardErr)
	}

	unknownGuard := &stubTemplatePDFModuleGuard{err: biz.ErrBadParam}
	if err := enforceTemplatePDFModulesEnabled(
		context.Background(),
		unknownGuard,
		"yoyoosun",
		"unknown-template",
	); !errors.Is(err, biz.ErrBadParam) {
		t.Fatalf("unknown template should be rejected, got %v", err)
	}
	if len(unknownGuard.moduleKeys) != 0 {
		t.Fatalf("unknown template should fail before guard, got %#v", unknownGuard.moduleKeys)
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
	}

	for _, tc := range testCases {
		if got := resolveTemplatePDFRenderConcurrency(tc.raw); got != tc.want {
			t.Fatalf("resolveTemplatePDFRenderConcurrency(%q) = %d, want %d", tc.raw, got, tc.want)
		}
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

func TestTemplatePDFWarmupStateWaitIfRunning(t *testing.T) {
	t.Parallel()

	state := newTemplatePDFWarmupState()
	if wait, err := state.WaitIfRunning(context.Background()); wait != 0 || err != nil {
		t.Fatalf("WaitIfRunning(pending) = (%s, %v), want no wait", wait, err)
	}

	if !state.beginRun() {
		t.Fatal("beginRun() = false, want true")
	}
	done := make(chan error, 1)
	go func() {
		_, err := state.WaitIfRunning(context.Background())
		done <- err
	}()

	time.Sleep(10 * time.Millisecond)
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

	done := make(chan struct{})
	go func() {
		manager.Close()
		close(done)
	}()

	time.Sleep(10 * time.Millisecond)
	close(runtime.exited)

	select {
	case <-done:
	case <-time.After(time.Second):
		t.Fatal("Close() did not finish")
	}

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

func TestAdminRequestVerifierAcceptsAdminClaimsAndBearerToken(t *testing.T) {
	t.Parallel()

	verifier := newAdminRequestVerifier(&conf.Data{
		Auth: &conf.Data_Auth{
			JwtSecret: "test-secret",
		},
	})

	req := httptest.NewRequest("POST", "/templates/render-pdf", nil)
	req = req.WithContext(
		biz.NewContextWithClaims(context.Background(), &biz.AuthClaims{
			UserID:   1,
			Username: "admin",
			Role:     biz.RoleAdmin,
		}),
	)
	if !verifier.IsAdminRequest(req) {
		t.Fatal("expected admin claims request to pass verifier")
	}

	token, _, err := jwtutil.NewToken(jwtutil.Config{
		Secret:         []byte("test-secret"),
		ExpireDuration: time.Hour,
	}, 1, "admin", int8(biz.RoleAdmin))
	if err != nil {
		t.Fatalf("NewToken() error = %v", err)
	}

	bearerReq := httptest.NewRequest("POST", "/templates/render-pdf", nil)
	bearerReq.Header.Set("Authorization", "Bearer "+token)
	if !verifier.IsAdminRequest(bearerReq) {
		t.Fatal("expected bearer admin token request to pass verifier")
	}
}
