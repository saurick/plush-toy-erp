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
	// Do not coerce intent fields: distinct numeric keys must never round to
	// the same receipt identity, and non-text reasons are not business intent.
	for _, field := range []string{"customer_key", "idempotency_key", "reason", "close_mode"} {
		if value, exists := pm[field]; exists {
			if _, ok := value.(string); !ok {
				return nil, false
			}
		}
	}
	sourceID, idOK := getRequiredJSONRPCPositiveInt(pm, "id")
	expectedVersion, versionOK := getRequiredJSONRPCPositiveInt(pm, "expected_version")
	if !idOK || !versionOK {
		return nil, false
	}
	in := biz.SourceOrderLifecycleAction{
		ID:              sourceID,
		ExpectedVersion: expectedVersion,
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
