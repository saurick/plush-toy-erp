package service

import (
	"google.golang.org/protobuf/types/known/structpb"
	"server/internal/biz"
	"server/internal/errcode"
	"testing"
)

func TestProcessSubmissionRouteRequiresBusinessSubmissionAndSourceRead(t *testing.T) {
	for _, permissions := range [][]string{
		{}, {biz.PermissionCustomerConfigRead}, {biz.PermissionSalesOrderRead}, {biz.PermissionSalesOrderSubmit},
	} {
		dispatcher := newCustomerConfigTestDispatcher(&biz.AdminUser{ID: 1, Username: "sales"}, nil)
		dispatcher.adminReader.(*memAdminManageRepoForData).admins[1].Permissions = permissions
		params, _ := structpb.NewStruct(map[string]any{"process_key": biz.ProcessKeySalesOrderAcceptance})
		_, result, err := dispatcher.handleCustomerConfig(customerConfigAdminCtx(1, "sales"), "get_process_submission_route", "preview", params)
		if err != nil || result == nil || result.Code != errcode.PermissionDenied.Code {
			t.Fatalf("permissions=%v result=%v err=%v", permissions, result, err)
		}
	}
}

func TestProcessSubmissionRouteAllowsSubmitterWithoutConfigReadAndRejectsOtherCustomer(t *testing.T) {
	t.Setenv("ERP_CUSTOMER_KEY", biz.DefaultCustomerKey)
	dispatcher, runtimeRepo := newCustomerConfigTestDispatcherWithRuntimeRepo(&biz.AdminUser{ID: 1, Username: "sales"}, []string{biz.SalesRoleKey})
	publishAndActivateCustomerConfigUsecaseForTest(t, dispatcher, customerConfigPublishParamsWithSalesOrderAcceptanceProcess(t), 1)
	dispatcher.adminReader.(*memAdminManageRepoForData).admins[1].Permissions = []string{biz.PermissionSalesOrderRead, biz.PermissionSalesOrderSubmit}
	params, _ := structpb.NewStruct(map[string]any{"process_key": biz.ProcessKeySalesOrderAcceptance})
	_, result, err := dispatcher.handleCustomerConfig(customerConfigAdminCtx(1, "sales"), "get_process_submission_route", "preview", params)
	if err != nil || result == nil || result.Code != errcode.OK.Code {
		t.Fatalf("result=%v err=%v", result, err)
	}
	route := jsonRPCNestedMap(t, result, "route")
	if route["owner_role_key"] != biz.BossRoleKey || route["process_key"] != biz.ProcessKeySalesOrderAcceptance {
		t.Fatalf("unexpected route: %v", route)
	}
	if len(runtimeRepo.processes) != 0 || len(runtimeRepo.nodes) != 0 {
		t.Fatal("route read must not start a process")
	}
	params, _ = structpb.NewStruct(map[string]any{"process_key": biz.ProcessKeySalesOrderAcceptance, "customer_key": "another-customer"})
	_, result, err = dispatcher.handleCustomerConfig(customerConfigAdminCtx(1, "sales"), "get_process_submission_route", "other-customer", params)
	if err != nil || result == nil || result.Code != errcode.PermissionDenied.Code {
		t.Fatalf("other customer result=%v err=%v", result, err)
	}
}

func TestProcessSubmissionRouteRejectsUnknownProcessAndInjectedRouting(t *testing.T) {
	dispatcher := newCustomerConfigTestDispatcher(&biz.AdminUser{ID: 1, IsSuperAdmin: true}, nil)
	for _, input := range []map[string]any{
		{"process_key": "custom_flow"},
		{"process_key": biz.ProcessKeySalesOrderAcceptance, "owner_role_key": "sales"},
		{"process_key": biz.ProcessKeySalesOrderAcceptance, "assignee_id": 42},
	} {
		params, _ := structpb.NewStruct(input)
		_, result, err := dispatcher.handleCustomerConfig(customerConfigAdminCtx(1, "admin"), "get_process_submission_route", "preview", params)
		if err != nil || result == nil || result.Code != errcode.InvalidParam.Code {
			t.Fatalf("input=%v result=%v err=%v", input, result, err)
		}
	}
}
