package server

import (
	"context"
	"encoding/hex"
	"errors"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/DATA-DOG/go-sqlmock"
	klog "github.com/go-kratos/kratos/v2/log"
	httpx "github.com/go-kratos/kratos/v2/transport/http"
	sdktrace "go.opentelemetry.io/otel/sdk/trace"
)

type captureLogEntry struct {
	level  string
	fields map[string]interface{}
}

type captureLogger struct {
	entries []captureLogEntry
}

func (l *captureLogger) Log(level klog.Level, keyvals ...interface{}) error {
	fields := make(map[string]interface{}, len(keyvals)/2)
	for i := 0; i+1 < len(keyvals); i += 2 {
		fields[fmt.Sprint(keyvals[i])] = keyvals[i+1]
	}
	l.entries = append(l.entries, captureLogEntry{
		level:  level.String(),
		fields: fields,
	})
	return nil
}

func (l *captureLogger) hasEntry(match func(entry captureLogEntry) bool) bool {
	for _, entry := range l.entries {
		if match(entry) {
			return true
		}
	}
	return false
}

type stubReadinessPinger struct {
	err error
}

func (p stubReadinessPinger) PingContext(context.Context) error {
	return p.err
}

type stubTemplatePDFWarmupReadiness struct {
	ready bool
	body  string
	err   error
}

func (s stubTemplatePDFWarmupReadiness) TemplatePDFWarmupReady() (bool, string, error) {
	return s.ready, s.body, s.err
}

func TestRegisterHealthRoutesHealthzOK(t *testing.T) {
	logger := &captureLogger{}
	srv := httpx.NewServer()
	registerHealthRoutes(srv, logger, sdktrace.NewTracerProvider(), nil, nil)

	req := httptest.NewRequest(http.MethodGet, "/healthz", nil)
	req.Header.Set("X-Request-Id", "req-healthz")
	recorder := httptest.NewRecorder()
	srv.ServeHTTP(recorder, req)

	if recorder.Code != http.StatusOK {
		t.Fatalf("healthz status = %d, want %d", recorder.Code, http.StatusOK)
	}
	if body := strings.TrimSpace(recorder.Body.String()); body != "ok" {
		t.Fatalf("healthz body = %q, want %q", body, "ok")
	}

	if !logger.hasEntry(func(entry captureLogEntry) bool {
		return fmt.Sprint(entry.fields["operation"]) == "server.http.healthz" &&
			fmt.Sprint(entry.fields["status"]) == "200" &&
			fmt.Sprint(entry.fields["request_id"]) == "req-healthz"
	}) {
		t.Fatalf("expected completion log for healthz, got %+v", logger.entries)
	}
}

func TestRegisterHealthRoutesReadyzOK(t *testing.T) {
	logger := &captureLogger{}
	srv := httpx.NewServer()
	registerHealthRoutes(srv, logger, sdktrace.NewTracerProvider(), stubReadinessPinger{}, stubTemplatePDFWarmupReadiness{ready: true})

	req := httptest.NewRequest(http.MethodGet, "/readyz", nil)
	recorder := httptest.NewRecorder()
	srv.ServeHTTP(recorder, req)

	if recorder.Code != http.StatusOK {
		t.Fatalf("readyz status = %d, want %d", recorder.Code, http.StatusOK)
	}
	if body := strings.TrimSpace(recorder.Body.String()); body != "ready" {
		t.Fatalf("readyz body = %q, want %q", body, "ready")
	}
}

