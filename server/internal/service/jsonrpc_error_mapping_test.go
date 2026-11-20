package service

import (
	"context"
	"io"
	"testing"

	"server/internal/biz"
	"server/internal/errcode"

	"github.com/go-kratos/kratos/v2/log"
)

type stubAdminAccountReader struct {
	admin *biz.AdminUser
	err   error
}

func (s stubAdminAccountReader) GetAdminByID(_ context.Context, _ int) (*biz.AdminUser, error) {
	return s.admin, s.err
}

func TestJsonrpcDispatcher_AuthMe_UnauthorizedUsesAuthRequired(t *testing.T) {
	j := &jsonrpcDispatcher{
		log: log.NewHelper(log.With(log.NewStdLogger(io.Discard), "module", "service.jsonrpc.test")),
	}

	_, res, err := j.handleAuth(context.Background(), "me", "1", nil)
	if err != nil {
		t.Fatalf("expected nil err, got %v", err)
	}
	if res == nil {
		t.Fatalf("expected result not nil")
	}
	if res.Code != errcode.AuthRequired.Code {
		t.Fatalf("expected code=%d, got %d", errcode.AuthRequired.Code, res.Code)
	}
}

func TestJsonrpcDispatcher_RequireAdmin_DisabledAdminUsesAdminDisabled(t *testing.T) {
	j := &jsonrpcDispatcher{
		log:         log.NewHelper(log.With(log.NewStdLogger(io.Discard), "module", "service.jsonrpc.test")),
		adminReader: stubAdminAccountReader{admin: &biz.AdminUser{ID: 1, Username: "admin", Disabled: true}},
	}

	ctx := biz.NewContextWithClaims(context.Background(), &biz.AuthClaims{
		UserID:   1,
		Username: "admin",
		Role:     biz.RoleAdmin,
	})

	_, adminRes := j.requireAdmin(ctx)
	if adminRes == nil {
		t.Fatalf("expected admin result not nil")
	}
	if adminRes.Code != errcode.AdminDisabled.Code {
		t.Fatalf("expected admin code=%d, got %d", errcode.AdminDisabled.Code, adminRes.Code)
	}
}

func TestJsonrpcDispatcher_HandleWorkflowRequiresActiveAdmin(t *testing.T) {
	tests := []struct {
		name        string
		ctx         context.Context
		adminReader stubAdminAccountReader
		wantCode    int32
	}{
		{
			name:     "not logged in",
			ctx:      context.Background(),
			wantCode: errcode.AuthRequired.Code,
		},
		{
			name: "disabled admin",
			ctx: biz.NewContextWithClaims(context.Background(), &biz.AuthClaims{
				UserID: 1,
				Role:   biz.RoleAdmin,
			}),
			adminReader: stubAdminAccountReader{admin: &biz.AdminUser{ID: 1, Username: "disabled", Disabled: true}},
			wantCode:    errcode.AdminDisabled.Code,
		},
		{
			name: "non admin",
			ctx: biz.NewContextWithClaims(context.Background(), &biz.AuthClaims{
				UserID: 2,
				Role:   biz.RoleUser,
			}),
			wantCode: errcode.AdminRequired.Code,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			dispatcher := &jsonrpcDispatcher{
				log:         log.NewHelper(log.With(log.NewStdLogger(io.Discard), "module", "service.jsonrpc.test")),
				adminReader: tt.adminReader,
				// Keep the usecase nil so the expected auth result also proves that
				// handleWorkflow stops before dispatching into Workflow logic.
				workflowUC: nil,
			}

			_, result, err := dispatcher.handleWorkflow(tt.ctx, "metadata", tt.name, nil)
			if err != nil {
				t.Fatalf("handleWorkflow() error = %v", err)
			}
			if result == nil || result.Code != tt.wantCode {
				t.Fatalf("handleWorkflow() result = %#v, want code %d", result, tt.wantCode)
			}
		})
	}
}

func TestJsonrpcDispatcher_GetCurrentAdminUsesVerifiedMiddlewareIdentity(t *testing.T) {
	j := &jsonrpcDispatcher{}
	claims := &biz.AuthClaims{UserID: 7, Username: "verified", Role: biz.RoleAdmin}
	verified := &biz.AdminUser{ID: 7, Username: "verified", AuthVersion: 3}
	ctx := biz.NewContextWithClaims(context.Background(), claims)
	ctx = biz.WithCurrentAdmin(ctx, verified)

	admin, err := j.getCurrentAdmin(ctx, claims)
	if err != nil {
		t.Fatalf("getCurrentAdmin() error = %v", err)
	}
	if admin != verified {
		t.Fatalf("getCurrentAdmin() = %#v, want verified middleware identity", admin)
	}
}

func TestJsonrpcDispatcher_GetCurrentAdminRejectsMismatchedVerifiedIdentity(t *testing.T) {
	j := &jsonrpcDispatcher{}
	claims := &biz.AuthClaims{UserID: 7, Username: "verified", Role: biz.RoleAdmin}
	ctx := biz.WithCurrentAdmin(context.Background(), &biz.AdminUser{ID: 8, Username: "other"})

	if _, err := j.getCurrentAdmin(ctx, claims); err == nil {
		t.Fatalf("getCurrentAdmin() accepted mismatched verified identity")
	}
}

func TestJsonrpcDispatcher_WorkflowMetadataRequiresAdminAndReturnsStates(t *testing.T) {
	j := &jsonrpcDispatcher{
		log:         log.NewHelper(log.With(log.NewStdLogger(io.Discard), "module", "service.jsonrpc.test")),
		adminReader: stubAdminAccountReader{admin: &biz.AdminUser{ID: 1, Username: "admin", Permissions: []string{biz.PermissionWorkflowTaskRead}}},
		workflowUC:  biz.NewWorkflowUsecase(nil),
	}

	ctx := biz.NewContextWithClaims(context.Background(), &biz.AuthClaims{
		UserID:   1,
		Username: "admin",
		Role:     biz.RoleAdmin,
	})

	_, res, err := j.handleWorkflow(ctx, "metadata", "1", nil)
	if err != nil {
		t.Fatalf("expected nil err, got %v", err)
	}
	if res == nil {
		t.Fatalf("expected result not nil")
	}
	if res.Code != errcode.OK.Code {
		t.Fatalf("expected code=%d, got %d", errcode.OK.Code, res.Code)
	}
	data := res.Data.AsMap()
	taskStates, ok := data["task_states"].([]any)
	if !ok || len(taskStates) == 0 {
		t.Fatalf("expected task states, got %#v", data["task_states"])
	}
	businessStates, ok := data["business_states"].([]any)
	if !ok || len(businessStates) == 0 {
		t.Fatalf("expected business states, got %#v", data["business_states"])
	}
}
