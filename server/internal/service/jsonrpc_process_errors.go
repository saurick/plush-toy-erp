package service

import (
	"context"
	"errors"

	v1 "server/api/jsonrpc/v1"
	"server/internal/biz"
	"server/internal/errcode"
)

// Process actions can fail in a linked business domain. Reuse its known-error
// mapping; only the calling entry logs and returns an unknown internal failure.
func (d *jsonrpcDispatcher) processBusinessErrorResult(ctx context.Context, err error) *v1.JsonrpcResult {
	switch {
	case errors.Is(err, biz.ErrCustomerConfigModuleDisabled):
		return &v1.JsonrpcResult{Code: errcode.BusinessRuleViolation.Code, Message: "当前办理所需功能尚未开启，请联系管理员核对设置"}
	case errors.Is(err, biz.ErrCustomerConfigModuleReadOnly):
		return &v1.JsonrpcResult{Code: errcode.BusinessRuleViolation.Code, Message: "当前功能仅可查看，不能执行此操作，请联系管理员核对设置"}
	case errors.Is(err, biz.ErrForbidden), errors.Is(err, biz.ErrNoPermission), errors.Is(err, biz.ErrDataScopeForbidden):
		return &v1.JsonrpcResult{Code: errcode.PermissionDenied.Code, Message: errcode.PermissionDenied.Message}
	case errors.Is(err, biz.ErrProcessDomainCommandRecoveryRequired):
		return &v1.JsonrpcResult{Code: errcode.ProcessDomainCommandRecoveryRequired.Code, Message: errcode.ProcessDomainCommandRecoveryRequired.Message}
	case errors.Is(err, biz.ErrSourceOrderStateInvalid):
		return &v1.JsonrpcResult{Code: errcode.BusinessRuleViolation.Code, Message: "单据当前状态不允许此操作，请刷新后核对可办理的操作"}
	case errors.Is(err, biz.ErrSourceOrderNormalCloseIncomplete):
		return &v1.JsonrpcResult{Code: errcode.BusinessRuleViolation.Code, Message: "单据尚未全部履约，请核对剩余数量后再办理关闭"}
	}
	for _, knownError := range []func(context.Context, error) *v1.JsonrpcResult{
		d.salesOrderErrorResult,
		d.purchaseOrderErrorResult,
		d.purchaseErrorResult,
		d.qualityErrorResult,
		d.operationalFactErrorResult,
		d.inventoryErrorResult,
		d.outsourcingOrderErrorResult,
	} {
		if result := knownError(ctx, err); result != nil {
			return result
		}
	}
	return nil
}
