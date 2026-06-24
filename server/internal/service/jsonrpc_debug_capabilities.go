package service

import (
	"context"

	v1 "server/api/jsonrpc/v1"
	"server/internal/biz"
	"server/internal/errcode"
)

func (d *jsonrpcDispatcher) handleDebugCapabilities(ctx context.Context, id string) (string, *v1.JsonrpcResult, error) {
	if res := d.RequireAdminAnyPermission(ctx, biz.PermissionDebugBusinessChainRead, biz.PermissionDebugBusinessChainRun, biz.PermissionERPBusinessChainDebugRead); res != nil {
		return id, res, nil
	}
	return id, &v1.JsonrpcResult{
		Code:    errcode.OK.Code,
		Message: errcode.OK.Message,
		Data:    newDataStruct(debugCapabilitiesToMap(d.debugUC.Capabilities())),
	}, nil
}
