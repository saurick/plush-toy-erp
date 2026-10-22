package service

import (
	"context"
	"testing"

	"server/internal/biz"
	"server/internal/errcode"
)

type integrationSalesOrderRepo struct {
	stubSalesOrderJSONRPCRepo
	readIDs []int
	action  *biz.SourceOrderLifecycleAction
}

func (r *integrationSalesOrderRepo) GetSalesOrder(_ context.Context, id int) (*biz.SalesOrder, error) {
	r.readIDs = append(r.readIDs, id)
	return &biz.SalesOrder{ID: id, OrderNo: "SO-CONTRACT", LifecycleStatus: biz.SalesOrderStatusActive, Version: 1}, nil
}

func (r *integrationSalesOrderRepo) ApplySalesOrderLifecycleAction(_ context.Context, in *biz.SourceOrderLifecycleAction, status string) (*biz.SalesOrder, error) {
	r.action = in
	return &biz.SalesOrder{ID: in.ID, OrderNo: "SO-CONTRACT", LifecycleStatus: status, Version: in.ExpectedVersion + 1}, nil
}

func TestIntegrationSalesOrderReadRejectsUntrustedParametersBeforeRepository(t *testing.T) {
	for _, params := range []map[string]any{
		{}, {"id": nil}, {"id": 0}, {"id": -1}, {"id": 1.25}, {"id": "1"}, {"id": true}, {"id": float64(9007199254740992)},
		{"id": 1, "actor_id": 7}, {"id": 1, "role": "super_admin"}, {"id": 1, "customer_key": "other"},
	} {
		repo := &integrationSalesOrderRepo{}
		d := newSalesOrderJSONRPCTestData(t, &repo.stubSalesOrderJSONRPCRepo, workflowJSONRPCAdmin([]string{biz.SalesRoleKey}, biz.PermissionSalesOrderRead))
		d.salesOrderUC = biz.NewSalesOrderUsecase(repo)
		_, result, err := d.handleSalesOrder(workflowJSONRPCAdminContext(), "get_sales_order", "read", mustJSONRPCStruct(t, params))
		if err != nil || result == nil || result.Code != errcode.InvalidParam.Code || len(repo.readIDs) != 0 {
			t.Fatalf("untrusted params=%#v result=%#v err=%v reads=%v", params, result, err, repo.readIDs)
		}
	}
}

func TestIntegrationSalesOrderReadPreservesAuthenticationAndPermissionBoundary(t *testing.T) {
	for _, name := range []string{"anonymous", "non-admin", "disabled", "no-permission", "super-admin", "allowed"} {
		t.Run(name, func(t *testing.T) {
			repo := &integrationSalesOrderRepo{}
			admin := workflowJSONRPCAdmin([]string{biz.SalesRoleKey}, biz.PermissionSalesOrderRead)
			ctx := workflowJSONRPCAdminContext()
			want := errcode.OK.Code
			switch name {
			case "anonymous":
				ctx, want = context.Background(), errcode.AuthRequired.Code
			case "non-admin":
				ctx = biz.NewContextWithClaims(context.Background(), &biz.AuthClaims{UserID: 7, Role: biz.RoleUser})
				want = errcode.AdminRequired.Code
			case "disabled":
				admin.Disabled, want = true, errcode.AdminDisabled.Code
			case "no-permission":
				admin.Permissions, want = nil, errcode.PermissionDenied.Code
			case "super-admin":
				admin.IsSuperAdmin, admin.Permissions = true, nil
			}
			d := newSalesOrderJSONRPCTestData(t, &repo.stubSalesOrderJSONRPCRepo, admin)
			d.salesOrderUC = biz.NewSalesOrderUsecase(repo)
			_, result, err := d.handleSalesOrder(ctx, "get_sales_order", "read", mustJSONRPCStruct(t, map[string]any{"id": 19}))
			if err != nil || result == nil || result.Code != want {
				t.Fatalf("result=%#v err=%v want code=%d", result, err, want)
			}
			if want == errcode.OK.Code {
				if len(repo.readIDs) != 1 || repo.readIDs[0] != 19 || result.Data.AsMap()["sales_order"].(map[string]any)["id"] != float64(19) {
					t.Fatalf("read did not return the requested domain object: result=%#v reads=%v", result, repo.readIDs)
				}
			} else if len(repo.readIDs) != 0 {
				t.Fatalf("unauthorized request reached repository: %v", repo.readIDs)
			}
		})
	}
}

