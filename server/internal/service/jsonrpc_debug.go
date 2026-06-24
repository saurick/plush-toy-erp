package service

import (
	"context"

	v1 "server/api/jsonrpc/v1"
	"server/internal/errcode"

	"google.golang.org/protobuf/types/known/structpb"
)

func (d *jsonrpcDispatcher) handleDebug(
	ctx context.Context,
	method, id string,
	params *structpb.Struct,
) (string, *v1.JsonrpcResult, error) {
	l := d.log.WithContext(ctx)
	pm := map[string]any{}
	if params != nil {
		pm = params.AsMap()
	}

	claims, res := d.requireAdmin(ctx)
	if res != nil {
		l.Warnf("[debug] requireAdmin denied method=%s id=%s code=%d msg=%s", method, id, res.Code, res.Message)
		return id, res, nil
	}
	if d.debugUC == nil {
		l.Errorf("[debug] usecase is nil method=%s id=%s", method, id)
		return id, &v1.JsonrpcResult{Code: errcode.Internal.Code, Message: errcode.Internal.Message}, nil
	}

	switch method {
	case "capabilities", "config":
		return d.handleDebugCapabilities(ctx, id)
	case "rebuild_business_chain_scenario", "seed_business_chain_scenario":
		return d.handleDebugSeed(ctx, id, pm, claims.UserID)
	case "clear_business_chain_scenario", "cleanup_business_chain_scenario":
		return d.handleDebugCleanup(ctx, id, pm, claims.UserID)
	case "clear_business_data":
		return d.handleDebugClearBusinessData(ctx, id, claims.UserID)
	default:
		return id, unknownDebugResult(method), nil
	}
}
