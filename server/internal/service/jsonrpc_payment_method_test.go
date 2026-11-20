package service

import (
	"context"
	"errors"
	v1 "server/api/jsonrpc/v1"
	"server/internal/biz"
	"server/internal/errcode"
	"strings"
	"testing"
)

func (s *stubMasterDataJSONRPCRepo) ListPaymentMethods(context.Context, biz.PaymentMethodFilter) (biz.PaymentMethodSuggestions, error) {
	return biz.PaymentMethodSuggestions{Methods: []string{"银行转账"}}, nil
}
func (s *stubMasterDataJSONRPCRepo) ListPaymentMethodOptions(context.Context, biz.PaymentMethodOptionFilter) ([]biz.PaymentMethodOption, bool, error) {
	return nil, false, nil
}
func (s *stubMasterDataJSONRPCRepo) CreatePaymentMethod(context.Context, string, *biz.RuntimeAuditEventCreate) (*biz.PaymentMethodOption, error) {
	return nil, nil
}
func (s *stubMasterDataJSONRPCRepo) UpdatePaymentMethod(context.Context, biz.PaymentMethodOptionChange, *biz.RuntimeAuditEventCreate) (*biz.PaymentMethodOption, error) {
	return nil, nil
}
func (s *stubMasterDataJSONRPCRepo) DeletePaymentMethod(context.Context, int, int, *biz.RuntimeAuditEventCreate) error {
	return nil
}

type paymentMethodJSONRPCRepo struct {
	*stubMasterDataJSONRPCRepo
	calls            int
	filter           biz.PaymentMethodFilter
	managementFilter biz.PaymentMethodOptionFilter
	change           biz.PaymentMethodOptionChange
	audit            *biz.RuntimeAuditEventCreate
	err              error
}

func (s *paymentMethodJSONRPCRepo) ListPaymentMethods(_ context.Context, f biz.PaymentMethodFilter) (biz.PaymentMethodSuggestions, error) {
	s.calls++
	s.filter = f
	return biz.PaymentMethodSuggestions{Methods: []string{"银行转账"}}, s.err
}
func (s *paymentMethodJSONRPCRepo) ListPaymentMethodOptions(_ context.Context, f biz.PaymentMethodOptionFilter) ([]biz.PaymentMethodOption, bool, error) {
	s.calls++
	s.managementFilter = f
	return []biz.PaymentMethodOption{{ID: 1, Method: "aa", IsActive: f.IsActive, Version: 1}}, false, s.err
}
func (s *paymentMethodJSONRPCRepo) CreatePaymentMethod(_ context.Context, name string, audit *biz.RuntimeAuditEventCreate) (*biz.PaymentMethodOption, error) {
	s.calls++
	s.audit = audit
	return &biz.PaymentMethodOption{ID: 1, Method: name, IsActive: true, Version: 1}, s.err
}
func (s *paymentMethodJSONRPCRepo) UpdatePaymentMethod(_ context.Context, c biz.PaymentMethodOptionChange, audit *biz.RuntimeAuditEventCreate) (*biz.PaymentMethodOption, error) {
	s.calls++
	s.change = c
	s.audit = audit
	return &biz.PaymentMethodOption{ID: c.ID, Method: c.Method, IsActive: c.IsActive, Version: c.ExpectedVersion + 1}, s.err
}
func (s *paymentMethodJSONRPCRepo) DeletePaymentMethod(_ context.Context, id, version int, audit *biz.RuntimeAuditEventCreate) error {
	s.calls++
	s.audit = audit
	return s.err
}