func TestIntegrationSourceOrderWriteRechecksCurrentAuthorizationBeforeReplay(t *testing.T) {
	for _, name := range []string{"anonymous", "expired", "non-admin", "permission-revoked", "customer-entitlement-revoked", "disabled", "module-read-only", "allowed"} {
		t.Run(name, func(t *testing.T) {
			repo := &integrationSalesOrderRepo{}
			admin := workflowJSONRPCAdmin([]string{biz.SalesRoleKey}, biz.PermissionSalesOrderCancel)
			d := newSalesOrderJSONRPCTestData(t, &repo.stubSalesOrderJSONRPCRepo, admin)
			d.salesOrderUC = biz.NewSalesOrderUsecase(repo)
			params := sourceOrderLifecycleTestParams(t, 19, 3, biz.SourceOrderActionCancel)
			_, result, err := d.handleSalesOrder(withAdminPermissionCache(workflowJSONRPCAdminContext()), "cancel_sales_order", "first", params)
			if err != nil || result == nil || result.Code != errcode.OK.Code || repo.action == nil {
				t.Fatalf("first action=%#v result=%#v err=%v", repo.action, result, err)
			}
			repo.action = nil
			want := errcode.OK.Code
			ctx := workflowJSONRPCAdminContext()
			switch name {
			case "anonymous":
				ctx, want = context.Background(), errcode.AuthRequired.Code
			case "expired":
				ctx, want = biz.WithAuthState(context.Background(), biz.AuthExpired), errcode.AuthExpired.Code
			case "non-admin":
				ctx = biz.NewContextWithClaims(context.Background(), &biz.AuthClaims{UserID: 7, Role: biz.RoleUser})
				want = errcode.AdminRequired.Code
			case "permission-revoked":
				admin.Permissions, want = nil, errcode.PermissionDenied.Code
			case "customer-entitlement-revoked":
				admin.Roles, want = []biz.AdminRole{{Key: biz.ProductionRoleKey}}, errcode.PermissionDenied.Code
			case "disabled":
				admin.Disabled, want = true, errcode.AdminDisabled.Code
			case "module-read-only":
				activateOperationalFactTestCustomerConfig(t, d, customerConfigPublishParamsWithRevisionAndModuleState(
					t, customerConfigPublishParams(t), "integration-sales-read-only", "sales_orders", "read_only",
				))
				want = errcode.BusinessRuleViolation.Code
			}
			_, result, err = d.handleSalesOrder(withAdminPermissionCache(ctx), "cancel_sales_order", "retry", params)
			if err != nil || result == nil || result.Code != want || (repo.action != nil) != (want == errcode.OK.Code) {
				t.Fatalf("replay authorization action=%#v result=%#v err=%v want=%d", repo.action, result, err, want)
			}
		})
	}
}

func TestIntegrationSourceOrderActionRejectsFractionalIdentifiersAndVersion(t *testing.T) {
	for _, field := range []string{"id", "expected_version"} {
		for _, invalid := range []any{nil, 0, -1, 1.25, "1", true, float64(9007199254740992)} {
			params := map[string]any{"id": 19, "expected_version": 3, "idempotency_key": "cancel-contract", "reason": "客户取消"}
			params[field] = invalid
			if in, ok := sourceOrderLifecycleActionFromParams(params, biz.SourceOrderActionCancel, 7); ok {
				t.Fatalf("accepted %s=%#v as %#v", field, invalid, in)
			}
		}
	}
}

func TestIntegrationSourceOrderActionRejectsNonStringIntentFields(t *testing.T) {
	for _, field := range []string{"idempotency_key", "reason", "close_mode", "customer_key"} {
		t.Run(field, func(t *testing.T) {
			for _, invalid := range []any{nil, 1.25, true, []any{"cancel"}, map[string]any{"key": "cancel"}} {
				params := map[string]any{"id": 19, "expected_version": 3, "idempotency_key": "cancel-contract", "reason": "客户取消"}
				params[field] = invalid
				if in, ok := sourceOrderLifecycleActionFromParams(params, biz.SourceOrderActionCancel, 7); ok {
					t.Errorf("accepted %s=%#v as %#v", field, invalid, in)
				}
			}
		})
	}
}

func TestIntegrationSourceOrderActionUsesAuthenticatedActor(t *testing.T) {
	repo := &integrationSalesOrderRepo{}
	d := newSalesOrderJSONRPCTestData(t, &repo.stubSalesOrderJSONRPCRepo, workflowJSONRPCAdmin([]string{biz.SalesRoleKey}, biz.PermissionSalesOrderCancel))
	d.salesOrderUC = biz.NewSalesOrderUsecase(repo)
	params := map[string]any{"id": 19, "expected_version": 3, "idempotency_key": "cancel-contract", "reason": "客户取消"}
	_, result, err := d.handleSalesOrder(workflowJSONRPCAdminContext(), "cancel_sales_order", "write", mustJSONRPCStruct(t, params))
	if err != nil || result == nil || result.Code != errcode.OK.Code || repo.action == nil || repo.action.ActorID != 7 {
		t.Fatalf("action=%#v result=%#v err=%v", repo.action, result, err)
	}
	for _, field := range []string{"actor_id", "intent_hash", "action_key"} {
		repo.action = nil
		params[field] = "forged"
		_, result, err = d.handleSalesOrder(workflowJSONRPCAdminContext(), "cancel_sales_order", "write", mustJSONRPCStruct(t, params))
		if err != nil || result == nil || result.Code != errcode.InvalidParam.Code || repo.action != nil {
			t.Fatalf("forged %s reached domain action: action=%#v result=%#v err=%v", field, repo.action, result, err)
		}
		delete(params, field)
	}
}
