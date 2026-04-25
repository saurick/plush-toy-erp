package data

import (
	"context"
	"errors"
	"fmt"
	"strings"

	v1 "server/api/jsonrpc/v1"
	"server/internal/biz"
	"server/internal/errcode"

	"google.golang.org/protobuf/types/known/structpb"
)

func (d *JsonrpcData) handleDebug(
	ctx context.Context,
	method, id string,
	params *structpb.Struct,
) (string, *v1.JsonrpcResult, error) {
	l := d.log.WithContext(ctx)
	pm := map[string]any{}
	if params != nil {
		pm = params.AsMap()
	}

	claims, _, res := d.requireDebugOperator(ctx)
	if res != nil {
		l.Warnf("[debug] requireDebugOperator denied method=%s id=%s code=%d msg=%s", method, id, res.Code, res.Message)
		return id, res, nil
	}
	if d.debugUC == nil {
		l.Errorf("[debug] usecase is nil method=%s id=%s", method, id)
		return id, &v1.JsonrpcResult{Code: errcode.Internal.Code, Message: errcode.Internal.Message}, nil
	}

	switch method {
	case "capabilities", "config":
		return id, &v1.JsonrpcResult{
			Code:    errcode.OK.Code,
			Message: errcode.OK.Message,
			Data:    newDataStruct(debugCapabilitiesToMap(d.debugUC.Capabilities())),
		}, nil

	case "rebuild_business_chain_scenario", "seed_business_chain_scenario":
		scenarioKey := debugParamString(pm, "scenario_key", "scenarioKey")
		debugRunID := debugParamString(pm, "debug_run_id", "debugRunId")
		result, err := d.debugUC.SeedBusinessChainScenario(ctx, biz.DebugBusinessChainSeedInput{
			ScenarioKey: scenarioKey,
			DebugRunID:  debugRunID,
		}, claims.UserID)
		if err != nil {
			l.Warnw(
				"msg", "debug seed failed",
				"scenario_key", scenarioKey,
				"debug_run_id", debugRunID,
				"actor_id", claims.UserID,
				"error", err,
			)
			return id, d.mapDebugError(ctx, err), nil
		}
		l.Infow(
			"msg", "debug seed succeeded",
			"scenario_key", result.ScenarioKey,
			"debug_run_id", result.DebugRunID,
			"actor_id", claims.UserID,
			"created_records", len(result.CreatedRecords),
			"created_tasks", len(result.CreatedTasks),
			"partial", result.Partial,
		)
		return id, &v1.JsonrpcResult{
			Code:    errcode.OK.Code,
			Message: "调试数据已生成",
			Data:    newDataStruct(debugSeedResultToMap(result)),
		}, nil

	case "clear_business_chain_scenario", "cleanup_business_chain_scenario":
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
				"actor_id", claims.UserID,
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
			"actor_id", claims.UserID,
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

	default:
		return id, &v1.JsonrpcResult{
			Code:    errcode.UnknownMethod.Code,
			Message: fmt.Sprintf("未知 debug 接口 method=%s", method),
		}, nil
	}
}

func (d *JsonrpcData) requireDebugOperator(ctx context.Context) (*biz.AuthClaims, *biz.AdminUser, *v1.JsonrpcResult) {
	claims, res := d.requireAdmin(ctx)
	if res != nil {
		return nil, nil, res
	}
	admin, err := d.getCurrentAdmin(ctx, claims)
	if err != nil {
		d.log.WithContext(ctx).Warnf("[debug] get current admin failed err=%v", err)
		return nil, nil, &v1.JsonrpcResult{Code: errcode.AdminRequired.Code, Message: errcode.AdminRequired.Message}
	}
	if !adminHasMenuPermission(admin, "/erp/qa/business-chain-debug") {
		return nil, nil, &v1.JsonrpcResult{Code: errcode.PermissionDenied.Code, Message: "需要业务链路调试权限"}
	}
	return claims, admin, nil
}

func adminHasMenuPermission(admin *biz.AdminUser, permission string) bool {
	if admin == nil {
		return false
	}
	allowed := biz.EffectiveAdminMenuPermissions(biz.AdminLevel(admin.Level), admin.MenuPermissions)
	for _, item := range allowed {
		if item == permission {
			return true
		}
	}
	return false
}

