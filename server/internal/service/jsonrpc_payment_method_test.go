package service

import (
	"context"
	"errors"
	"reflect"
	"testing"

	"server/internal/biz"
	"server/internal/errcode"
)

func (s *stubMasterDataJSONRPCRepo) ListPaymentMethods(context.Context, biz.PaymentMethodFilter) (biz.PaymentMethodSuggestions, error) {
	return biz.PaymentMethodSuggestions{Methods: []string{"银行转账"}}, nil
}

func (s *stubMasterDataJSONRPCRepo) ListPaymentMethodRecommendations(context.Context, biz.PaymentMethodRecommendationFilter) ([]biz.PaymentMethodRecommendation, bool, error) {
	return nil, false, nil
}
func (s *stubMasterDataJSONRPCRepo) SetPaymentMethodRecommendation(context.Context, biz.PaymentMethodRecommendationChange, *biz.RuntimeAuditEventCreate) (*biz.PaymentMethodRecommendation, error) {
	return nil, nil
}

type paymentMethodJSONRPCRepo struct {
	*stubMasterDataJSONRPCRepo
	filter           biz.PaymentMethodFilter
	calls            int
	managementFilter biz.PaymentMethodRecommendationFilter
	change           biz.PaymentMethodRecommendationChange
	audit            *biz.RuntimeAuditEventCreate
	err              error
}

func (s *paymentMethodJSONRPCRepo) ListPaymentMethods(_ context.Context, filter biz.PaymentMethodFilter) (biz.PaymentMethodSuggestions, error) {
	s.filter = filter
	s.calls++
	return biz.PaymentMethodSuggestions{Methods: []string{"银行转账"}}, nil
}

func TestJSONRPCPaymentMethodSuggestions(t *testing.T) {
	ctx := biz.NewContextWithClaims(context.Background(), &biz.AuthClaims{UserID: 1, Role: biz.RoleAdmin})
	for _, tc := range []struct {
		name        string
		permissions []string
		want        biz.PaymentMethodFilter
	}{
		{"supplier", []string{biz.PermissionSupplierRead}, biz.PaymentMethodFilter{Suppliers: true}},
		{"purchase", []string{biz.PermissionPurchaseOrderRead}, biz.PaymentMethodFilter{PurchaseOrders: true}},
		{"customer", []string{biz.PermissionCustomerRead}, biz.PaymentMethodFilter{Customers: true}},
		{"sales", []string{biz.PermissionSalesOrderRead}, biz.PaymentMethodFilter{SalesOrders: true}},
		{"combined", []string{biz.PermissionSupplierRead, biz.PermissionPurchaseOrderRead}, biz.PaymentMethodFilter{Suppliers: true, PurchaseOrders: true}},
		{"no permission", nil, biz.PaymentMethodFilter{}},
	} {
		t.Run(tc.name, func(t *testing.T) {
			base := &stubMasterDataJSONRPCRepo{}
			repo := &paymentMethodJSONRPCRepo{stubMasterDataJSONRPCRepo: base}
			dispatcher := newMasterDataJSONRPCTestData(t, base, workflowJSONRPCAdmin([]string{biz.SalesRoleKey, biz.PurchaseRoleKey}, tc.permissions...))
			dispatcher.masterDataUC = biz.NewMasterDataUsecase(repo)
			_, result, err := dispatcher.handleMasterData(ctx, "list_payment_methods", "payment-methods", mustJSONRPCStruct(t, map[string]any{"keyword": ""}))
			if err != nil {
				t.Fatal(err)
			}
			if len(tc.permissions) == 0 {
				if result.Code != errcode.PermissionDenied.Code || repo.calls != 0 {
					t.Fatalf("unauthorized read: %+v calls=%d", result, repo.calls)
				}
				return
			}
			if result.Code != errcode.OK.Code || !reflect.DeepEqual(repo.filter, tc.want) {
				t.Fatalf("scope leaked: %+v result=%+v", repo.filter, result)
			}
			if !reflect.DeepEqual(result.Data.AsMap(), map[string]any{"methods": []any{"银行转账"}, "has_more": false, "keyword_not_recommended": false, "can_manage": false}) {
				t.Fatalf("unexpected response: %+v", result.Data.AsMap())
			}
			_, result, err = dispatcher.handleMasterData(context.Background(), "list_payment_methods", "anonymous", nil)
			if err != nil || result.Code != errcode.AuthRequired.Code || repo.calls != 1 {
				t.Fatalf("anonymous read: %+v %v", result, err)
			}
		})
	}
}

func (s *paymentMethodJSONRPCRepo) ListPaymentMethodRecommendations(_ context.Context, filter biz.PaymentMethodRecommendationFilter) ([]biz.PaymentMethodRecommendation, bool, error) {
	s.managementFilter = filter
	s.calls++
	return []biz.PaymentMethodRecommendation{{Method: "aa", IsRecommended: filter.IsRecommended, Version: 1}}, false, s.err
}
func (s *paymentMethodJSONRPCRepo) SetPaymentMethodRecommendation(_ context.Context, change biz.PaymentMethodRecommendationChange, audit *biz.RuntimeAuditEventCreate) (*biz.PaymentMethodRecommendation, error) {
	s.change, s.audit = change, audit
	s.calls++
	return &biz.PaymentMethodRecommendation{Method: change.Method, IsRecommended: change.IsRecommended, Version: change.ExpectedVersion + 1}, s.err
}

