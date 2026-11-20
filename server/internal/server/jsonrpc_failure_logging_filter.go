package server

import (
	"context"
	stdhttp "net/http"
	"strings"
	"time"

	pkglogger "server/pkg/logger"

	"github.com/go-kratos/kratos/v2/log"
	httpx "github.com/go-kratos/kratos/v2/transport/http"
)

type rpcCompletionKey struct{}
type rpcCompletionState struct{ recorded bool }

// Decoder and body-limit failures return before the RPC middleware. Record
// those failures once while leaving normal RPC logging and health polls alone.
func JSONRPCFailureLoggingFilter(logger log.Logger) httpx.FilterFunc {
	helper := log.NewHelper(log.With(logger, "logger.name", "server.http"))
	return func(next stdhttp.Handler) stdhttp.Handler {
		return stdhttp.HandlerFunc(func(w stdhttp.ResponseWriter, r *stdhttp.Request) {
			if !strings.HasPrefix(r.URL.Path, "/rpc/") {
				next.ServeHTTP(w, r)
				return
			}
			state := &rpcCompletionState{}
			ctx := context.WithValue(r.Context(), rpcCompletionKey{}, state)
			recorder := &statusCapturingResponseWriter{ResponseWriter: w}
			start := time.Now()
			next.ServeHTTP(recorder, r.WithContext(ctx))
			status := recorder.StatusCode()
			if state.recorded || status < stdhttp.StatusBadRequest {
				return
			}
			outcome, level := "rejected", log.LevelWarn
			if status >= stdhttp.StatusInternalServerError {
				outcome, level = "error", log.LevelError
			}
			path := "/rpc/unknown"
			if route := strings.TrimPrefix(r.URL.Path, "/rpc/"); traceOperationToken.MatchString(route) {
				path = "/rpc/" + route
			}
			duration := time.Since(start)
			sharedRuntimeMetricCounters.observeRPC(duration, outcome == "error")
			helper.WithContext(ctx).Log(level,
				"msg", "request completed",
				"component", "http",
				"method", r.Method,
				"path", path,
				"status", status,
				"outcome", outcome,
				"reason", stdhttp.StatusText(status),
				"latency", duration.Seconds(),
				"request_id", pkglogger.RequestIDFromContext(ctx),
			)
		})
	}
}
