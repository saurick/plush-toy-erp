package server

import (
	"bytes"
	"context"
	"fmt"
	"io"
	stdhttp "net/http"
	"net/http/httptest"
	"strings"
	"testing"

	v1 "server/api/jsonrpc/v1"
	"server/internal/errcode"
	pkglogger "server/pkg/logger"

	"github.com/go-kratos/kratos/v2/log"
	httpx "github.com/go-kratos/kratos/v2/transport/http"
)

type observedRPCService struct {
	panics bool
	code   int32
	calls  int
}

func (s *observedRPCService) PostJsonrpc(context.Context, *v1.PostJsonrpcRequest) (*v1.PostJsonrpcReply, error) {
	s.calls++
	if s.panics {
		panic("private-panic-password-and-token")
	}
	return &v1.PostJsonrpcReply{Result: &v1.JsonrpcResult{Code: s.code}}, nil
}

func TestRequestLoggingCoversEarlyFailuresAndPanicOnce(t *testing.T) {
	for _, tc := range []struct {
		name, body, outcome string
		status              int
		oversized, chunked  bool
		panics              bool
		code                int32
		calls, errors       uint64
	}{
		{name: "success", body: `{ "method": "ping", "params": {} }`, outcome: "success", status: 200, calls: 1},
		{name: "business rejection", body: `{ "method": "ping", "params": {} }`, outcome: "rejected", status: 200, code: errcode.PermissionDenied.Code, calls: 1},
		{name: "malformed JSON", body: `{ "password": "private-invalid-body"`, outcome: "rejected", status: 400},
		{name: "known oversized", body: `{}`, outcome: "rejected", status: 413, oversized: true},
		{name: "chunked oversized", outcome: "rejected", status: 413, chunked: true},
		{name: "panic", body: `{ "method": "ping", "params": { "password": "private-password", "access_token": "private-token" } }`, outcome: "error", status: 500, panics: true, calls: 1, errors: 1},
	} {
		t.Run(tc.name, func(t *testing.T) {
			var output bytes.Buffer
			logger := log.With(log.NewStdLogger(&output), "request_id", pkglogger.RequestID())
			srv := httpx.NewServer(
				httpx.Filter(RequestIDFilter(), JSONRPCFailureLoggingFilter(logger), JSONRPCBodyLimitFilter()),
				httpx.RequestDecoder(BoundedRequestDecoder),
				httpx.Middleware(safeServerLogging(logger), safeServerRecovery(logger)),
			)
			service := &observedRPCService{panics: tc.panics, code: tc.code}
			v1.RegisterJsonrpcHTTPServer(srv, service)
			req := httptest.NewRequest(stdhttp.MethodPost, "/rpc/system?access_token=private-query", strings.NewReader(tc.body))
			req.Header.Set("Content-Type", "application/json")
			req.Header.Set(requestIDHeader, "req-log-integration")
			if tc.oversized {
				req.ContentLength = maxJSONRPCRequestBodyBytes + 1
			}
			if tc.chunked {
				req.ContentLength = -1
				req.Body = io.NopCloser(io.LimitReader(zeroReader{}, maxJSONRPCRequestBodyBytes+1))
			}
			beforeRequests := sharedRuntimeMetricCounters.rpcRequests.Load()
			beforeErrors := sharedRuntimeMetricCounters.rpcErrors.Load()
			response := httptest.NewRecorder()
			srv.ServeHTTP(response, req)
			if response.Code != tc.status || uint64(service.calls) != tc.calls {
				t.Fatalf("status=%d calls=%d; want status=%d calls=%d", response.Code, service.calls, tc.status, tc.calls)
			}
			text := output.String()
			for _, want := range []string{"request completed", "request_id=req-log-integration", "outcome=" + tc.outcome, "latency="} {
				if !strings.Contains(text, want) {
					t.Fatalf("missing %q in log", want)
				}
			}
			if strings.Count(text, "request completed") != 1 || strings.Contains(text, "private-") {
				t.Fatal("completion log is duplicated or contains private values")
			}
			if tc.panics && (!strings.Contains(text, "stack=") || strings.Contains(response.Body.String(), "private-")) {
				t.Fatal("panic lost its stack or leaked its value to the response")
			}
			if got := sharedRuntimeMetricCounters.rpcRequests.Load() - beforeRequests; got != 1 {
				t.Fatalf("request counter=%d, want 1", got)
			}
			if got := sharedRuntimeMetricCounters.rpcErrors.Load() - beforeErrors; got != tc.errors {
				t.Fatalf("error counter=%d, want %d", got, tc.errors)
			}
		})
	}
}

