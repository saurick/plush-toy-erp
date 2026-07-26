package server

import (
	"context"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"

	v1 "server/api/jsonrpc/v1"

	httpx "github.com/go-kratos/kratos/v2/transport/http"
	"google.golang.org/protobuf/types/known/structpb"
)

type routeContractJSONRPCService struct {
	postCalls int
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