func (d *JsonrpcData) mapDebugError(ctx context.Context, err error) *v1.JsonrpcResult {
	l := d.log.WithContext(ctx)

	switch {
	case errors.Is(err, biz.ErrDebugSeedDisabled):
		reason := ""
		if d.debugUC != nil {
			reason = d.debugUC.Capabilities().SeedDisabledReason
		}
		if reason == "" {
			reason = "生成调试数据能力未开启"
		}
		l.Warnf("[debug] seed disabled err=%v reason=%s", err, reason)
		return &v1.JsonrpcResult{Code: errcode.PermissionDenied.Code, Message: reason}
	case errors.Is(err, biz.ErrDebugCleanupDisabled):
		reason := ""
		if d.debugUC != nil {
			reason = d.debugUC.Capabilities().CleanupDisabledReason
		}
		if reason == "" {
			reason = "清理调试数据能力未开启"
		}
		l.Warnf("[debug] cleanup disabled err=%v reason=%s", err, reason)
		return &v1.JsonrpcResult{Code: errcode.PermissionDenied.Code, Message: reason}
	case errors.Is(err, biz.ErrDebugRunIDRequired):
		l.Warnf("[debug] missing debugRunId err=%v", err)
		return &v1.JsonrpcResult{Code: errcode.InvalidParam.Code, Message: "必须提供 debugRunId，本接口禁止无范围清理"}
	case errors.Is(err, biz.ErrDebugScenarioNotFound):
		l.Warnf("[debug] scenario not found err=%v", err)
		return &v1.JsonrpcResult{Code: errcode.InvalidParam.Code, Message: "调试场景不存在"}
	case errors.Is(err, biz.ErrDebugCleanupScopeInvalid):
		l.Warnf("[debug] cleanup scope invalid err=%v", err)
		return &v1.JsonrpcResult{Code: errcode.PermissionDenied.Code, Message: "清理范围不受支持"}
	case errors.Is(err, biz.ErrDebugPayloadMarkerMissing):
		l.Warnf("[debug] payload marker missing err=%v", err)
		return &v1.JsonrpcResult{Code: errcode.InvalidParam.Code, Message: "调试数据缺少安全标记"}
	case errors.Is(err, biz.ErrBusinessRecordExists), errors.Is(err, biz.ErrWorkflowTaskExists):
		l.Warnf("[debug] duplicated debug run err=%v", err)
		return &v1.JsonrpcResult{Code: errcode.InvalidParam.Code, Message: "debugRunId 已存在，请重新生成"}
	case errors.Is(err, biz.ErrBadParam):
		l.Warnf("[debug] invalid param err=%v", err)
		return &v1.JsonrpcResult{Code: errcode.InvalidParam.Code, Message: errcode.InvalidParam.Message}
	default:
		l.Errorf("[debug] internal err=%v", err)
		return &v1.JsonrpcResult{Code: errcode.Internal.Code, Message: errcode.Internal.Message}
	}
}

func debugParamString(pm map[string]any, keys ...string) string {
	for _, key := range keys {
		value := strings.TrimSpace(getString(pm, key))
		if value != "" {
			return value
		}
	}
	return ""
}

func debugCapabilitiesToMap(capabilities biz.DebugCapabilities) map[string]any {
	return map[string]any{
		"environment":             capabilities.Environment,
		"seedEnabled":             capabilities.SeedEnabled,
		"seedAllowed":             capabilities.SeedAllowed,
		"seedDisabledReason":      capabilities.SeedDisabledReason,
		"cleanupEnabled":          capabilities.CleanupEnabled,
		"cleanupAllowed":          capabilities.CleanupAllowed,
		"cleanupDisabledReason":   capabilities.CleanupDisabledReason,
		"cleanupScope":            capabilities.CleanupScope,
		"supportedScenarios":      debugScenarioSummariesToAny(capabilities.SupportedScenarios),
		"cleanupOnlyDebugData":    true,
		"requiresDebugRunId":      true,
		"requiresBackendGuard":    true,
		"destructiveRemoteDenied": true,
	}
}

func debugScenarioSummariesToAny(items []biz.DebugScenarioSummary) []any {
	out := make([]any, 0, len(items))
	for _, item := range items {
		out = append(out, map[string]any{
			"key":             item.Key,
			"title":           item.Title,
			"scenarioCode":    item.ScenarioCode,
			"coverageStatus":  item.CoverageStatus,
			"partial":         item.Partial,
			"warnings":        toAnySliceString(item.Warnings),
			"nextCheckpoints": debugCheckpointsToAny(item.NextCheckpoints),
		})
	}
	return out
}

