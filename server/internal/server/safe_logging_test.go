package server

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"

	v1 "server/api/jsonrpc/v1"
	"server/internal/errcode"
	pkglogger "server/pkg/logger"

	"github.com/go-kratos/kratos/v2/log"
	httpx "github.com/go-kratos/kratos/v2/transport/http"
	"google.golang.org/protobuf/types/known/structpb"
)

func TestSafeServerLoggingRecordsBusinessOutcomeWithoutPayloads(t *testing.T) {
	for _, tc := range []struct {
		name, outcome, level string
		code                 int32
		replyError           string
		err                  error
	}{
		{name: "success", outcome: "success", level: "INFO", code: errcode.OK.Code},
		{name: "business rejection", outcome: "rejected", level: "WARN", code: errcode.PermissionDenied.Code},
		{name: "internal error", outcome: "error", level: "ERROR", code: errcode.Internal.Code},
		{name: "domain system error", outcome: "error", level: "ERROR", code: errcode.UserListFailed.Code},
		{name: "reply error", outcome: "error", level: "ERROR", replyError: "private-reply-error"},
		{name: "transport error", outcome: "error", level: "ERROR", err: errors.New("private-transport-error")},
	} {
		t.Run(tc.name, func(t *testing.T) {
			var output bytes.Buffer
			logger := log.With(log.NewStdLogger(&output), "request_id", pkglogger.RequestID())
			payload, _ := structpb.NewStruct(map[string]any{"password": "private-password", "note": "private-note"})
			response := &v1.PostJsonrpcReply{Result: &v1.JsonrpcResult{Code: tc.code, Message: "private-message", Data: payload}, Error: tc.replyError}
			handler := safeServerLogging(logger)(func(context.Context, any) (any, error) { return response, tc.err })
			before := sharedRuntimeMetricCounters.rpcErrors.Load()
			got, err := handler(pkglogger.WithRequestID(context.Background(), "req-outcome"), &v1.PostJsonrpcRequest{Url: "system", Method: "ping", Id: "rpc-outcome", Params: payload})
			if got != response || !errors.Is(err, tc.err) {
				t.Fatalf("logging changed the response or error")
			}
			text := output.String()
			for _, want := range []string{tc.level, "request completed", "outcome=" + tc.outcome, fmt.Sprintf("rpc_result_code=%d", tc.code), "request_id=req-outcome", "id=rpc-outcome", "latency="} {
				if !strings.Contains(text, want) {
					t.Fatalf("missing %q: %s", want, text)
				}
			}
			if strings.Count(text, "request completed") != 1 || strings.Contains(text, "private-") {
				t.Fatalf("duplicated or unsafe completion log: %s", text)
			}
			wantErrors := uint64(0)
			if tc.outcome == "error" {
				wantErrors = 1
			}
			if gotErrors := sharedRuntimeMetricCounters.rpcErrors.Load() - before; gotErrors != wantErrors {
				t.Fatalf("error counter disagrees with outcome %q: got %d want %d", tc.outcome, gotErrors, wantErrors)
			}
		})
	}
}

type routeContractJSONRPCService struct {
	postCalls int
}

func TestSafeServerLoggingDoesNotInventBusinessCodeForMissingResult(t *testing.T) {
	for _, reply := range []any{nil, (*v1.PostJsonrpcReply)(nil), &v1.PostJsonrpcReply{}} {
		var output bytes.Buffer
		handler := safeServerLogging(log.NewStdLogger(&output))(func(context.Context, any) (any, error) { return reply, nil })
		_, _ = handler(context.Background(), &v1.PostJsonrpcRequest{Url: "system", Method: "ping"})
		text := output.String()
		if !strings.Contains(text, "ERROR") || !strings.Contains(text, "outcome=error") || strings.Contains(text, "rpc_result_code=") {
			t.Fatalf("missing result was misreported: %s", text)
		}
	}
}

func (s *routeContractJSONRPCService) PostJsonrpc(_ context.Context, req *v1.PostJsonrpcRequest) (*v1.PostJsonrpcReply, error) {
	s.postCalls++
	return &v1.PostJsonrpcReply{
		Jsonrpc: "2.0",
		Id:      req.GetId(),
		Result:  &v1.JsonrpcResult{},
	}, nil
}

