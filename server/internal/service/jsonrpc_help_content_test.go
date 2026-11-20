package service

import (
	"context"
	"github.com/go-kratos/kratos/v2/log"
	"google.golang.org/protobuf/types/known/structpb"
	"io"
	"server/internal/biz"
	"server/internal/errcode"
	"testing"
)

func TestHelpContentRPCRejectsForgedScopeAndInactiveAccounts(t *testing.T) {
	for _, tc := range []struct {
		name   string
		ctx    context.Context
		admin  *biz.AdminUser
		params map[string]any
		code   int32
	}{
		{"anonymous", context.Background(), nil, nil, errcode.AuthRequired.Code},
		{"disabled", workflowJSONRPCAdminContext(), &biz.AdminUser{ID: 7, Disabled: true}, nil, errcode.AdminDisabled.Code},
		{"forged-role", workflowJSONRPCAdminContext(), workflowJSONRPCAdmin([]string{biz.SalesRoleKey}), map[string]any{"role": "admin"}, errcode.InvalidParam.Code},
		{"forged-actor", workflowJSONRPCAdminContext(), workflowJSONRPCAdmin([]string{biz.SalesRoleKey}), map[string]any{"actor_id": 99}, errcode.InvalidParam.Code},
	} {
		t.Run(tc.name, func(t *testing.T) {
			d := &jsonrpcDispatcher{log: log.NewHelper(log.NewStdLogger(io.Discard)), adminReader: stubAdminAccountReader{admin: tc.admin}}
			params, _ := structpb.NewStruct(tc.params)
			_, res, err := d.handleAdmin(tc.ctx, "help_content", "help-test", params)
			if err != nil || res.Code != tc.code {
				t.Fatalf("result %#v %v", res, err)
			}
		})
	}
}