func TestJSONRPCPaymentMethodManagementPermissionAndContract(t *testing.T) {
	ctx := biz.NewContextWithClaims(context.Background(), &biz.AuthClaims{UserID: 1, Role: biz.RoleAdmin})
	for _, tc := range []struct {
		name            string
		role            string
		permission      []string
		super, disabled bool
		want            int32
	}{
		{name: "reader", permission: []string{biz.PermissionCustomerRead}, want: errcode.PermissionDenied.Code},
		{name: "customer config denies", role: biz.SalesRoleKey, permission: []string{biz.PermissionPaymentMethodManage}, want: errcode.PermissionDenied.Code},
		{name: "manager", permission: []string{biz.PermissionPaymentMethodManage}, want: errcode.OK.Code},
		{name: "super admin", super: true, want: errcode.OK.Code},
		{name: "disabled manager", permission: []string{biz.PermissionPaymentMethodManage}, disabled: true, want: errcode.AdminDisabled.Code},
	} {
		t.Run(tc.name, func(t *testing.T) {
			base := &stubMasterDataJSONRPCRepo{}
			repo := &paymentMethodJSONRPCRepo{stubMasterDataJSONRPCRepo: base}
			role := tc.role
			if role == "" {
				role = biz.BossRoleKey
			}
			admin := workflowJSONRPCAdmin([]string{role}, tc.permission...)
			admin.IsSuperAdmin = tc.super
			admin.Disabled = tc.disabled
			d := newMasterDataJSONRPCTestData(t, base, admin)
			d.masterDataUC = biz.NewMasterDataUsecase(repo)
			for _, method := range []string{"list_payment_method_recommendations", "set_payment_method_recommendation"} {
				_, res, err := d.handleMasterData(ctx, method, "management", mustJSONRPCStruct(t, map[string]any{"method": " aa ", "is_recommended": false, "expected_version": 0, "keyword": "aa", "operator_id": 999}))
				if err != nil || res.Code != tc.want {
					t.Fatalf("%s: %+v %v", method, res, err)
				}
			}
			if tc.want != errcode.OK.Code {
				if repo.calls != 0 {
					t.Fatal("denied management reached repository")
				}
				return
			}
			if repo.change.Method != "aa" || repo.change.ExpectedVersion != 0 || repo.change.IsRecommended || repo.audit.Payload["actor"].(map[string]any)["id"] != admin.ID {
				t.Fatalf("management contract: %+v %+v", repo.change, repo.audit)
			}
			_, res, err := d.handleMasterData(context.Background(), "set_payment_method_recommendation", "anonymous", nil)
			if err != nil || res.Code != errcode.AuthRequired.Code {
				t.Fatalf("anonymous: %+v %v", res, err)
			}
		})
	}
}

func TestJSONRPCPaymentMethodManagementRejectsMalformedAndStaleChanges(t *testing.T) {
	ctx := biz.NewContextWithClaims(context.Background(), &biz.AuthClaims{UserID: 1, Role: biz.RoleAdmin})
	base := &stubMasterDataJSONRPCRepo{}
	repo := &paymentMethodJSONRPCRepo{stubMasterDataJSONRPCRepo: base}
	d := newMasterDataJSONRPCTestData(t, base, workflowJSONRPCAdmin([]string{biz.BossRoleKey}, biz.PermissionPaymentMethodManage))
	d.masterDataUC = biz.NewMasterDataUsecase(repo)
	for _, params := range []map[string]any{
		{"method": "aa", "is_recommended": false},
		{"method": "aa", "expected_version": 0},
		{"method": "aa", "is_recommended": "false", "expected_version": 0},
		{"method": "aa", "is_recommended": false, "expected_version": nil},
		{"method": "aa", "is_recommended": nil, "expected_version": 0},
		{"method": "aa", "is_recommended": false, "expected_version": -1},
		{"method": "aa", "is_recommended": false, "expected_version": 1.5},
		{"method": "aa", "is_recommended": false, "expected_version": "1"},
		{"method": " ", "is_recommended": false, "expected_version": 0},
	} {
		_, res, err := d.handleMasterData(ctx, "set_payment_method_recommendation", "bad", mustJSONRPCStruct(t, params))
		if err != nil || res.Code != errcode.InvalidParam.Code {
			t.Fatalf("malformed mutation accepted: %+v %+v %v", params, res, err)
		}
	}
	if repo.calls != 0 {
		t.Fatal("malformed changes reached repository")
	}
	for _, entry := range []struct {
		err  error
		code int32
	}{{biz.ErrPaymentMethodVersionConflict, errcode.ResourceVersionConflict.Code}, {biz.ErrPaymentMethodNotFound, errcode.ResourceNotFound.Code}, {errors.New("internal SQL"), errcode.Internal.Code}} {
		repo.err = entry.err
		_, res, err := d.handleMasterData(ctx, "set_payment_method_recommendation", "failed", mustJSONRPCStruct(t, map[string]any{"method": "aa", "is_recommended": false, "expected_version": 0}))
		if err != nil || res.Code != entry.code || res.Message == "internal SQL" {
			t.Fatalf("management error: %+v %v", res, err)
		}
	}
}

func TestJSONRPCPaymentMethodSuggestionsReturnsAuthoritativeManagementAccess(t *testing.T) {
	ctx := biz.NewContextWithClaims(context.Background(), &biz.AuthClaims{UserID: 1, Role: biz.RoleAdmin})
	for _, super := range []bool{false, true} {
		base := &stubMasterDataJSONRPCRepo{}
		admin := workflowJSONRPCAdmin([]string{biz.SalesRoleKey}, biz.PermissionCustomerRead)
		admin.IsSuperAdmin = super
		d := newMasterDataJSONRPCTestData(t, base, admin)
		_, res, err := d.handleMasterData(ctx, "list_payment_methods", "manage-access", mustJSONRPCStruct(t, map[string]any{"keyword": ""}))
		if err != nil || res.Code != errcode.OK.Code || res.Data.AsMap()["can_manage"] != super {
			t.Fatalf("authoritative management flag: super=%v result=%+v error=%v", super, res, err)
		}
	}
}