func TestRegisterHealthRoutesReadyzVerifiesRuntimeIdentityWithoutAuthentication(t *testing.T) {
	db, mock, err := sqlmock.New()
	if err != nil {
		t.Fatalf("sqlmock.New: %v", err)
	}
	defer func() { _ = db.Close() }()
	const release = "20c96d38a7b9e6d4f3c2b1a09876543210fedcba"
	const migration = "20260714165115"
	t.Setenv("GIT_SHA", release)
	mock.ExpectQuery(`SELECT current_database\(\)`).WillReturnRows(
		sqlmock.NewRows([]string{"current_database"}).AddRow("plush_erp_uat_20260715"),
	)
	mock.ExpectQuery(`SELECT version[\s\S]+atlas_schema_revisions`).WillReturnRows(
		sqlmock.NewRows([]string{"version"}).AddRow(migration),
	)

	logger := &captureLogger{}
	srv := httpx.NewServer()
	registerHealthRoutes(srv, logger, sdktrace.NewTracerProvider(), db, nil)
	req := httptest.NewRequest(http.MethodGet, runtimeIdentityPath, nil)
	req.Header.Set(runtimeIdentityScopeHeader, runtimeIdentityReleaseScope)
	req.Header.Set(
		runtimeIdentityDigestHeader,
		hex.EncodeToString(runtimeIdentityDigest(
			runtimeIdentityReleaseScope,
			"plush_erp_uat_20260715",
			release,
			migration,
		)),
	)
	recorder := httptest.NewRecorder()
	srv.ServeHTTP(recorder, req)

	if recorder.Code != http.StatusOK {
		t.Fatalf("runtime identity status = %d, body=%q", recorder.Code, recorder.Body.String())
	}
	if body := strings.TrimSpace(recorder.Body.String()); body != "runtime identity matched" {
		t.Fatalf("runtime identity body = %q", body)
	}
	if recorder.Header().Get(runtimeIdentityProofHeader) != runtimeIdentityProofValue {
		t.Fatalf("runtime identity proof header missing")
	}
	if recorder.Header().Get("Cache-Control") != "no-store" {
		t.Fatalf("runtime identity response must be no-store")
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("runtime identity queries: %v", err)
	}
}

func TestRegisterHealthRoutesReadyzRejectsRuntimeIdentityMismatchWithoutDisclosingActualValue(t *testing.T) {
	db, mock, err := sqlmock.New()
	if err != nil {
		t.Fatalf("sqlmock.New: %v", err)
	}
	defer func() { _ = db.Close() }()
	mock.ExpectQuery(`SELECT current_database\(\)`).WillReturnRows(
		sqlmock.NewRows([]string{"current_database"}).AddRow("other_database"),
	)

	logger := &captureLogger{}
	srv := httpx.NewServer()
	registerHealthRoutes(srv, logger, sdktrace.NewTracerProvider(), db, nil)
	req := httptest.NewRequest(http.MethodGet, runtimeIdentityPath, nil)
	req.Header.Set(runtimeIdentityScopeHeader, runtimeIdentityDatabaseScope)
	req.Header.Set(
		runtimeIdentityDigestHeader,
		hex.EncodeToString(runtimeIdentityDigest(
			runtimeIdentityDatabaseScope,
			"plush_erp_uat_20260715",
			"",
			"",
		)),
	)
	recorder := httptest.NewRecorder()
	srv.ServeHTTP(recorder, req)

	if recorder.Code != http.StatusPreconditionFailed {
		t.Fatalf("readyz status = %d, want %d", recorder.Code, http.StatusPreconditionFailed)
	}
	body := strings.TrimSpace(recorder.Body.String())
	if body != "runtime identity mismatch" || strings.Contains(body, "other_database") {
		t.Fatalf("readyz body disclosed runtime identity: %q", body)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("runtime identity queries: %v", err)
	}
}

func TestRegisterHealthRoutesRuntimeIdentityRejectsMalformedProbeWithoutQuery(t *testing.T) {
	db, mock, err := sqlmock.New()
	if err != nil {
		t.Fatalf("sqlmock.New: %v", err)
	}
	defer func() { _ = db.Close() }()
	logger := &captureLogger{}
	srv := httpx.NewServer()
	registerHealthRoutes(srv, logger, sdktrace.NewTracerProvider(), db, nil)
	req := httptest.NewRequest(http.MethodGet, runtimeIdentityPath, nil)
	req.Header.Set(runtimeIdentityScopeHeader, runtimeIdentityReleaseScope)
	req.Header.Set(runtimeIdentityDigestHeader, "not-a-digest")
	recorder := httptest.NewRecorder()
	srv.ServeHTTP(recorder, req)
	if recorder.Code != http.StatusBadRequest {
		t.Fatalf("runtime identity status = %d, want %d", recorder.Code, http.StatusBadRequest)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("malformed probe queried database: %v", err)
	}
}

