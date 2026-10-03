package service

import (
	"context"

	v1 "server/api/jsonrpc/v1"
	"server/internal/biz"
	"server/internal/errcode"
)

func (d *jsonrpcDispatcher) requirePurchaseReceiptProcessWarehouseAccess(ctx context.Context, in *biz.ProcessDomainCommandExecution, instance *biz.ProcessInstance, node *biz.ProcessNodeInstance) *v1.JsonrpcResult {
	if in.CommandKey != biz.ProcessDomainCommandInventoryPostInbound && in.CommandKey != biz.ProcessDomainCommandPurchaseReceiptCreate {
		return nil
	}
	scope, res := d.currentWarehouseDataScope(ctx)
	if res != nil {
		return res
	}
	in.WarehouseScope = &scope
	if scope.IsAll() {
		return nil
	}
	if scope.Mode == biz.DataScopeModeNone {
		return &v1.JsonrpcResult{Code: errcode.PermissionDenied.Code, Message: errcode.PermissionDenied.Message}
	}
	if d.inventoryUC == nil {
		return &v1.JsonrpcResult{Code: errcode.Internal.Code, Message: errcode.Internal.Message}
	}
	err := d.inventoryUC.ValidatePurchaseReceiptProcessWarehouseAccess(ctx, &biz.ProcessDomainCommandInput{
		ProcessInstance: instance, Node: node, CommandKey: in.CommandKey,
		IdempotencyKey: in.IdempotencyKey, Payload: in.Payload, WarehouseScope: &scope,
	})
	if err != nil {
		return d.mapPurchaseError(ctx, err)
	}
	return nil
}
