package server

import (
	"context"
	"crypto/sha256"
	"crypto/subtle"
	"database/sql"
	"encoding/hex"
	"fmt"
	stdhttp "net/http"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/go-kratos/kratos/v2/log"
	httpx "github.com/go-kratos/kratos/v2/transport/http"
	"go.opentelemetry.io/otel"
	"go.opentelemetry.io/otel/attribute"
	"go.opentelemetry.io/otel/codes"
	"go.opentelemetry.io/otel/propagation"
	sdktrace "go.opentelemetry.io/otel/sdk/trace"
	oteltrace "go.opentelemetry.io/otel/trace"
)

type readinessPinger interface {
	PingContext(ctx context.Context) error
}

type readinessIdentityReader interface {
	QueryRowContext(ctx context.Context, query string, args ...any) *sql.Row
}

const (
	runtimeIdentityPath          = "/readyz/runtime-identity"
	runtimeIdentityDigestHeader  = "X-ERP-Expected-Runtime-Identity-SHA256"
	runtimeIdentityScopeHeader   = "X-ERP-Runtime-Identity-Scope"
	runtimeIdentityProofHeader   = "X-ERP-Runtime-Identity-Proof"
	runtimeIdentityProofValue    = "matched-v1"
	runtimeIdentityDatabaseScope = "database-v1"
	runtimeIdentityReleaseScope  = "release-v1"
)

type templatePDFWarmupReadiness interface {
	TemplatePDFWarmupReady() (bool, string, error)
}

type statusCapturingResponseWriter struct {
	stdhttp.ResponseWriter
	status int
}

func (w *statusCapturingResponseWriter) WriteHeader(status int) {
	w.status = status
	w.ResponseWriter.WriteHeader(status)
}

func (w *statusCapturingResponseWriter) Write(p []byte) (int, error) {
	if w.status == 0 {
		w.status = stdhttp.StatusOK
	}
	return w.ResponseWriter.Write(p)
}

func (w *statusCapturingResponseWriter) StatusCode() int {
	if w.status == 0 {
		return stdhttp.StatusOK
	}
	return w.status
}

func requestIDFromRequest(r *stdhttp.Request) string {
	if r == nil {
		return ""
	}
	if requestID := r.Header.Get("X-Request-Id"); requestID != "" {
		return requestID
	}
	return r.Header.Get("X-Request-ID")
}

func traceIDFromContext(ctx context.Context) string {
	spanCtx := oteltrace.SpanContextFromContext(ctx)
	if spanCtx.HasTraceID() {
		return spanCtx.TraceID().String()
	}
	return ""
}

func spanIDFromContext(ctx context.Context) string {
	spanCtx := oteltrace.SpanContextFromContext(ctx)
	if spanCtx.HasSpanID() {
		return spanCtx.SpanID().String()
	}
	return ""
}

func writePlainText(w stdhttp.ResponseWriter, status int, body string) {
	w.Header().Set("Content-Type", "text/plain; charset=utf-8")
	w.WriteHeader(status)
	_, _ = w.Write([]byte(body))
}

func runtimeIdentityDigest(scope, databaseName, release, migration string) []byte {
	fields := []string{scope, strings.TrimSpace(databaseName)}
	if scope == runtimeIdentityReleaseScope {
		fields = append(fields, strings.TrimSpace(release), strings.TrimSpace(migration))
	}
	digest := sha256.Sum256([]byte(strings.Join(fields, "\n")))
	return digest[:]
}

func verifyExpectedRuntimeIdentity(ctx context.Context, postgres readinessPinger, r *stdhttp.Request) (int, error) {
	if r.Method != stdhttp.MethodGet {
		return stdhttp.StatusMethodNotAllowed, fmt.Errorf("runtime identity probe requires GET")
	}
	scope := strings.TrimSpace(r.Header.Get(runtimeIdentityScopeHeader))
	if scope != runtimeIdentityDatabaseScope && scope != runtimeIdentityReleaseScope {
		return stdhttp.StatusBadRequest, fmt.Errorf("runtime identity scope is invalid")
	}
	expectedDigest, err := hex.DecodeString(strings.TrimSpace(r.Header.Get(runtimeIdentityDigestHeader)))
	if err != nil || len(expectedDigest) != sha256.Size {
		return stdhttp.StatusBadRequest, fmt.Errorf("runtime identity digest is invalid")
	}
	reader, ok := postgres.(readinessIdentityReader)
	if !ok {
		return stdhttp.StatusServiceUnavailable, fmt.Errorf("runtime identity reader unavailable")
	}
	var actualDatabase string
	if err := reader.QueryRowContext(ctx, `SELECT current_database()`).Scan(&actualDatabase); err != nil {
		return stdhttp.StatusServiceUnavailable, fmt.Errorf("read runtime database identity: %w", err)
	}
	actualRelease := ""
	var actualMigration string
	if scope == runtimeIdentityReleaseScope {
		actualRelease = strings.TrimSpace(os.Getenv("GIT_SHA"))
		if err := reader.QueryRowContext(ctx, `
SELECT version
FROM atlas_schema_revisions.atlas_schema_revisions
WHERE type = 2
ORDER BY executed_at DESC
LIMIT 1`).Scan(&actualMigration); err != nil {
			return stdhttp.StatusServiceUnavailable, fmt.Errorf("read runtime migration identity: %w", err)
		}
	}
	actualDigest := runtimeIdentityDigest(scope, actualDatabase, actualRelease, actualMigration)
	if subtle.ConstantTimeCompare(actualDigest, expectedDigest) != 1 {
		return stdhttp.StatusPreconditionFailed, fmt.Errorf("runtime identity mismatch")
	}
	return 0, nil
}

