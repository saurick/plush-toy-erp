package service

import (
	"context"

	v1 "server/api/jsonrpc/v1"
	"server/internal/biz"
	"server/internal/errcode"
)

func (d *jsonrpcDispatcher) currentWarehouseDataScope(ctx context.Context) (biz.WarehouseDataScope, *v1.JsonrpcResult) {
	if d == nil || d.adminManageUC == nil {
		return biz.WarehouseDataScope{Mode: biz.DataScopeModeNone}, &v1.JsonrpcResult{Code: errcode.Internal.Code, Message: errcode.Internal.Message}
	}
	admin, result := d.CurrentAdmin(ctx)
	if result != nil {
		return biz.WarehouseDataScope{Mode: biz.DataScopeModeNone}, result
	}
	scope, err := d.adminManageUC.EffectiveWarehouseDataScope(ctx, admin)
	if err != nil {
		d.log.WithContext(ctx).Errorf("[data_scope] resolve warehouse scope err=%v", err)
		return biz.WarehouseDataScope{Mode: biz.DataScopeModeNone}, &v1.JsonrpcResult{Code: errcode.Internal.Code, Message: errcode.Internal.Message}
	}
	return biz.NormalizeWarehouseDataScope(scope), nil
}