func TestEarlyFailureLoggingSkipsHealthAndSanitizesUnknownRPCPath(t *testing.T) {
	var output bytes.Buffer
	logger := log.NewStdLogger(&output)
	srv := httpx.NewServer(httpx.Filter(RequestIDFilter(), JSONRPCFailureLoggingFilter(logger)))
	srv.HandleFunc("/healthz", func(w stdhttp.ResponseWriter, _ *stdhttp.Request) { w.WriteHeader(200) })
	for _, path := range []string{"/healthz", "/rpc/private-path/extra?password=private-query"} {
		res := httptest.NewRecorder()
		srv.ServeHTTP(res, httptest.NewRequest(stdhttp.MethodGet, path, nil))
	}
	text := output.String()
	if strings.Count(text, "request completed") != 1 || !strings.Contains(text, "path=/rpc/unknown") || strings.Contains(text, "private-") {
		t.Fatal("health was logged or an unknown path was exposed")
	}
}

func TestCustomHTTPPanicOmitsPanicValue(t *testing.T) {
	var output bytes.Buffer
	handler := newObservedHTTPHandler(log.NewStdLogger(&output), nil, "test.panic", func(context.Context, stdhttp.ResponseWriter, *stdhttp.Request) {
		panic(fmt.Errorf("private-custom-panic"))
	})
	res := httptest.NewRecorder()
	handler.ServeHTTP(res, httptest.NewRequest(stdhttp.MethodGet, "/test", nil))
	if res.Code != 500 || strings.Contains(output.String(), "private-custom-panic") || strings.Contains(res.Body.String(), "private-custom-panic") {
		t.Fatal("custom handler did not recover safely")
	}
	if !strings.Contains(output.String(), "stack=") {
		t.Fatal("custom panic lacks stack diagnostics")
	}
}

func TestCustomHTTPFailuresHaveOutcomeAndDoNotCountAsRPC(t *testing.T) {
	for _, status := range []int{200, 401, 500} {
		var output bytes.Buffer
		logger := pkglogger.NewStdColorLogger(&output, true, false)
		before := sharedRuntimeMetricCounters.rpcRequests.Load()
		handler := newObservedHTTPHandler(logger, nil, "server.http.template_pdf", func(ctx context.Context, w stdhttp.ResponseWriter, _ *stdhttp.Request) {
			chain := safeServerLogging(logger)(func(context.Context, any) (any, error) { w.WriteHeader(status); return nil, nil })
			_, _ = chain(ctx, struct{}{})
		})
		response := httptest.NewRecorder()
		handler.ServeHTTP(response, httptest.NewRequest(stdhttp.MethodPost, "/templates/render-pdf", nil))
		if sharedRuntimeMetricCounters.rpcRequests.Load() != before {
			t.Fatal("custom HTTP request polluted RPC counters")
		}
		text := output.String()
		if status == 200 && text != "" {
			t.Fatal("successful HTTP request added production log noise")
		}
		if status >= 400 {
			want := "rejected"
			if status >= 500 {
				want = "error"
			}
			if !strings.Contains(text, `"outcome":"`+want+`"`) || strings.Count(text, "custom http handler completed") != 1 {
				t.Fatal("HTTP failure is missing or duplicated")
			}
		}
	}
}
