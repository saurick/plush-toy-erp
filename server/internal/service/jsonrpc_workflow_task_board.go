package service

import (
	"math"
	v1 "server/api/jsonrpc/v1"
	"server/internal/biz"
	"server/internal/errcode"
	"strings"
	"unicode/utf8"
)

const workflowTaskBoardMaxOffset = 2_147_483_647

func getWorkflowTaskBoardQuery(pm map[string]any) (biz.WorkflowTaskBoardQuery, *v1.JsonrpcResult) {
	calendar, calendarRes := parseWorkflowTaskCalendar(pm)
	if calendarRes != nil {
		return biz.WorkflowTaskBoardQuery{}, calendarRes
	}
	discovery, discoveryRes := getWorkflowTaskDiscoveryFilter(pm)
	if discoveryRes != nil {
		return biz.WorkflowTaskBoardQuery{}, discoveryRes
	}
	keyword, res := getOptionalWorkflowTaskBoardString(pm, "keyword", 200)
	if res != nil {
		return biz.WorkflowTaskBoardQuery{}, res
	}
	status, res := getOptionalWorkflowTaskBoardString(pm, "status", 32)
	if res != nil {
		return biz.WorkflowTaskBoardQuery{}, res
	}
	ownerRoleKey, res := getOptionalWorkflowTaskBoardString(pm, "owner_role_key", 32)
	if res != nil {
		return biz.WorkflowTaskBoardQuery{}, res
	}
	due, res := getOptionalWorkflowTaskBoardString(pm, "due", 32)
	if res != nil {
		return biz.WorkflowTaskBoardQuery{}, res
	}
	sourceType, res := getOptionalWorkflowTaskBoardString(pm, "source_type", 64)
	if res != nil {
		return biz.WorkflowTaskBoardQuery{}, res
	}
	laneKey, res := getOptionalWorkflowTaskBoardString(pm, "lane_key", 32)
	if res != nil {
		return biz.WorkflowTaskBoardQuery{}, res
	}
	sortKey, res := getOptionalWorkflowTaskBoardString(pm, "sort", 32)
	if res != nil {
		return biz.WorkflowTaskBoardQuery{}, res
	}
	approvalOnly := false
	if raw, exists := pm["approval_only"]; exists {
		value, ok := raw.(bool)
		if !ok {
			return biz.WorkflowTaskBoardQuery{}, &v1.JsonrpcResult{Code: errcode.InvalidParam.Code, Message: "approval_only 必须是布尔值"}
		}
		approvalOnly = value
	}
	todoOnly := false
	if raw, exists := pm["todo_only"]; exists {
		value, ok := raw.(bool)
		if !ok {
			return biz.WorkflowTaskBoardQuery{}, &v1.JsonrpcResult{Code: errcode.InvalidParam.Code, Message: "todo_only 必须是布尔值"}
		}
		todoOnly = value
	}
	limit, ok := getOptionalWorkflowTaskBoardInteger(pm, "limit", 5, 1)
	if !ok {
		return biz.WorkflowTaskBoardQuery{}, &v1.JsonrpcResult{Code: errcode.InvalidParam.Code, Message: "limit 必须是正整数"}
	}
	if limit > 50 {
		limit = 50
	}
	offset, ok := getOptionalWorkflowTaskBoardInteger(pm, "offset", 0, 0)
	if !ok || offset > workflowTaskBoardMaxOffset {
		return biz.WorkflowTaskBoardQuery{}, &v1.JsonrpcResult{Code: errcode.InvalidParam.Code, Message: "offset 必须是非负整数"}
	}
	var period, dateFrom, dateTo string
	for key, target := range map[string]*string{"period": &period, "date_from": &dateFrom, "date_to": &dateTo} {
		value, failure := getOptionalWorkflowTaskBoardString(pm, key, 10)
		if failure != nil {
			return biz.WorkflowTaskBoardQuery{}, failure
		}
		*target = value
	}
	return biz.WorkflowTaskBoardQuery{
		Period: period, DateFrom: dateFrom, DateTo: dateTo,
		Calendar:                    calendar,
		WorkflowTaskDiscoveryFilter: discovery,
		Keyword:                     keyword,
		Status:                      status,
		OwnerRoleKey:                ownerRoleKey,
		Due:                         due,
		SourceType:                  sourceType,
		LaneKey:                     laneKey,
		Sort:                        sortKey,
		ApprovalOnly:                approvalOnly,
		TodoOnly:                    todoOnly,
		Limit:                       limit,
		Offset:                      offset,
	}, nil
}

