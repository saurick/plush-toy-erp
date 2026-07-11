package service

import (
	"io"
	"testing"

	"server/internal/biz"
	"server/internal/errcode"

	"github.com/go-kratos/kratos/v2/log"
)

func TestRequireAdminPermissionIntersectsRBACWithActiveCustomerEntitlement(t *testing.T) {
	t.Setenv("ERP_CUSTOMER_KEY", biz.DefaultCustomerKey)
	repo := newServiceCustomerConfigRepo()
	uc := biz.NewCustomerConfigUsecase(repo)
	params := customerConfigPublishParamsForRevision(t, "2026.07.10.permission-intersection")
	payload := params.AsMap()
	entitlements := payload["access_entitlements"].([]any)
	filtered := make([]any, 0, len(entitlements))
	for _, raw := range entitlements {
		item := raw.(map[string]any)
		if item["role_key"] == biz.PurchaseRoleKey && item["capability_key"] == biz.PermissionOutsourcingOrderConfirm {
			continue
		}
		filtered = append(filtered, raw)
	}
	payload["access_entitlements"] = filtered
	in, ok := customerConfigPublishInputFromParams(payload)
	if !ok {
		t.Fatal("customer config test payload must parse")
	}
	if _, err := uc.PublishCustomerConfig(t.Context(), in, 1); err != nil {
		t.Fatalf("PublishCustomerConfig error = %v", err)
	}
	if _, err := uc.ActivateCustomerConfig(t.Context(), in.CustomerKey, in.Revision, 1); err != nil {
		t.Fatalf("ActivateCustomerConfig error = %v", err)
	}

	newDispatcher := func(roleKey string) *jsonrpcDispatcher {
		return &jsonrpcDispatcher{
			log: log.NewHelper(log.With(
				log.NewStdLogger(io.Discard),
				"module", "service.jsonrpc.permissions.test",
			)),
			adminReader: stubAdminAccountReader{admin: workflowJSONRPCAdmin(
				[]string{roleKey},
				biz.PermissionOutsourcingOrderConfirm,
				biz.PermissionCustomerConfigRead,
			)},
			customerConfigUC: uc,
		}
	}
	ctx := withAdminPermissionCache(workflowJSONRPCAdminContext())
	if got := newDispatcher(biz.PurchaseRoleKey).RequireAdminPermission(ctx, biz.PermissionOutsourcingOrderConfirm); got == nil || got.Code != errcode.PermissionDenied.Code {
		t.Fatalf("purchase RBAC must be narrowed by active customer entitlement, got %#v", got)
	}
	ctx = withAdminPermissionCache(workflowJSONRPCAdminContext())
	if got := newDispatcher(biz.ProductionRoleKey).RequireAdminPermission(ctx, biz.PermissionOutsourcingOrderConfirm); got != nil {
		t.Fatalf("production role must retain configured processing-contract confirmation, got %#v", got)
	}
	ctx = withAdminPermissionCache(workflowJSONRPCAdminContext())
	if got := newDispatcher(biz.PurchaseRoleKey).RequireAdminPermission(ctx, biz.PermissionCustomerConfigRead); got != nil {
		t.Fatalf("control-plane repair permission must stay under RBAC, got %#v", got)
	}
}

func TestRequireAdminPermissionFailsClosedWithoutFixedCustomerActiveRevision(t *testing.T) {
	t.Setenv("ERP_CUSTOMER_KEY", "yoyoosun")
	dispatcher := &jsonrpcDispatcher{
		log: log.NewHelper(log.With(
			log.NewStdLogger(io.Discard),
			"module", "service.jsonrpc.permissions.test",
		)),
		adminReader: stubAdminAccountReader{admin: workflowJSONRPCAdmin(
			[]string{biz.SalesRoleKey},
			biz.PermissionSalesOrderRead,
			biz.PermissionCustomerConfigRead,
		)},
		customerConfigUC: biz.NewCustomerConfigUsecase(newServiceCustomerConfigRepo()),
	}

	ctx := withAdminPermissionCache(workflowJSONRPCAdminContext())
	if got := dispatcher.RequireAdminPermission(ctx, biz.PermissionSalesOrderRead); got == nil || got.Code != errcode.PermissionDenied.Code {
		t.Fatalf("business permission must fail closed without active revision, got %#v", got)
	}
	ctx = withAdminPermissionCache(workflowJSONRPCAdminContext())
	if got := dispatcher.RequireAdminPermission(ctx, biz.PermissionCustomerConfigRead); got != nil {
		t.Fatalf("customer config repair permission must remain available under RBAC, got %#v", got)
	}
}

func TestSuperAdminBusinessPermissionFailsClosedWithoutFixedCustomerActiveRevision(t *testing.T) {
	t.Setenv("ERP_CUSTOMER_KEY", "yoyoosun")
	dispatcher := &jsonrpcDispatcher{
		log: log.NewHelper(log.With(log.NewStdLogger(io.Discard), "module", "service.jsonrpc.permissions.test")),
		adminReader: stubAdminAccountReader{admin: &biz.AdminUser{
			ID: 7, Username: "admin", IsSuperAdmin: true,
		}},
		customerConfigUC: biz.NewCustomerConfigUsecase(newServiceCustomerConfigRepo()),
	}
	ctx := withAdminPermissionCache(workflowJSONRPCAdminContext())
	if got := dispatcher.RequireAdminPermission(ctx, biz.PermissionShipmentShip); got == nil || got.Code != errcode.PermissionDenied.Code {
		t.Fatalf("super admin business permission must fail closed without active revision, got %#v", got)
	}
	ctx = withAdminPermissionCache(workflowJSONRPCAdminContext())
	if got := dispatcher.RequireAdminPermission(ctx, biz.PermissionCustomerConfigPublish); got != nil {
		t.Fatalf("super admin customer config repair permission must stay available, got %#v", got)
	}
}
