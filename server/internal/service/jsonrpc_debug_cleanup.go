package service

import (
	"context"

	v1 "server/api/jsonrpc/v1"
	"server/internal/biz"
	"server/internal/errcode"
)

func (d *jsonrpcDispatcher) handleDebugCleanup(
	ctx context.Context,
	id string,
	pm map[string]any,
	actorID int,
) (string, *v1.JsonrpcResult, error) {
	l := d.log.WithContext(ctx)
	if res := d.RequireAdminAnyPermission(ctx, biz.PermissionDebugCleanup, biz.PermissionDebugBusinessChainRun); res != nil {
		return id, res, nil
	}
	debugRunID := debugParamString(pm, "debug_run_id", "debugRunId")
	scenarioKey := debugParamString(pm, "scenario_key", "scenarioKey")
	dryRun := getBool(pm, "dry_run", getBool(pm, "dryRun", false))
	force := getBool(pm, "force", false)
	result, err := d.debugUC.CleanupBusinessChainScenario(ctx, biz.DebugBusinessChainCleanupInput{
		DebugRunID:  debugRunID,
		ScenarioKey: scenarioKey,
		DryRun:      dryRun,
		Force:       force,
	})
	if err != nil {
		l.Warnw(
			"msg", "debug cleanup failed",
			"scenario_key", scenarioKey,
			"debug_run_id", debugRunID,
			"actor_id", actorID,
			"dry_run", dryRun,
			"force", force,
			"error", err,
		)
		return id, d.mapDebugError(ctx, err), nil
	}
	l.Infow(
		"msg", "debug cleanup succeeded",
		"scenario_key", result.ScenarioKey,
		"debug_run_id", result.DebugRunID,
		"actor_id", actorID,
		"dry_run", result.DryRun,
		"matched_records", len(result.MatchedRecords),
		"archived_records", len(result.ArchivedRecords),
		"matched_tasks", len(result.MatchedTasks),
		"deleted_tasks", len(result.DeletedTasks),
		"deleted_business_states", result.DeletedBusinessStates,
		"deleted_task_events", result.DeletedTaskEvents,
		"skipped_items", len(result.SkippedItems),
	)
	return id, &v1.JsonrpcResult{
		Code:    errcode.OK.Code,
		Message: "调试数据清理完成",
		Data:    newDataStruct(debugCleanupResultToMap(result)),
	}, nil
}