func getOptionalWorkflowTaskBoardString(pm map[string]any, key string, maxRunes int) (string, *v1.JsonrpcResult) {
	raw, exists := pm[key]
	if !exists {
		return "", nil
	}
	value, ok := raw.(string)
	if !ok || !utf8.ValidString(value) {
		return "", &v1.JsonrpcResult{Code: errcode.InvalidParam.Code, Message: key + " 必须是字符串"}
	}
	value = strings.TrimSpace(value)
	if utf8.RuneCountInString(value) > maxRunes {
		return "", &v1.JsonrpcResult{Code: errcode.InvalidParam.Code, Message: key + " 超出长度限制"}
	}
	return value, nil
}

func getOptionalWorkflowTaskBoardInteger(pm map[string]any, key string, fallback int, minimum int) (int, bool) {
	raw, exists := pm[key]
	if !exists {
		return fallback, true
	}
	const maxJSONSafeInteger = float64(9007199254740991)
	switch value := raw.(type) {
	case float64:
		if value < float64(minimum) || value > maxJSONSafeInteger || math.Trunc(value) != value {
			return 0, false
		}
		return int(value), true
	case int:
		if value < minimum || float64(value) > maxJSONSafeInteger {
			return 0, false
		}
		return value, true
	default:
		return 0, false
	}
}

func getWorkflowWorkbenchQuery(pm map[string]any) (biz.WorkflowWorkbenchQuery, *v1.JsonrpcResult) {
	queueKey, queueKeyRes := getOptionalWorkflowTaskBoardString(pm, "queue_key", 32)
	if queueKeyRes != nil {
		return biz.WorkflowWorkbenchQuery{}, queueKeyRes
	}
	if queueKey == "" {
		queueKey = biz.WorkflowWorkbenchQueueActionable
	}
	if _, ok := (biz.WorkflowWorkbenchCounts{}).QueueTotal(queueKey); !ok {
		return biz.WorkflowWorkbenchQuery{}, &v1.JsonrpcResult{Code: errcode.InvalidParam.Code, Message: "queue_key 不是有效的工作台队列"}
	}
	limit, ok := getOptionalWorkflowTaskBoardInteger(pm, "limit", 8, 1)
	if !ok {
		return biz.WorkflowWorkbenchQuery{}, &v1.JsonrpcResult{Code: errcode.InvalidParam.Code, Message: "limit 必须是正整数"}
	}
	if limit > 50 {
		limit = 50
	}
	offset, ok := getOptionalWorkflowTaskBoardInteger(pm, "offset", 0, 0)
	if !ok || offset > workflowTaskBoardMaxOffset {
		return biz.WorkflowWorkbenchQuery{}, &v1.JsonrpcResult{Code: errcode.InvalidParam.Code, Message: "offset 必须是非负整数"}
	}
	return biz.WorkflowWorkbenchQuery{
		QueueKey: queueKey,
		Limit:    limit,
		Offset:   offset,
	}, nil
}

func workflowWorkbenchToMap(workbench *biz.WorkflowWorkbenchPage) map[string]any {
	if workbench == nil {
		return nil
	}
	return map[string]any{
		"snapshot_at": workbench.SnapshotAt.Unix(),
		"queue_key":   workbench.QueueKey,
		"total":       workbench.Total,
		"limit":       workbench.Limit,
		"offset":      workbench.Offset,
		"items":       workflowTasksToAny(workbench.Items),
		"counts": map[string]any{
			"actionable": workbench.Counts.Actionable,
			"risk":       workbench.Counts.Risk,
			"approval":   workbench.Counts.Approval,
		},
	}
}

func workflowTaskBoardToMap(board *biz.WorkflowTaskBoard) map[string]any {
	if board == nil {
		return nil
	}
	if board.Calendar != nil {
		return workflowTaskCalendarToMap(board.Calendar)
	}
	lanes := make([]any, 0, len(board.Lanes))
	for _, lane := range board.Lanes {
		lanes = append(lanes, map[string]any{
			"key":    lane.Key,
			"total":  lane.Total,
			"limit":  lane.Limit,
			"offset": lane.Offset,
			"tasks":  workflowTasksToAny(lane.Tasks),
		})
	}
	return map[string]any{
		"snapshot_at": board.SnapshotAt.Unix(),
		"total":       board.Total,
		"counts": map[string]any{
			"actionable": board.Counts.Actionable,
			"exception":  board.Counts.Exception,
			"due":        board.Counts.Due,
			"finished":   board.Counts.Finished,
		},
		"lanes":           lanes,
		"source_types":    toAnySliceString(board.SourceTypes),
		"owner_role_keys": toAnySliceString(board.OwnerRoleKeys),
		"assignees":       workflowTaskPeopleToAny(board.Assignees),
	}
}