// 统一给自定义 HTTP handler 补 trace、recover 和结构化收尾日志，避免健康检查与静态路由成为观测盲区。
func newObservedHTTPHandler(
	logger log.Logger,
	tp *sdktrace.TracerProvider,
	operation string,
	handler func(ctx context.Context, w stdhttp.ResponseWriter, r *stdhttp.Request),
) stdhttp.Handler {
	helper := log.NewHelper(log.With(logger, "logger.name", "server.http.custom"))
	tracer := otel.Tracer("server.http.custom")
	if tp != nil {
		tracer = tp.Tracer("server.http.custom")
	}

	return stdhttp.HandlerFunc(func(w stdhttp.ResponseWriter, r *stdhttp.Request) {
		baseCtx := r.Context()
		baseCtx = otel.GetTextMapPropagator().Extract(baseCtx, propagation.HeaderCarrier(r.Header))
		httpx.SetOperation(baseCtx, operation)

		ctx, span := tracer.Start(baseCtx, operation, oteltrace.WithSpanKind(oteltrace.SpanKindServer))
		defer span.End()

		recorder := &statusCapturingResponseWriter{ResponseWriter: w}
		req := r.WithContext(ctx)
		requestID := requestIDFromRequest(req)
		start := time.Now()
		var panicErr error

		defer func() {
			status := recorder.StatusCode()
			duration := time.Since(start)

			span.SetAttributes(
				attribute.String("http.method", req.Method),
				attribute.String("http.path", req.URL.Path),
				attribute.Int("http.status_code", status),
			)
			if requestID != "" {
				span.SetAttributes(attribute.String("http.request_id", requestID))
			}

			if panicErr != nil {
				span.RecordError(panicErr)
				span.SetStatus(codes.Error, panicErr.Error())
				helper.WithContext(ctx).Errorw(
					"msg", "custom http handler panic",
					"operation", operation,
					"method", req.Method,
					"path", req.URL.Path,
					"status", status,
					"duration", duration.String(),
					"request_id", requestID,
					"trace_id", traceIDFromContext(ctx),
					"span_id", spanIDFromContext(ctx),
					"error", panicErr.Error(),
				)
				return
			}

			if status >= stdhttp.StatusBadRequest {
				span.SetStatus(codes.Error, stdhttp.StatusText(status))
			} else {
				span.SetStatus(codes.Ok, "OK")
			}

			helper.WithContext(ctx).Debugw(
				"msg", "custom http handler completed",
				"operation", operation,
				"method", req.Method,
				"path", req.URL.Path,
				"status", status,
				"duration", duration.String(),
				"request_id", requestID,
				"trace_id", traceIDFromContext(ctx),
				"span_id", spanIDFromContext(ctx),
			)
		}()

		defer func() {
			if recovered := recover(); recovered != nil {
				panicErr = fmt.Errorf("panic recovered: %v", recovered)
				if recorder.status == 0 {
					writePlainText(recorder, stdhttp.StatusInternalServerError, stdhttp.StatusText(stdhttp.StatusInternalServerError))
				}
			}
		}()

		handler(ctx, recorder, req)
	})
}

