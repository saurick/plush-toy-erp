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
	actorID int,
) (string, *v1.JsonrpcResult, error) {
	l := d.log.WithContext(ctx)
	if res := d.RequireAdminPermission(ctx, biz.PermissionDebugBusinessClear); res != nil {
		return id, res, nil
	}
	result, err := d.debugUC.ClearBusinessData(ctx)
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
		"deleted_total", result.DeletedTotal,
		"cleared_tables", result.ClearedTableNames,
	)
	return id, &v1.JsonrpcResult{
		Code:    errcode.OK.Code,
		Message: "业务数据已清空",
		Data:    newDataStruct(debugBusinessDataClearResultToMap(result)),
	}, nil
}
