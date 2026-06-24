package service

import (
	"context"

	v1 "server/api/jsonrpc/v1"
	"server/internal/biz"
	"server/internal/errcode"
)

func (d *jsonrpcDispatcher) handleDebugSeed(
	ctx context.Context,
	id string,
	pm map[string]any,
	actorID int,
) (string, *v1.JsonrpcResult, error) {
	l := d.log.WithContext(ctx)
	if res := d.RequireAdminAnyPermission(ctx, biz.PermissionDebugSeed, biz.PermissionDebugBusinessChainRun); res != nil {
		return id, res, nil
	}
	scenarioKey := debugParamString(pm, "scenario_key", "scenarioKey")
	debugRunID := debugParamString(pm, "debug_run_id", "debugRunId")
	result, err := d.debugUC.SeedBusinessChainScenario(ctx, biz.DebugBusinessChainSeedInput{
		ScenarioKey: scenarioKey,
		DebugRunID:  debugRunID,
	}, actorID)
	if err != nil {
		l.Warnw(
			"msg", "debug seed failed",
			"scenario_key", scenarioKey,
			"debug_run_id", debugRunID,
			"actor_id", actorID,
			"error", err,
		)
		return id, d.mapDebugError(ctx, err), nil
	}
	l.Infow(
		"msg", "debug seed succeeded",
		"scenario_key", result.ScenarioKey,
		"debug_run_id", result.DebugRunID,
		"actor_id", actorID,
		"created_records", len(result.CreatedRecords),
		"created_tasks", len(result.CreatedTasks),
		"partial", result.Partial,
	)
	return id, &v1.JsonrpcResult{
		Code:    errcode.OK.Code,
		Message: "调试数据已生成",
		Data:    newDataStruct(debugSeedResultToMap(result)),
	}, nil
}