func TestSafeRequestSummaryOmitsJSONRPCParams(t *testing.T) {
	params, err := structpb.NewStruct(map[string]any{
		"username":     "demo_user",
		"password":     "must-not-appear",
		"access_token": "must-not-appear-either",
	})
	if err != nil {
		t.Fatalf("build params: %v", err)
	}
	summary := safeRequestSummary(&v1.PostJsonrpcRequest{
		Url: "auth", Method: "admin_login", Id: "login-1", Params: params,
	})
	for _, secret := range []string{"must-not-appear", "must-not-appear-either", "demo_user"} {
		if strings.Contains(summary, secret) {
			t.Fatalf("safe request summary leaked %q: %s", secret, summary)
		}
	}
	if summary != "jsonrpc.post url=auth method=admin_login id=login-1" {
		t.Fatalf("unexpected summary: %s", summary)
	}
}

func TestSafeRequestSummaryDoesNotStringifyUnknownRequests(t *testing.T) {
	summary := safeRequestSummary(struct{ Password string }{Password: "must-not-appear"})
	if strings.Contains(summary, "must-not-appear") {
		t.Fatalf("unknown request summary leaked payload: %s", summary)
	}
	if summary != "type=struct { Password string }" {
		t.Fatalf("unexpected summary: %s", summary)
	}
}

func TestSafeCompletionGetsTrustedIdentitiesFromChildContext(t *testing.T) {
	var output bytes.Buffer
	ctx := pkglogger.WithRequestID(context.Background(), "req-identity")
	handler := safeServerLogging(log.NewStdLogger(&output))(func(ctx context.Context, _ any) (any, error) {
		child, cancel := context.WithCancel(ctx)
		defer cancel()
		pkglogger.SetRequestActor(child, 7)
		pkglogger.SetRequestObject(child, "finance_fact", 42)
		pkglogger.WithTaskID(child, 51)
		return &v1.PostJsonrpcReply{Result: &v1.JsonrpcResult{Code: errcode.OK.Code}}, nil
	})
	params, _ := structpb.NewStruct(map[string]any{"actor_id": 999, "password": "private-password"})
	_, _ = handler(ctx, &v1.PostJsonrpcRequest{Url: "operational_fact", Method: "post_finance_fact", Params: params})
	text := output.String()
	for _, want := range []string{"actor_id=7", "business_object_kind=finance_fact", "business_object_id=42", "task.id=51"} {
		if !strings.Contains(text, want) {
			t.Fatalf("missing %q", want)
		}
	}
	if strings.Contains(text, "999") || strings.Contains(text, "private-password") {
		t.Fatal("untrusted identities or payload were logged")
	}
	if pkglogger.TaskID()(ctx) != int64(51) {
		t.Fatal("task ID did not flow back to the completion logger")
	}
	other := pkglogger.WithRequestID(pkglogger.WithTaskID(ctx, 51), "req-other")
	if fields := pkglogger.RequestObservationFields(other); len(fields) != 0 {
		t.Fatal("identities leaked into another request")
	}
	if pkglogger.TaskID()(other) != "" {
		t.Fatal("task ID leaked into another request")
	}
}

func TestJSONRPCRouteRejectsGETBeforeDispatcher(t *testing.T) {
	service := &routeContractJSONRPCService{}
	srv := httpx.NewServer()
	v1.RegisterJsonrpcHTTPServer(srv, service)

	for _, testCase := range []struct {
		domain string
		method string
	}{
		{domain: "auth", method: "admin_login"},
		{domain: "workflow", method: "create_task"},
		{domain: "operational_fact", method: "post_finance_fact"},
	} {
		t.Run(testCase.domain+"/"+testCase.method, func(t *testing.T) {
			query := url.Values{
				"jsonrpc": {"2.0"},
				"id":      {"blocked-get"},
				"method":  {testCase.method},
				"params":  {`{"test":"only"}`},
			}
			req := httptest.NewRequest(http.MethodGet, "/rpc/"+testCase.domain+"?"+query.Encode(), nil)
			recorder := httptest.NewRecorder()
			srv.ServeHTTP(recorder, req)

			if recorder.Code != http.StatusNotFound && recorder.Code != http.StatusMethodNotAllowed {
				t.Fatalf("GET status = %d, want 404 or 405", recorder.Code)
			}
		})
	}

	if service.postCalls != 0 {
		t.Fatalf("GET reached JSON-RPC dispatcher %d times", service.postCalls)
	}

	req := httptest.NewRequest(
		http.MethodPost,
		"/rpc/system",
		strings.NewReader(`{"jsonrpc":"2.0","id":"post-still-works","method":"ping","params":{}}`),
	)
	req.Header.Set("Content-Type", "application/json")
	recorder := httptest.NewRecorder()
	srv.ServeHTTP(recorder, req)
	if recorder.Code != http.StatusOK {
		t.Fatalf("POST status = %d, want %d", recorder.Code, http.StatusOK)
	}
	if service.postCalls != 1 {
		t.Fatalf("POST calls = %d, want 1", service.postCalls)
	}
}