func TestJSONRPCPaymentMethodManagementPermissionAndContract(t *testing.T) {
	ctx := biz.NewContextWithClaims(context.Background(), &biz.AuthClaims{UserID: 1, Role: biz.RoleAdmin})
	for _, tc := range []struct {
		name, role      string
		permissions     []string
		super, disabled bool
		want            int32
	}{
		{name: "reader", permissions: []string{biz.PermissionCustomerRead}, want: errcode.PermissionDenied.Code},
		{name: "customer config denies", role: biz.SalesRoleKey, permissions: []string{biz.PermissionPaymentMethodManage}, want: errcode.PermissionDenied.Code},
		{name: "manager", permissions: []string{biz.PermissionPaymentMethodManage}, want: errcode.OK.Code},
		{name: "delete without maintenance", permissions: []string{biz.PermissionPaymentMethodDelete}, want: errcode.PermissionDenied.Code},
		{name: "super admin", super: true, want: errcode.OK.Code},
		{name: "disabled", permissions: []string{biz.PermissionPaymentMethodManage}, disabled: true, want: errcode.AdminDisabled.Code},
	} {
		t.Run(tc.name, func(t *testing.T) {
			base := &stubMasterDataJSONRPCRepo{}
			repo := &paymentMethodJSONRPCRepo{stubMasterDataJSONRPCRepo: base}
			role := tc.role
			if role == "" {
				role = biz.BossRoleKey
			}
			admin := workflowJSONRPCAdmin([]string{role}, tc.permissions...)
			admin.IsSuperAdmin = tc.super
			admin.Disabled = tc.disabled
			d := newMasterDataJSONRPCTestData(t, base, admin)
			d.masterDataUC = biz.NewMasterDataUsecase(repo)
			for _, method := range []string{"list_payment_method_options", "create_payment_method", "update_payment_method", "delete_payment_method"} {
				want := tc.want
				if method == "delete_payment_method" && want == errcode.OK.Code && !tc.super {
					want = errcode.PermissionDenied.Code
				}
				before := repo.calls
				_, res, err := d.handleMasterData(ctx, method, "catalogue", mustJSONRPCStruct(t, map[string]any{"id": 1, "method": " aa ", "is_active": false, "expected_version": 1, "keyword": "aa", "operator_id": 999}))
				if err != nil || res.Code != want {
					t.Fatalf("%s: %+v %v", method, res, err)
				}
				if want != errcode.OK.Code && repo.calls != before {
					t.Fatal("denied action reached repository")
				}
				if want == errcode.OK.Code && method == "list_payment_method_options" && res.Data.AsMap()["can_delete"] != tc.super {
					t.Fatal("delete access must be returned by the backend")
				}
				if want == errcode.OK.Code && method != "list_payment_method_options" && repo.audit.Payload["actor"].(map[string]any)["id"] != admin.ID {
					t.Fatal("client forged actor")
				}
			}
			if tc.want != errcode.OK.Code && repo.calls != 0 {
				t.Fatal("denied write reached repository")
			}
			for _, method := range []string{"list_payment_methods", "list_payment_method_options", "create_payment_method", "update_payment_method", "delete_payment_method"} {
				_, res, err := d.handleMasterData(context.Background(), method, "anonymous", nil)
				if err != nil || res.Code != errcode.AuthRequired.Code {
					t.Fatalf("anonymous %s: %+v %v", method, res, err)
				}
			}
		})
	}
}

func TestJSONRPCPaymentMethodDeletionKeepsUsedItemAndVersionGuards(t *testing.T) {
	ctx := biz.NewContextWithClaims(context.Background(), &biz.AuthClaims{UserID: 1, Role: biz.RoleAdmin})
	base := &stubMasterDataJSONRPCRepo{}
	repo := &paymentMethodJSONRPCRepo{stubMasterDataJSONRPCRepo: base}
	admin := workflowJSONRPCAdmin(nil)
	admin.IsSuperAdmin = true
	d := newMasterDataJSONRPCTestData(t, base, admin)
	d.masterDataUC = biz.NewMasterDataUsecase(repo)
	for _, entry := range []struct {
		err  error
		code int32
	}{
		{biz.ErrPaymentMethodInUse, errcode.BusinessRuleViolation.Code},
		{biz.ErrPaymentMethodVersionConflict, errcode.ResourceVersionConflict.Code},
	} {
		repo.err = entry.err
		_, res, err := d.handleMasterData(ctx, "delete_payment_method", "delete", mustJSONRPCStruct(t, map[string]any{"id": 1, "expected_version": 1}))
		if err != nil || res.Code != entry.code {
			t.Fatalf("delete guard: %+v %v", res, err)
		}
	}
}

