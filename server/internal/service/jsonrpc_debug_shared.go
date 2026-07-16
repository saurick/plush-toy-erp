package service

import (
	"context"
	"errors"
	"fmt"
	"strings"

	v1 "server/api/jsonrpc/v1"
	"server/internal/biz"
	"server/internal/errcode"
)

func unknownDebugResult(method string) *v1.JsonrpcResult {
	return &v1.JsonrpcResult{
		Code:    errcode.UnknownMethod.Code,
		Message: fmt.Sprintf("未知 debug 接口 method=%s", method),
	}
}

func (d *jsonrpcDispatcher) mapDebugError(ctx context.Context, err error) *v1.JsonrpcResult {
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
	case errors.Is(err, biz.ErrDebugBusinessDataClearDisabled):
		reason := ""
		if d.debugUC != nil {
			reason = d.debugUC.Capabilities().BusinessDataClearDisabledReason
		}
		if reason == "" {
			reason = "业务数据清空能力未开启"
		}
		l.Warnf("[debug] clear business data disabled err=%v reason=%s", err, reason)
		return &v1.JsonrpcResult{Code: errcode.PermissionDenied.Code, Message: reason}
	case errors.Is(err, biz.ErrDebugBusinessDataClearConfirmationInvalid):
		l.Warnf("[debug] clear business data confirmation invalid err=%v", err)
		return &v1.JsonrpcResult{Code: errcode.InvalidParam.Code, Message: "全量清空业务数据必须提供精确确认短语"}
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
	case errors.Is(err, biz.ErrWorkflowTaskExists):
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
		"environment":                          capabilities.Environment,
		"databaseName":                         capabilities.DatabaseName,
		"seedEnabled":                          capabilities.SeedEnabled,
		"seedAllowed":                          capabilities.SeedAllowed,
		"seedDisabledReason":                   capabilities.SeedDisabledReason,
		"cleanupEnabled":                       capabilities.CleanupEnabled,
		"cleanupAllowed":                       capabilities.CleanupAllowed,
		"cleanupDisabledReason":                capabilities.CleanupDisabledReason,
		"businessDataClearEnabled":             capabilities.BusinessDataClearEnabled,
		"businessDataClearAllowed":             capabilities.BusinessDataClearAllowed,
		"businessDataClearDisabledReason":      capabilities.BusinessDataClearDisabledReason,
		"businessDataClearDryRunDefault":       capabilities.BusinessDataClearDryRunDefault,
		"businessDataClearConfirmation":        capabilities.BusinessDataClearConfirmation,
		"businessDataClearAllowedEnvironments": []any{"local", "dev"},
		"cleanupScope":                         capabilities.CleanupScope,
		"supportedScenarios":                   debugScenarioSummariesToAny(capabilities.SupportedScenarios),
		"cleanupOnlyDebugData":                 true,
		"requiresDebugRunId":                   true,
		"requiresBackendGuard":                 true,
		"destructiveRemoteDenied":              true,
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
		"matchedAttachments":    result.MatchedAttachments,
		"deletedAttachments":    result.DeletedAttachments,
		"skippedItems":          debugSkippedItemsToAny(result.SkippedItems),
		"warnings":              toAnySliceString(result.Warnings),
	}
}

func debugBusinessDataClearResultToMap(result *biz.DebugBusinessDataClearResult) map[string]any {
	if result == nil {
		return map[string]any{}
	}
	return map[string]any{
		"dryRun":            result.DryRun,
		"matchedCounts":     toAnyMapStringInt(result.MatchedCounts),
		"matchedTotal":      result.MatchedTotal,
		"deletedCounts":     toAnyMapStringInt(result.DeletedCounts),
		"deletedTotal":      result.DeletedTotal,
		"clearedTableNames": toAnySliceString(result.ClearedTableNames),
		"warnings":          toAnySliceString(result.Warnings),
		"query":             "",
	}
}

func toAnyMapStringInt(values map[string]int) map[string]any {
	out := make(map[string]any, len(values))
	for key, value := range values {
		out[key] = value
	}
	return out
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
