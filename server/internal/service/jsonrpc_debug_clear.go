package service

import (
	"context"

	v1 "server/api/jsonrpc/v1"
	"server/internal/biz"
	"server/internal/errcode"
)

func (d *jsonrpcDispatcher) handleDebugClearBusinessData(
	ctx context.Context,
	id string,
	pm map[string]any,
	actorID int,
) (string, *v1.JsonrpcResult, error) {
	l := d.log.WithContext(ctx)
	if res := d.RequireAdminPermission(ctx, biz.PermissionDebugBusinessClear); res != nil {
		return id, res, nil
	}
	input := biz.DebugBusinessDataClearInput{
		DryRun:       getBool(pm, "dryRun", true),
		Confirmation: getString(pm, "confirmation"),
	}
	result, err := d.debugUC.ClearBusinessData(ctx, input)
	if err != nil {
		l.Warnw(
			"msg", "debug clear business data failed",
			"actor_id", actorID,
			"error", err,
		)
		return id, d.mapDebugError(ctx, err), nil
	}
	l.Infow(
		"msg", "debug clear business data succeeded",
		"actor_id", actorID,
		"dry_run", result.DryRun,
		"matched_total", result.MatchedTotal,
		"deleted_total", result.DeletedTotal,
		"cleared_tables", result.ClearedTableNames,
	)
	message := "业务数据清空范围已统计"
	if !result.DryRun {
		message = "业务数据已清空"
	}
	return id, &v1.JsonrpcResult{
		Code:    errcode.OK.Code,
		Message: message,
		Data:    newDataStruct(debugBusinessDataClearResultToMap(result)),
	}, nil
}
