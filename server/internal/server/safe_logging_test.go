package server

import (
	"strings"
	"testing"

	v1 "server/api/jsonrpc/v1"

	"google.golang.org/protobuf/types/known/structpb"
)

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