func TestRegisterHealthRoutesReadyzFailureLogsStructuredWarning(t *testing.T) {
	logger := &captureLogger{}
	srv := httpx.NewServer()
	registerHealthRoutes(srv, logger, sdktrace.NewTracerProvider(), stubReadinessPinger{err: errors.New("dial tcp postgres: i/o timeout")}, stubTemplatePDFWarmupReadiness{ready: true})

	req := httptest.NewRequest(http.MethodGet, "/readyz", nil)
	req.Header.Set("X-Request-Id", "req-readyz")
	recorder := httptest.NewRecorder()
	srv.ServeHTTP(recorder, req)

	if recorder.Code != http.StatusServiceUnavailable {
		t.Fatalf("readyz status = %d, want %d", recorder.Code, http.StatusServiceUnavailable)
	}
	if body := strings.TrimSpace(recorder.Body.String()); body != "postgres not ready" {
		t.Fatalf("readyz body = %q, want %q", body, "postgres not ready")
	}

	if !logger.hasEntry(func(entry captureLogEntry) bool {
		return entry.level == "WARN" &&
			fmt.Sprint(entry.fields["msg"]) == "dependency not ready" &&
			fmt.Sprint(entry.fields["operation"]) == "server.http.readyz" &&
			fmt.Sprint(entry.fields["component"]) == "postgres" &&
			fmt.Sprint(entry.fields["status"]) == "503" &&
			fmt.Sprint(entry.fields["request_id"]) == "req-readyz" &&
			fmt.Sprint(entry.fields["error"]) == "dial tcp postgres: i/o timeout" &&
			fmt.Sprint(entry.fields["trace_id"]) != ""
	}) {
		t.Fatalf("expected structured readiness warning log, got %+v", logger.entries)
	}
}

func TestRegisterHealthRoutesReadyzPDFWarmupNotReady(t *testing.T) {
	logger := &captureLogger{}
	srv := httpx.NewServer()
	registerHealthRoutes(
		srv,
		logger,
		sdktrace.NewTracerProvider(),
		stubReadinessPinger{},
		stubTemplatePDFWarmupReadiness{ready: false, body: "pdf warmup not ready"},
	)

	req := httptest.NewRequest(http.MethodGet, "/readyz", nil)
	req.Header.Set("X-Request-Id", "req-pdf-warmup")
	recorder := httptest.NewRecorder()
	srv.ServeHTTP(recorder, req)

	if recorder.Code != http.StatusServiceUnavailable {
		t.Fatalf("readyz status = %d, want %d", recorder.Code, http.StatusServiceUnavailable)
	}
	if body := strings.TrimSpace(recorder.Body.String()); body != "pdf warmup not ready" {
		t.Fatalf("readyz body = %q, want %q", body, "pdf warmup not ready")
	}

	if !logger.hasEntry(func(entry captureLogEntry) bool {
		return entry.level == "WARN" &&
			fmt.Sprint(entry.fields["msg"]) == "dependency not ready" &&
			fmt.Sprint(entry.fields["operation"]) == "server.http.readyz" &&
			fmt.Sprint(entry.fields["component"]) == "template_pdf_warmup" &&
			fmt.Sprint(entry.fields["status"]) == "503" &&
			fmt.Sprint(entry.fields["request_id"]) == "req-pdf-warmup"
	}) {
		t.Fatalf("expected structured pdf warmup warning log, got %+v", logger.entries)
	}
}

func TestRegisterHealthRoutesReadyzPDFWarmupFailed(t *testing.T) {
	logger := &captureLogger{}
	srv := httpx.NewServer()
	registerHealthRoutes(
		srv,
		logger,
		sdktrace.NewTracerProvider(),
		stubReadinessPinger{},
		stubTemplatePDFWarmupReadiness{
			ready: false,
			body:  "pdf warmup failed",
			err:   errors.New("chromium not found"),
		},
	)

	req := httptest.NewRequest(http.MethodGet, "/readyz", nil)
	recorder := httptest.NewRecorder()
	srv.ServeHTTP(recorder, req)

	if recorder.Code != http.StatusServiceUnavailable {
		t.Fatalf("readyz status = %d, want %d", recorder.Code, http.StatusServiceUnavailable)
	}
	if body := strings.TrimSpace(recorder.Body.String()); body != "pdf warmup failed" {
		t.Fatalf("readyz body = %q, want %q", body, "pdf warmup failed")
	}

	if !logger.hasEntry(func(entry captureLogEntry) bool {
		return entry.level == "WARN" &&
			fmt.Sprint(entry.fields["component"]) == "template_pdf_warmup" &&
			fmt.Sprint(entry.fields["error"]) == "chromium not found"
	}) {
		t.Fatalf("expected structured pdf warmup failure log, got %+v", logger.entries)
	}
}
