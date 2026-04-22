package server

import (
	"bytes"
	"context"
	"errors"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"server/internal/biz"
	"server/internal/conf"
	jwtutil "server/pkg/jwt"
)

func TestParseRenderTemplatePDFRequest(t *testing.T) {
	t.Parallel()

	body := `{"title":"采购合同","file_name":"purchase.pdf","template_key":"material-purchase-contract","html":"<html><body>ok</body></html>","base_url":"http://localhost:5173/erp/print-workspace/material-purchase-contract"}`
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

	_, err = resolveTemplatePDFChromeExecPath("", func(file string) (string, error) {
		return "", errors.New("not found")
	})
	if err == nil {
		t.Fatal("resolveTemplatePDFChromeExecPath() expected error when not found")
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
