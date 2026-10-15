package server

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	v1 "server/api/jsonrpc/v1"
	"server/internal/errcode"

	httpx "github.com/go-kratos/kratos/v2/transport/http"
	"go.opentelemetry.io/otel/attribute"
	"go.opentelemetry.io/otel/codes"
	sdktrace "go.opentelemetry.io/otel/sdk/trace"
	"go.opentelemetry.io/otel/sdk/trace/tracetest"
	oteltrace "go.opentelemetry.io/otel/trace"
)

type observedRPCStub struct {
	tp    *sdktrace.TracerProvider
	reply *v1.PostJsonrpcReply
}

func (s *observedRPCStub) PostJsonrpc(ctx context.Context, _ *v1.PostJsonrpcRequest) (*v1.PostJsonrpcReply, error) {
	_, span := s.tp.Tracer("test.sql").Start(ctx, "sql.conn.query")
	span.End()
	return s.reply, nil
}

func TestSafeServerTracingClassifiesRPCEnvelopeAndPreservesReply(t *testing.T) {
	for _, tc := range []struct {
		name, outcome string
		code          int32
		replyError    string
		status        codes.Code
	}{
		{name: "success", outcome: "success", code: errcode.OK.Code, status: codes.Ok},
		{name: "permission rejection", outcome: "rejected", code: errcode.PermissionDenied.Code, status: codes.Ok},
		{name: "system error in HTTP 200", outcome: "error", code: errcode.Internal.Code, status: codes.Error},
		{name: "domain system error", outcome: "error", code: errcode.UserListFailed.Code, status: codes.Error},
		{name: "reply error", outcome: "error", replyError: "private-reply-error", status: codes.Error},
	} {
		t.Run(tc.name, func(t *testing.T) {
			recorder := tracetest.NewSpanRecorder()
			tp := sdktrace.NewTracerProvider(sdktrace.WithSpanProcessor(recorder))
			defer func() { _ = tp.Shutdown(context.Background()) }()
			reply := &v1.PostJsonrpcReply{Jsonrpc: "2.0", Id: "trace-test", Result: &v1.JsonrpcResult{Code: tc.code, Message: "private-message"}, Error: tc.replyError}
			srv := httpx.NewServer(httpx.Filter(RequestIDFilter()), httpx.Middleware(safeServerTracing(tp)))
			v1.RegisterJsonrpcHTTPServer(srv, &observedRPCStub{tp: tp, reply: reply})
			req := httptest.NewRequest(http.MethodPost, "/rpc/inventory", strings.NewReader(`{"jsonrpc":"2.0","id":"trace-test","method":"post_purchase_receipt","params":{"password":"private-password"}}`))
			req.Header.Set("Content-Type", "application/json")
			req.Header.Set("X-Request-Id", "trace-request")
			req.Header.Set("traceparent", "00-11111111111111111111111111111111-2222222222222222-01")
			response := httptest.NewRecorder()
			srv.ServeHTTP(response, req)
			if response.Code != http.StatusOK {
				t.Fatalf("observability changed HTTP status: %d", response.Code)
			}
			var body struct {
				Error  string `json:"error"`
				Result struct {
					Code int32 `json:"code"`
				} `json:"result"`
			}
			if err := json.Unmarshal(response.Body.Bytes(), &body); err != nil || body.Result.Code != tc.code || body.Error != tc.replyError {
				t.Fatalf("observability changed RPC reply: %s", response.Body)
			}
			spans := recorder.Ended()
			if len(spans) != 2 {
				t.Fatalf("expected RPC and SQL spans, got %d", len(spans))
			}
			var root, child sdktrace.ReadOnlySpan
			for _, span := range spans {
				if span.SpanKind() == oteltrace.SpanKindServer {
					root = span
				} else {
					child = span
				}
				if strings.Contains(span.Status().Description, "private-") || len(span.Events()) > 0 && strings.Contains(span.Events()[0].Name, "private-") {
					t.Fatal("trace leaked private error text")
				}
				for _, attr := range span.Attributes() {
					if strings.Contains(attr.Value.String(), "private-") {
						t.Fatal("trace leaked payload")
					}
				}
			}
			if root == nil || child == nil || root.Name() != "rpc.inventory.post_purchase_receipt" || root.Status().Code != tc.status {
				t.Fatalf("RPC span does not describe %s", tc.name)
			}
			if child.Parent().SpanID() != root.SpanContext().SpanID() || root.SpanContext().TraceID().String() != "11111111111111111111111111111111" || root.Parent().SpanID().String() != "2222222222222222" {
				t.Fatal("RPC/SQL parent propagation was lost")
			}
			attrs := make(map[attribute.Key]attribute.Value)
			for _, attr := range root.Attributes() {
				attrs[attr.Key] = attr.Value
			}
			if attrs["outcome"].AsString() != tc.outcome || attrs["rpc.result_code"].AsInt64() != int64(tc.code) || attrs["http.request_id"].AsString() != "trace-request" {
				t.Fatalf("RPC result and request correlation differ from logs")
			}
		})
	}
}

func TestRPCTraceOperationBoundsUnknownInput(t *testing.T) {
	for _, req := range []*v1.PostJsonrpcRequest{nil, {Url: strings.Repeat("x", 200), Method: "private-secret\nvalue"}} {
		route, method := rpcTraceOperation(req, nil)
		if route != "unknown" || method != "unknown" {
			t.Fatal("unbounded input reached trace names")
		}
	}
	req := &v1.PostJsonrpcRequest{Url: "inventory", Method: "caller_defined_method"}
	_, method := rpcTraceOperation(req, &v1.PostJsonrpcReply{Result: &v1.JsonrpcResult{Code: errcode.UnknownMethod.Code}})
	if method != "unknown" {
		t.Fatal("unknown RPC name became a trace operation")
	}
}
