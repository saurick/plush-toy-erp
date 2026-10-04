package service

import (
	"bytes"
	"context"
	"strings"
	"testing"

	"server/internal/biz"
	"server/internal/errcode"
	pkglogger "server/pkg/logger"

	"github.com/go-kratos/kratos/v2/log"
	"golang.org/x/time/rate"
)

func clientErrorTestParams() map[string]any {
	return map[string]any{"kind": "react_render", "error_name": "TypeError", "fingerprint": "1234abcd", "path": "/erp/customers/private-customer?token=private-token", "build": "local", "frames": []any{"/assets/app.js:12:8", "/src/erp/api/purchase.mjs:18:2"}, "origin_request_id": "req-origin"}
}

func TestClientErrorReportingUsesAuthenticationAndSafeBoundedFields(t *testing.T) {
	var output bytes.Buffer
	d := &jsonrpcDispatcher{log: log.NewHelper(log.With(log.NewStdLogger(&output), "request_id", pkglogger.RequestID()))}
	for _, state := range []biz.AuthState{biz.AuthNone, biz.AuthExpired, biz.AuthInvalid} {
		_, result, err := d.reportClientError(biz.WithAuthState(context.Background(), state), "report", clientErrorTestParams())
		if err != nil || result.Code == errcode.OK.Code || output.Len() != 0 {
			t.Fatal("anonymous or invalid session emitted a report")
		}
	}
	ctx := biz.NewContextWithClaims(pkglogger.WithRequestID(context.Background(), "req-browser-report"), &biz.AuthClaims{UserID: 7, Role: biz.RoleAdmin})
	_, result, err := d.reportClientError(ctx, "report", clientErrorTestParams())
	if err != nil || result.Code != errcode.OK.Code {
		t.Fatal("valid authenticated report rejected")
	}
	text := output.String()
	for _, want := range []string{"outcome=error", "actor_id=7", "web_build=local", "request_id=req-browser-report", "origin_request_id=req-origin", "/assets/app.js:12:8", "/src/erp/api/purchase.mjs:18:2"} {
		if !strings.Contains(text, want) {
			t.Fatalf("missing %q", want)
		}
	}
	if strings.Contains(text, "private-") {
		t.Fatal("report leaked untrusted path or query data")
	}
}

func TestClientErrorReportingRejectsRawPayloadsAndLimitsFlood(t *testing.T) {
	var output bytes.Buffer
	d := &jsonrpcDispatcher{log: log.NewHelper(log.NewStdLogger(&output))}
	ctx := biz.NewContextWithClaims(context.Background(), &biz.AuthClaims{UserID: 7, Role: biz.RoleAdmin})
	for _, mutate := range []func(map[string]any){
		func(pm map[string]any) { pm["password"] = "private-password" },
		func(pm map[string]any) {
			pm["frames"] = []any{"https://private-host/assets/app.js?access_token=private:12:8"}
		},
		func(pm map[string]any) { pm["frames"] = []any{"/assets/../private/app.js:1:1"} },
		func(pm map[string]any) { pm["error_name"] = "private-customer-name" },
		func(pm map[string]any) { pm["origin_request_id"] = "private token\n" },
		func(pm map[string]any) { pm["path"] = map[string]any{"private": "payload"} },
		func(pm map[string]any) { delete(pm, "path") },
		func(pm map[string]any) { pm["origin_request_id"] = []any{"private-token"} },
	} {
		pm := clientErrorTestParams()
		mutate(pm)
		_, result, _ := d.reportClientError(ctx, "report", pm)
		if result.Code != errcode.InvalidParam.Code || output.Len() != 0 {
			t.Fatal("unsafe report was accepted or logged")
		}
	}
	previous := clientErrorBudget
	clientErrorBudget = rate.NewLimiter(0, 1)
	t.Cleanup(func() { clientErrorBudget = previous })
	for i := 0; i < 3; i++ {
		_, result, _ := d.reportClientError(ctx, "report", clientErrorTestParams())
		if result.Code != errcode.OK.Code {
			t.Fatal("best-effort reporting changed the business response")
		}
	}
	if strings.Count(output.String(), "browser runtime failed") != 1 {
		t.Fatal("report flood exceeded the server budget")
	}
}
