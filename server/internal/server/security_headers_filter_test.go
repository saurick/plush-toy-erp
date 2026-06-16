package server

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	httpx "github.com/go-kratos/kratos/v2/transport/http"
)

func TestSecurityHeadersFilterSetsBaselineHeaders(t *testing.T) {
	srv := httpx.NewServer(httpx.Filter(SecurityHeadersFilter()))
	srv.Handle("/headers", http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_, _ = w.Write([]byte("ok"))
	}))

	req := httptest.NewRequest(http.MethodGet, "/headers", nil)
	recorder := httptest.NewRecorder()
	srv.ServeHTTP(recorder, req)

	if recorder.Code != http.StatusOK {
		t.Fatalf("status = %d, want %d", recorder.Code, http.StatusOK)
	}

	assertHeader := func(key, want string) {
		t.Helper()
		if got := recorder.Header().Get(key); got != want {
			t.Fatalf("%s = %q, want %q", key, got, want)
		}
	}

	assertHeader("X-Content-Type-Options", "nosniff")
	assertHeader("X-Frame-Options", "DENY")
	assertHeader("Referrer-Policy", "same-origin")
	assertHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()")

	csp := recorder.Header().Get("Content-Security-Policy")
	if csp == "" {
		t.Fatal("Content-Security-Policy header is empty")
	}
	if !containsAll(csp, "default-src 'self'", "frame-ancestors 'none'", "object-src 'none'") {
		t.Fatalf("Content-Security-Policy missing required directives: %q", csp)
	}
}

func containsAll(value string, needles ...string) bool {
	for _, needle := range needles {
		if !contains(value, needle) {
			return false
		}
	}
	return true
}

func contains(value, needle string) bool {
	return strings.Contains(value, needle)
}