func debugSeedResultToMap(result *biz.DebugBusinessChainSeedResult) map[string]any {
	if result == nil {
		return map[string]any{}
	}
	return map[string]any{
		"scenarioKey":     result.ScenarioKey,
		"debugRunId":      result.DebugRunID,
		"coverageStatus":  result.CoverageStatus,
		"partial":         result.Partial,
		"createdRecords":  debugCreatedRecordsToAny(result.CreatedRecords),
		"createdTasks":    debugCreatedTasksToAny(result.CreatedTasks),
		"nextCheckpoints": debugCheckpointsToAny(result.NextCheckpoints),
		"cleanupToken":    result.CleanupToken,
		"cleanupParams": map[string]any{
			"debugRunId":  result.DebugRunID,
			"scenarioKey": result.ScenarioKey,
			"dryRun":      true,
		},
		"warnings": toAnySliceString(result.Warnings),
	}
}

func debugCleanupResultToMap(result *biz.DebugBusinessChainCleanupResult) map[string]any {
	if result == nil {
		return map[string]any{}
	}
	return map[string]any{
		"debugRunId":            result.DebugRunID,
		"scenarioKey":           result.ScenarioKey,
		"dryRun":                result.DryRun,
		"matchedRecords":        debugMatchedRecordsToAny(result.MatchedRecords),
		"matchedTasks":          debugMatchedTasksToAny(result.MatchedTasks),
		"matchedBusinessStates": debugMatchedBusinessStatesToAny(result.MatchedBusinessStates),
		"archivedRecords":       debugMatchedRecordsToAny(result.ArchivedRecords),
		"deletedTasks":          debugMatchedTasksToAny(result.DeletedTasks),
		"deletedBusinessStates": result.DeletedBusinessStates,
		"deletedTaskEvents":     result.DeletedTaskEvents,
		"skippedItems":          debugSkippedItemsToAny(result.SkippedItems),
		"warnings":              toAnySliceString(result.Warnings),
	}
}

func debugCreatedRecordsToAny(items []biz.DebugCreatedRecord) []any {
	out := make([]any, 0, len(items))
	for _, item := range items {
		out = append(out, map[string]any{
			"id":                item.ID,
			"moduleKey":         item.ModuleKey,
			"documentNo":        item.DocumentNo,
			"title":             item.Title,
			"businessStatusKey": item.BusinessStatusKey,
			"ownerRoleKey":      item.OwnerRoleKey,
		})
	}
	return out
}

func debugCreatedTasksToAny(items []biz.DebugCreatedTask) []any {
	out := make([]any, 0, len(items))
	for _, item := range items {
		out = append(out, map[string]any{
			"id":                item.ID,
			"taskCode":          item.TaskCode,
			"taskGroup":         item.TaskGroup,
			"taskName":          item.TaskName,
			"sourceType":        item.SourceType,
			"sourceId":          item.SourceID,
			"sourceNo":          item.SourceNo,
			"businessStatusKey": item.BusinessStatusKey,
			"taskStatusKey":     item.TaskStatusKey,
			"ownerRoleKey":      item.OwnerRoleKey,
		})
	}
	return out
}

func debugCheckpointsToAny(items []biz.DebugCheckpoint) []any {
	out := make([]any, 0, len(items))
	for _, item := range items {
		out = append(out, map[string]any{
			"label":  item.Label,
			"path":   item.Path,
			"query":  item.Query,
			"reason": item.Reason,
		})
	}
	return out
}

func debugMatchedRecordsToAny(items []biz.DebugMatchedRecord) []any {
	out := make([]any, 0, len(items))
	for _, item := range items {
		out = append(out, map[string]any{
			"id":         item.ID,
			"moduleKey":  item.ModuleKey,
			"documentNo": item.DocumentNo,
			"title":      item.Title,
		})
	}
	return out
}

func debugMatchedTasksToAny(items []biz.DebugMatchedTask) []any {
	out := make([]any, 0, len(items))
	for _, item := range items {
		out = append(out, map[string]any{
			"id":        item.ID,
			"taskCode":  item.TaskCode,
			"taskGroup": item.TaskGroup,
			"taskName":  item.TaskName,
			"sourceNo":  item.SourceNo,
		})
	}
	return out
}

func debugMatchedBusinessStatesToAny(items []biz.DebugMatchedBusinessState) []any {
	out := make([]any, 0, len(items))
	for _, item := range items {
		out = append(out, map[string]any{
			"id":                item.ID,
			"sourceType":        item.SourceType,
			"sourceId":          item.SourceID,
			"sourceNo":          item.SourceNo,
			"businessStatusKey": item.BusinessStatusKey,
		})
	}
	return out
}

func debugSkippedItemsToAny(items []biz.DebugCleanupSkippedItem) []any {
	out := make([]any, 0, len(items))
	for _, item := range items {
		out = append(out, map[string]any{
			"type":   item.Type,
			"id":     item.ID,
			"reason": item.Reason,
		})
	}
	return out
}
