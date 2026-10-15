package service

import (
	"context"
	"errors"
	"testing"

	"server/internal/biz"
	"server/internal/errcode"
)

type progressAPIRepo struct {
	query biz.BusinessProgressQuery
	calls int
	err   error
}

func (r *progressAPIRepo) ListBusinessProgress(_ context.Context, q biz.BusinessProgressQuery) (*biz.BusinessProgressBoard, error) {
	r.query, r.calls = q, r.calls+1
	return &biz.BusinessProgressBoard{Rows: []*biz.BusinessProgressRow{}, SnapshotAt: q.SnapshotAt, Access: q.Access}, r.err
}
func (r *progressAPIRepo) GetBusinessProgress(_ context.Context, q biz.BusinessProgressQuery) (*biz.BusinessProgressDetail, error) {
	r.query, r.calls = q, r.calls+1
	return nil, biz.ErrSalesOrderNotFound
}

func TestBusinessProgressJSONRPCPermissionsAndValidation(t *testing.T) {
	t.Setenv("ERP_CUSTOMER_KEY", biz.DefaultCustomerKey)
	d, _, _ := newProductionOrderJSONRPCTestData(t, biz.PermissionERPBusinessDashboardRead, biz.PermissionPMCPlanRead)
	r := &progressAPIRepo{}
	d.businessProgressUC = biz.NewBusinessProgressUsecase(r)
	ctx := workflowJSONRPCAdminContext()
	_, res, err := d.handleBusiness(ctx, "list_progress", "1", nil)
	if err != nil || res.Code != errcode.OK.Code || r.calls != 1 || r.query.View != "production" || !r.query.Access.Production || r.query.Access.Sales || r.query.Access.WIP || r.query.Access.Tasks {
		t.Fatalf("default production result=%+v query=%+v err=%v", res, r.query, err)
	}
	for _, input := range []struct {
		params map[string]any
		code   int32
	}{
		{map[string]any{"view": "orders"}, errcode.PermissionDenied.Code},
		{map[string]any{"limit": 101}, errcode.InvalidParam.Code},
		{map[string]any{"offset": -1}, errcode.InvalidParam.Code},
		{map[string]any{"scope": "finished"}, errcode.InvalidParam.Code},
		{map[string]any{"date_from": "2026-02-30"}, errcode.InvalidParam.Code},
		{map[string]any{"access": map[string]any{"sales": true}}, errcode.InvalidParam.Code},
	} {
		_, res, err = d.handleBusiness(ctx, "list_progress", "invalid", newDataStruct(input.params))
		if err != nil || res.Code != input.code || r.calls != 1 {
			t.Fatalf("input=%v result=%+v calls=%d err=%v", input.params, res, r.calls, err)
		}
	}
	r.err = errors.New("private connection details")
	_, res, err = d.handleBusiness(ctx, "list_progress", "failed", nil)
	if err != nil || res.Code != errcode.Internal.Code || res.Message != errcode.Internal.Message {
		t.Fatalf("internal=%+v %v", res, err)
	}
	_, res, err = d.handleBusiness(ctx, "get_progress", "missing", newDataStruct(map[string]any{"id": 19}))
	if err != nil || res.Code != errcode.InvalidParam.Code {
		t.Fatalf("missing=%+v %v", res, err)
	}
	for _, state := range []string{"anonymous", "disabled", "denied"} {
		admin := workflowJSONRPCAdmin([]string{biz.PMCRoleKey}, biz.PermissionPMCPlanRead)
		callContext, want := ctx, errcode.PermissionDenied.Code
		if state == "anonymous" {
			callContext, want = context.Background(), errcode.AuthRequired.Code
		}
		if state == "disabled" {
			admin.Disabled, want = true, errcode.AdminDisabled.Code
		}
		d.adminReader = stubAdminAccountReader{admin: admin}
		calls := r.calls
		_, res, err = d.handleBusiness(callContext, "list_progress", state, nil)
		if err != nil || res.Code != want || r.calls != calls {
			t.Fatalf("%s result=%+v calls=%d err=%v", state, res, r.calls, err)
		}
	}
}

func TestBusinessProgressManagementReadPermissions(t *testing.T) {
	t.Setenv("ERP_CUSTOMER_KEY", biz.DefaultCustomerKey)
	for _, role := range biz.BuiltinRoles() {
		if role.Key != biz.BossRoleKey && role.Key != biz.PMCRoleKey {
			continue
		}
		t.Run(role.Key, func(t *testing.T) {
			d, _, _ := newProductionOrderJSONRPCTestData(t, role.Permissions...)
			d.adminReader = stubAdminAccountReader{admin: workflowJSONRPCAdmin([]string{role.Key}, role.Permissions...)}
			r := &progressAPIRepo{}
			d.businessProgressUC = biz.NewBusinessProgressUsecase(r)
			for _, view := range []string{"orders", "production"} {
				_, res, err := d.handleBusiness(workflowJSONRPCAdminContext(), "list_progress", view, newDataStruct(map[string]any{"view": view}))
				if err != nil || res.Code != errcode.OK.Code || !r.query.Access.Sales || !r.query.Access.Production || !r.query.Access.WIP || !r.query.Access.Tasks || r.query.TaskVisibility == nil {
					t.Fatalf("%s result=%+v query=%+v err=%v", role.Key, res, r.query, err)
				}
			}
		})
	}
}
