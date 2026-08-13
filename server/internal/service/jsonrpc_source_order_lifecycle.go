package service

import (
	v1 "server/api/jsonrpc/v1"
	"server/internal/biz"
	"server/internal/errcode"
)

func sourceOrderLifecycleActionFromParams(
	pm map[string]any,
	actionKey string,
	actorID int,
) (*biz.SourceOrderLifecycleAction, bool) {
	if !jsonRPCParamsAllowed(
		pm,
		"customer_key",
		"id",
		"expected_version",
		"idempotency_key",
		"reason",
		"close_mode",
	) {
		return nil, false
	}
	in := biz.SourceOrderLifecycleAction{
		ID:              getInt(pm, "id", 0),
		ExpectedVersion: getInt(pm, "expected_version", 0),
		IdempotencyKey:  getString(pm, "idempotency_key"),
		Reason:          getString(pm, "reason"),
		CloseMode:       getString(pm, "close_mode"),
		ActorID:         actorID,
	}
	normalized, err := biz.NormalizeSourceOrderLifecycleAction(in, actionKey)
	if err != nil {
		return nil, false
	}
	return &normalized, true
}

func invalidSourceOrderLifecycleParamsResult() *v1.JsonrpcResult {
	return &v1.JsonrpcResult{
		Code:    errcode.InvalidParam.Code,
		Message: "订单动作参数不完整，请刷新后重试；取消和短关闭必须填写原因",
	}
}