func registerHealthRoutes(
	srv *httpx.Server,
	logger log.Logger,
	tp *sdktrace.TracerProvider,
	postgres readinessPinger,
	pdfWarmup templatePDFWarmupReadiness,
) {
	healthLogger := log.NewHelper(log.With(logger, "logger.name", "server.http.health"))

	srv.Handle("/ping", newObservedHTTPHandler(logger, tp, "server.http.ping", func(ctx context.Context, w stdhttp.ResponseWriter, r *stdhttp.Request) {
		writePlainText(w, stdhttp.StatusOK, "pong")
	}))

	srv.Handle("/healthz", newObservedHTTPHandler(logger, tp, "server.http.healthz", func(ctx context.Context, w stdhttp.ResponseWriter, r *stdhttp.Request) {
		writePlainText(w, stdhttp.StatusOK, "ok")
	}))

	srv.Handle(runtimeIdentityPath, newObservedHTTPHandler(logger, tp, "server.http.runtime_identity", func(ctx context.Context, w stdhttp.ResponseWriter, r *stdhttp.Request) {
		w.Header().Set("Cache-Control", "no-store")
		status, err := verifyExpectedRuntimeIdentity(ctx, postgres, r)
		if err != nil {
			if status == stdhttp.StatusMethodNotAllowed {
				w.Header().Set("Allow", stdhttp.MethodGet)
			}
			healthLogger.WithContext(ctx).Warnw(
				"msg", "runtime identity precondition failed",
				"operation", "server.http.runtime_identity",
				"component", "runtime_identity",
				"status", status,
				"request_id", requestIDFromRequest(r),
				"trace_id", traceIDFromContext(ctx),
				"error", err.Error(),
			)
			body := "runtime identity unavailable"
			switch status {
			case stdhttp.StatusBadRequest:
				body = "runtime identity request invalid"
			case stdhttp.StatusMethodNotAllowed:
				body = "method not allowed"
			case stdhttp.StatusPreconditionFailed:
				body = "runtime identity mismatch"
			}
			writePlainText(w, status, body)
			return
		}
		w.Header().Set(runtimeIdentityProofHeader, runtimeIdentityProofValue)
		writePlainText(w, stdhttp.StatusOK, "runtime identity matched")
	}))

	srv.Handle("/readyz", newObservedHTTPHandler(logger, tp, "server.http.readyz", func(ctx context.Context, w stdhttp.ResponseWriter, r *stdhttp.Request) {
		if postgres != nil {
			if err := postgres.PingContext(ctx); err != nil {
				healthLogger.WithContext(ctx).Warnw(
					"msg", "dependency not ready",
					"operation", "server.http.readyz",
					"component", "postgres",
					"status", stdhttp.StatusServiceUnavailable,
					"request_id", requestIDFromRequest(r),
					"trace_id", traceIDFromContext(ctx),
					"error", err.Error(),
				)
				writePlainText(w, stdhttp.StatusServiceUnavailable, "postgres not ready")
				return
			}
		}

		if pdfWarmup != nil {
			ready, body, err := pdfWarmup.TemplatePDFWarmupReady()
			if !ready {
				if body == "" {
					body = "pdf warmup not ready"
				}
				logFields := []interface{}{
					"msg", "dependency not ready",
					"operation", "server.http.readyz",
					"component", "template_pdf_warmup",
					"status", stdhttp.StatusServiceUnavailable,
					"request_id", requestIDFromRequest(r),
					"trace_id", traceIDFromContext(ctx),
				}
				if err != nil {
					logFields = append(logFields, "error", err.Error())
				}
				healthLogger.WithContext(ctx).Warnw(logFields...)
				writePlainText(w, stdhttp.StatusServiceUnavailable, body)
				return
			}
		}

		writePlainText(w, stdhttp.StatusOK, "ready")
	}))
}

func registerStaticHandler(srv *httpx.Server, logger log.Logger, tp *sdktrace.TracerProvider) {
	// 优先用环境变量 STATIC_DIR，没有的话默认 /app/public（容器内）。
	staticDir := os.Getenv("STATIC_DIR")
	if staticDir == "" {
		staticDir = "/app/public"
	}

	if fi, err := os.Stat(staticDir); err == nil && fi.IsDir() {
		log.Infof("http static dir enabled: %s", staticDir)
		fileServer := stdhttp.FileServer(stdhttp.Dir(staticDir))

		srv.HandlePrefix("/", newObservedHTTPHandler(logger, tp, "server.http.static", func(ctx context.Context, w stdhttp.ResponseWriter, r *stdhttp.Request) {
			path := r.URL.Path
			if path == "" || path == "/" {
				fileServer.ServeHTTP(w, r)
				return
			}

			fp := filepath.Join(staticDir, filepath.Clean(path))
			if fi, err := os.Stat(fp); err == nil && !fi.IsDir() {
				fileServer.ServeHTTP(w, r)
				return
			}

			indexPath := filepath.Join(staticDir, "index.html")
			if _, err := os.Stat(indexPath); err == nil {
				stdhttp.ServeFile(w, r, indexPath)
				return
			}

			stdhttp.NotFound(w, r)
		}))
		return
	}

	log.Infof("http static dir not found or not dir: %s, skip static handler", staticDir)
}
