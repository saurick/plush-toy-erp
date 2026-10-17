package service

import (
	"context"
	"io"
	"testing"
	"time"

	"github.com/go-kratos/kratos/v2/log"
	"google.golang.org/protobuf/types/known/structpb"
	"server/internal/biz"
	"server/internal/errcode"
)

func TestProjectManualsRPCNeverAcceptsRequestedRoleOrFileAccess(t *testing.T) {
	revokedAt := time.Now()
	for _, tc := range []struct {
		name   string
		ctx    context.Context
		admin  *biz.AdminUser
		params map[string]any
		code   int32
		books  int
	}{
		{"anonymous", context.Background(), nil, nil, errcode.AuthRequired.Code, 0},
		{"suspended", workflowJSONRPCAdminContext(), &biz.AdminUser{ID: 7, IsSuperAdmin: true, Disabled: true}, nil, errcode.AdminDisabled.Code, 0},
		{"revoked", workflowJSONRPCAdminContext(), &biz.AdminUser{ID: 7, IsSuperAdmin: true, RevokedAt: &revokedAt}, nil, errcode.AdminDisabled.Code, 0},
		{"warehouse", workflowJSONRPCAdminContext(), workflowJSONRPCAdmin([]string{biz.WarehouseRoleKey}), nil, 0, 0},
		{"boss", workflowJSONRPCAdminContext(), workflowJSONRPCAdmin([]string{biz.BossRoleKey}), nil, 0, 1},
		{"custom operator", workflowJSONRPCAdminContext(), workflowJSONRPCAdmin(nil, biz.PermissionSystemRolePermissionManage, biz.PermissionCustomerConfigRead, biz.PermissionSystemAuditRead), nil, 0, 2},
		{"forged role", workflowJSONRPCAdminContext(), workflowJSONRPCAdmin([]string{biz.WarehouseRoleKey}), map[string]any{"role": "admin"}, errcode.InvalidParam.Code, 0},
		{"arbitrary file", workflowJSONRPCAdminContext(), workflowJSONRPCAdmin([]string{biz.BossRoleKey}), map[string]any{"file": "../../server/configs/config.yaml"}, errcode.InvalidParam.Code, 0},
	} {
		t.Run(tc.name, func(t *testing.T) {
			d := &jsonrpcDispatcher{log: log.NewHelper(log.NewStdLogger(io.Discard)), adminReader: stubAdminAccountReader{admin: tc.admin}}
			params, _ := structpb.NewStruct(tc.params)
			_, res, err := d.handleAdmin(tc.ctx, "project_manuals", "manuals-test", params)
			if err != nil || res.Code != tc.code {
				t.Fatalf("result = %#v, %v", res, err)
			}
			if tc.code == 0 {
				items, ok := res.Data.AsMap()["manuals"].([]any)
				if !ok || len(items) != tc.books {
					t.Fatalf("manuals=%#v", res.Data)
				}
			}
		})
	}
}