func TestJSONRPCPaymentMethodSuggestionsReturnsAuthoritativeManagementAccess(t *testing.T) {
	ctx := biz.NewContextWithClaims(context.Background(), &biz.AuthClaims{UserID: 1, Role: biz.RoleAdmin})
	for _, permission := range []string{biz.PermissionCustomerRead, biz.PermissionSupplierRead, biz.PermissionSalesOrderRead, biz.PermissionPurchaseOrderRead, ""} {
		base := &stubMasterDataJSONRPCRepo{}
		repo := &paymentMethodJSONRPCRepo{stubMasterDataJSONRPCRepo: base}
		admin := workflowJSONRPCAdmin([]string{biz.SalesRoleKey, biz.PurchaseRoleKey}, permission)
		d := newMasterDataJSONRPCTestData(t, base, admin)
		d.masterDataUC = biz.NewMasterDataUsecase(repo)
		_, res, err := d.handleMasterData(ctx, "list_payment_methods", "read", mustJSONRPCStruct(t, map[string]any{"keyword": " 银行 "}))
		if err != nil {
			t.Fatal(err)
		}
		if permission == "" {
			if res.Code != errcode.PermissionDenied.Code || repo.calls != 0 {
				t.Fatal("unauthorized read accepted")
			}
			continue
		}
		if res.Code != errcode.OK.Code || repo.filter.Keyword != "银行" || res.Data.AsMap()["can_manage"] != false {
			t.Fatalf("read: %+v", res)
		}
	}
	for _, super := range []bool{false, true} {
		base := &stubMasterDataJSONRPCRepo{}
		admin := workflowJSONRPCAdmin([]string{biz.SalesRoleKey}, biz.PermissionCustomerRead)
		admin.IsSuperAdmin = super
		d := newMasterDataJSONRPCTestData(t, base, admin)
		_, res, err := d.handleMasterData(ctx, "list_payment_methods", "access", nil)
		if err != nil || res.Code != errcode.OK.Code || res.Data.AsMap()["can_manage"] != super {
			t.Fatalf("access: %+v %v", res, err)
		}
	}
}

func TestJSONRPCPaymentMethodRejectsMalformedAndMapsLifecycleErrors(t *testing.T) {
	ctx := biz.NewContextWithClaims(context.Background(), &biz.AuthClaims{UserID: 1, Role: biz.RoleAdmin})
	base := &stubMasterDataJSONRPCRepo{}
	repo := &paymentMethodJSONRPCRepo{stubMasterDataJSONRPCRepo: base}
	d := newMasterDataJSONRPCTestData(t, base, workflowJSONRPCAdmin([]string{biz.BossRoleKey}, biz.PermissionPaymentMethodManage))
	d.masterDataUC = biz.NewMasterDataUsecase(repo)
	for _, params := range []map[string]any{
		{"id": 1, "method": "aa", "is_active": false},
		{"id": 1, "method": "aa", "expected_version": 1},
		{"id": 1, "method": "aa", "is_active": "false", "expected_version": 1},
		{"id": 1, "method": "aa", "is_active": false, "expected_version": nil},
		{"id": 1, "method": "aa", "is_active": false, "expected_version": 1.5},
		{"id": 1, "method": "aa", "is_active": false, "expected_version": "1"},
		{"id": 0, "method": "aa", "is_active": false, "expected_version": 1},
		{"id": 1.5, "method": "aa", "is_active": false, "expected_version": 1},
		{"id": 1, "method": " ", "is_active": false, "expected_version": 1},
	} {
		_, res, err := d.handleMasterData(ctx, "update_payment_method", "bad", mustJSONRPCStruct(t, params))
		if err != nil || res.Code != errcode.InvalidParam.Code {
			t.Fatalf("malformed: %+v %+v %v", params, res, err)
		}
	}
	if repo.calls != 0 {
		t.Fatal("invalid mutation reached repository")
	}
	for _, entry := range []struct {
		err  error
		code int32
	}{{biz.ErrPaymentMethodExists, errcode.ResourceConflict.Code}, {biz.ErrPaymentMethodInUse, errcode.BusinessRuleViolation.Code}, {biz.ErrPaymentMethodVersionConflict, errcode.ResourceVersionConflict.Code}, {biz.ErrPaymentMethodNotFound, errcode.ResourceNotFound.Code}, {errors.New("internal SQL"), errcode.Internal.Code}} {
		repo.err = entry.err
		_, res, err := d.handleMasterData(ctx, "update_payment_method", "failed", mustJSONRPCStruct(t, map[string]any{"id": 1, "method": "aa", "is_active": false, "expected_version": 1}))
		if err != nil || res.Code != entry.code || strings.Contains(res.Message, "internal SQL") {
			t.Fatalf("error mapping: %+v %v", res, err)
		}
	}
}

func TestPaymentMethodSelectionErrorAcrossDocumentWriters(t *testing.T) {
	d := &jsonrpcDispatcher{}
	for _, result := range []*v1.JsonrpcResult{d.mapMasterDataError(context.Background(), biz.ErrPaymentMethodUnavailable), d.salesOrderErrorResult(context.Background(), biz.ErrPaymentMethodUnavailable), d.purchaseOrderErrorResult(context.Background(), biz.ErrPaymentMethodUnavailable)} {
		if result == nil || result.Code != errcode.BusinessRuleViolation.Code || !strings.Contains(result.Message, "公司共用付款方式") {
			t.Fatal("directory validation must be actionable across document writers")
		}
	}
}
