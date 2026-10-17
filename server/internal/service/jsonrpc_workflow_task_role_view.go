package service

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"math"
	v1 "server/api/jsonrpc/v1"
	"server/internal/biz"
	"server/internal/errcode"
	"strings"
	"time"
	"unicode/utf8"
)

const workflowRoleTaskViewCursorVersion = 4

const (
	workflowRoleTaskRiskScopeRole       = "role"
	workflowRoleTaskRiskScopeSupervised = "supervised"
)

type workflowRoleTaskViewRequest struct {
	Due        string
	SourceType string
	Calendar   *biz.WorkflowTaskCalendarQuery
	biz.WorkflowTaskDiscoveryFilter
	Keyword              string
	SortKey              string
	StatusKey            string
	Period               string
	DateFrom             string
	DateTo               string
	CompletedFrom        *time.Time
	CompletedBefore      *time.Time
	BeforeTime           *time.Time
	Method               string
	ViewKey              string
	RoleKey              string
	Limit                int
	BeforeID             int
	SnapshotAt           time.Time
	ExpectedTotal        int
	SeenTotal            int
	CursorRiskScope      string
	ReviewRoleKeys       []string
	ReviewScopeKey       string
	CursorReviewScopeKey string
	HasCursor            bool
}

type workflowRoleTaskViewCursor struct {
	Due        string `json:"due"`
	SourceType string `json:"source_type"`
	biz.WorkflowTaskDiscoveryFilter
	Keyword        string     `json:"keyword"`
	SortKey        string     `json:"sort_key"`
	StatusKey      string     `json:"status_key"`
	Period         string     `json:"period"`
	DateFrom       string     `json:"date_from"`
	DateTo         string     `json:"date_to"`
	BeforeTime     *time.Time `json:"before_time"`
	Version        int        `json:"v"`
	Method         string     `json:"method"`
	ViewKey        string     `json:"view_key"`
	RoleKey        string     `json:"role_key"`
	BeforeID       int        `json:"before_id"`
	SnapshotUnix   int64      `json:"snapshot_unix"`
	ExpectedTotal  int        `json:"expected_total"`
	SeenTotal      int        `json:"seen_total"`
	RiskScope      string     `json:"risk_scope"`
	ReviewScopeKey string     `json:"review_scope_key,omitempty"`
}

func parseWorkflowRoleTaskViewRequest(
	pm map[string]any,
	method string,
) (workflowRoleTaskViewRequest, *v1.JsonrpcResult) {
	if res := rejectUnknownWorkflowTaskParams(pm, method, "view_key", "role_key", "limit", "cursor", "keyword", "sort_key", "status_key", "due", "source_type", "period", "date_from", "date_to", "module_key", "stage_key", "chain_key", "assignee", "calendar_month", "calendar_selection", "calendar_offset", "calendar_revision"); res != nil {
		return workflowRoleTaskViewRequest{}, res
	}
	calendar, calendarRes := parseWorkflowTaskCalendar(pm)
	if calendarRes != nil {
		return workflowRoleTaskViewRequest{}, calendarRes
	}
	if calendar != nil && (getString(pm, "view_key") != biz.WorkflowRoleTaskViewTodo || pm["cursor"] != nil || method != "list_role_tasks") {
		return workflowRoleTaskViewRequest{}, &v1.JsonrpcResult{Code: errcode.InvalidParam.Code, Message: "待办日历查询条件无效"}
	}
	request := workflowRoleTaskViewRequest{
		Calendar: calendar,
		Method:   method,
		ViewKey:  strings.TrimSpace(getString(pm, "view_key")),
		RoleKey:  biz.NormalizeRoleKey(getString(pm, "role_key")),
	}
	if request.ViewKey == "" || request.RoleKey == "" {
		return workflowRoleTaskViewRequest{}, &v1.JsonrpcResult{
			Code:    errcode.InvalidParam.Code,
			Message: "岗位任务视图参数不完整",
		}
	}
	if raw, exists := pm["keyword"]; exists {
		value, ok := raw.(string)
		if !ok || utf8.RuneCountInString(strings.TrimSpace(value)) > 100 {
			return workflowRoleTaskViewRequest{}, &v1.JsonrpcResult{Code: errcode.InvalidParam.Code, Message: "搜索内容最多 100 个字"}
		}
		request.Keyword = strings.TrimSpace(value)
	}
	for key, target := range map[string]*string{"due": &request.Due, "source_type": &request.SourceType, "sort_key": &request.SortKey, "status_key": &request.StatusKey, "period": &request.Period, "date_from": &request.DateFrom, "date_to": &request.DateTo} {
		if raw, exists := pm[key]; exists {
			value, ok := raw.(string)
			if !ok || value == "" || value != strings.TrimSpace(value) {
				return workflowRoleTaskViewRequest{}, &v1.JsonrpcResult{Code: errcode.InvalidParam.Code, Message: "任务筛选或排序无效"}
			}
			*target = value
		}
	}
	if !biz.ValidWorkflowRoleTaskListOptions(request.ViewKey, request.SortKey, request.StatusKey) ||
		!biz.ValidWorkflowTaskListFilters(request.Due, request.SourceType) ||
		(request.ViewKey != biz.WorkflowRoleTaskViewHistory && (request.Period != "" || request.DateFrom != "" || request.DateTo != "")) {
		return workflowRoleTaskViewRequest{}, &v1.JsonrpcResult{Code: errcode.InvalidParam.Code, Message: "任务筛选或排序无效"}
	}
	if request.ViewKey == biz.WorkflowRoleTaskViewHistory {
		request.SortKey = biz.WorkflowRoleTaskSortCompleted
	}
	limit, limitRes := getWorkflowRoleTaskViewLimit(pm)
	if limitRes != nil {
		return workflowRoleTaskViewRequest{}, limitRes
	}
	request.WorkflowTaskDiscoveryFilter, limitRes = getWorkflowTaskDiscoveryFilter(pm)
	if limitRes != nil {
		return workflowRoleTaskViewRequest{}, limitRes
	}
	request.Limit = limit
	cursor := ""
	if rawCursor, exists := pm["cursor"]; exists {
		value, ok := rawCursor.(string)
		if !ok {
			return workflowRoleTaskViewRequest{}, &v1.JsonrpcResult{
				Code:    errcode.InvalidParam.Code,
				Message: "cursor 必须是文本",
			}
		}
		cursor = value
	}
	request.SnapshotAt = time.Now()
	if cursor != "" {
		cursorState, cursorRes := decodeWorkflowRoleTaskViewCursor(cursor)
		if cursorRes != nil ||
			cursorState.WorkflowTaskDiscoveryFilter != request.WorkflowTaskDiscoveryFilter ||
			cursorState.Method != request.Method ||
			cursorState.ViewKey != request.ViewKey ||
			cursorState.RoleKey != request.RoleKey || cursorState.Keyword != request.Keyword ||
			cursorState.SortKey != request.SortKey || cursorState.StatusKey != request.StatusKey ||
			cursorState.Due != request.Due || cursorState.SourceType != request.SourceType ||
			cursorState.Period != request.Period || cursorState.DateFrom != request.DateFrom || cursorState.DateTo != request.DateTo {
			if cursorRes != nil {
				return workflowRoleTaskViewRequest{}, cursorRes
			}
			return workflowRoleTaskViewRequest{}, invalidWorkflowRoleTaskViewCursorResult()
		}
		request.BeforeID = cursorState.BeforeID
		request.BeforeTime = cursorState.BeforeTime
		request.SnapshotAt = time.Unix(cursorState.SnapshotUnix, 0)
		request.ExpectedTotal = cursorState.ExpectedTotal
		request.SeenTotal = cursorState.SeenTotal
		request.CursorRiskScope = cursorState.RiskScope
		request.CursorReviewScopeKey = cursorState.ReviewScopeKey
		request.HasCursor = true
	}
	var dateErr error
	request.CompletedFrom, request.CompletedBefore, dateErr = biz.WorkflowRoleTaskHistoryDateBounds(request.Period, request.DateFrom, request.DateTo, request.SnapshotAt)
	if dateErr != nil {
		return workflowRoleTaskViewRequest{}, &v1.JsonrpcResult{Code: errcode.InvalidParam.Code, Message: "处理时间范围无效，请重新选择"}
	}
	return request, nil
}

func getWorkflowRoleTaskViewLimit(pm map[string]any) (int, *v1.JsonrpcResult) {
	raw, exists := pm["limit"]
	if !exists {
		return 50, nil
	}
	value, ok := raw.(float64)
	if !ok || value < 1 || value > 100 || value != math.Trunc(value) {
		return 0, &v1.JsonrpcResult{Code: errcode.InvalidParam.Code, Message: "limit 必须是 1 到 100 的整数"}
	}
	return int(value), nil
}

func encodeWorkflowRoleTaskViewCursor(cursor workflowRoleTaskViewCursor) string {
	if cursor.BeforeID <= 0 || cursor.SnapshotUnix <= 0 {
		return ""
	}
	cursor.Version = workflowRoleTaskViewCursorVersion
	raw, err := json.Marshal(cursor)
	if err != nil {
		return ""
	}
	return base64.RawURLEncoding.EncodeToString(raw)
}

func decodeWorkflowRoleTaskViewCursor(cursor string) (workflowRoleTaskViewCursor, *v1.JsonrpcResult) {
	cursor = strings.TrimSpace(cursor)
	if cursor == "" {
		return workflowRoleTaskViewCursor{}, invalidWorkflowRoleTaskViewCursorResult()
	}
	raw, err := base64.RawURLEncoding.DecodeString(cursor)
	if err != nil {
		return workflowRoleTaskViewCursor{}, invalidWorkflowRoleTaskViewCursorResult()
	}
	var decoded workflowRoleTaskViewCursor
	if err := json.Unmarshal(raw, &decoded); err != nil {
		return workflowRoleTaskViewCursor{}, invalidWorkflowRoleTaskViewCursorResult()
	}
	if !biz.ValidWorkflowTaskDiscoveryFilter(decoded.WorkflowTaskDiscoveryFilter) || decoded.Version != workflowRoleTaskViewCursorVersion ||
		!biz.ValidWorkflowRoleTaskListOptions(decoded.ViewKey, decoded.SortKey, decoded.StatusKey) ||
		!biz.ValidWorkflowTaskListFilters(decoded.Due, decoded.SourceType) ||
		((decoded.SortKey == biz.WorkflowRoleTaskSortNewest || decoded.SortKey == biz.WorkflowRoleTaskSortOldest) && decoded.BeforeTime == nil) ||
		(decoded.Method != "list_role_tasks" && decoded.Method != "list_workbench_role_tasks") ||
		decoded.BeforeID <= 0 ||
		decoded.SnapshotUnix <= 0 ||
		decoded.ViewKey == "" ||
		decoded.RoleKey == "" ||
		decoded.SeenTotal < 0 ||
		(decoded.Method == "list_role_tasks" && decoded.ExpectedTotal < 0) ||
		(decoded.Method == "list_workbench_role_tasks" && decoded.ExpectedTotal != -1) ||
		(decoded.RiskScope != workflowRoleTaskRiskScopeRole && decoded.RiskScope != workflowRoleTaskRiskScopeSupervised) {
		return workflowRoleTaskViewCursor{}, invalidWorkflowRoleTaskViewCursorResult()
	}
	return decoded, nil
}

func invalidWorkflowRoleTaskViewCursorResult() *v1.JsonrpcResult {
	return &v1.JsonrpcResult{Code: errcode.InvalidParam.Code, Message: "任务列表已更新，请重新加载"}
}

func (d *jsonrpcDispatcher) queryWorkflowRoleTaskView(
	ctx context.Context,
	request workflowRoleTaskViewRequest,
	visibilityScope *biz.WorkflowTaskVisibilityScope,
	approvalVisibilityScopes []biz.WorkflowApprovalVisibilityScope,
	includeCounts bool,
) *v1.JsonrpcResult {
	crossRoleRisk, permissionResult := d.AdminHasPermission(ctx, biz.PermissionWorkflowTaskSupervise)
	if permissionResult != nil {
		return permissionResult
	}
	if len(request.ReviewRoleKeys) > 0 {
		// A selected review role also scopes risk; it never changes the actor.
		crossRoleRisk = request.RoleKey == biz.MobileAllRolesKey
	}
	riskScope := workflowRoleTaskRiskScopeRole
	if crossRoleRisk {
		riskScope = workflowRoleTaskRiskScopeSupervised
	}
	if request.HasCursor && (request.CursorRiskScope != riskScope || request.CursorReviewScopeKey != request.ReviewScopeKey) {
		return invalidWorkflowRoleTaskViewCursorResult()
	}
	page, err := d.workflowUC.ListRoleTaskView(ctx, biz.WorkflowRoleTaskViewQuery{
		Calendar:                    request.Calendar,
		WorkflowTaskDiscoveryFilter: request.WorkflowTaskDiscoveryFilter,
		Keyword:                     request.Keyword,
		SortKey:                     request.SortKey,
		StatusKey:                   request.StatusKey,
		Due:                         request.Due, SourceType: request.SourceType,
		CompletedFrom:            request.CompletedFrom,
		CompletedBefore:          request.CompletedBefore,
		BeforeTime:               request.BeforeTime,
		ViewKey:                  request.ViewKey,
		RoleKey:                  request.RoleKey,
		ReviewRoleKeys:           request.ReviewRoleKeys,
		Limit:                    request.Limit,
		BeforeID:                 request.BeforeID,
		IncludeCounts:            includeCounts,
		CrossRoleRiskAllowed:     crossRoleRisk,
		SnapshotAt:               request.SnapshotAt,
		VisibilityScope:          visibilityScope,
		ApprovalVisibilityScopes: approvalVisibilityScopes,
	})
	if err != nil {
		return d.mapWorkflowError(ctx, err)
	}
	if page.Calendar != nil {
		return &v1.JsonrpcResult{Code: errcode.OK.Code, Message: errcode.OK.Message, Data: newDataStruct(workflowTaskCalendarToMap(page.Calendar))}
	}
	if includeCounts && (page.Counts == nil || !page.Counts.IsConserved()) {
		return &v1.JsonrpcResult{Code: errcode.Internal.Code, Message: errcode.Internal.Message}
	}
	expectedTotal := request.ExpectedTotal
	if includeCounts {
		var ok bool
		expectedTotal, ok = page.Counts.ViewTotal(request.ViewKey)
		if !ok {
			return &v1.JsonrpcResult{Code: errcode.Internal.Code, Message: errcode.Internal.Message}
		}
	}
	seenTotal := request.SeenTotal + len(page.Items)
	if request.Method == "list_role_tasks" &&
		(seenTotal > expectedTotal ||
			(page.HasMore && seenTotal >= expectedTotal) ||
			(!page.HasMore && seenTotal != expectedTotal)) {
		return invalidWorkflowRoleTaskViewCursorResult()
	}
	nextCursor := ""
	if page.HasMore && page.NextID > 0 {
		cursorExpectedTotal := expectedTotal
		if request.Method == "list_workbench_role_tasks" {
			cursorExpectedTotal = -1
		}
		nextCursor = encodeWorkflowRoleTaskViewCursor(workflowRoleTaskViewCursor{
			WorkflowTaskDiscoveryFilter: request.WorkflowTaskDiscoveryFilter,
			Keyword:                     request.Keyword,
			SortKey:                     request.SortKey,
			StatusKey:                   request.StatusKey,
			Due:                         request.Due, SourceType: request.SourceType,
			Period:         request.Period,
			DateFrom:       request.DateFrom,
			DateTo:         request.DateTo,
			BeforeTime:     page.NextTime,
			Method:         request.Method,
			ViewKey:        request.ViewKey,
			RoleKey:        request.RoleKey,
			BeforeID:       page.NextID,
			SnapshotUnix:   page.SnapshotAt.Unix(),
			ExpectedTotal:  cursorExpectedTotal,
			SeenTotal:      seenTotal,
			RiskScope:      riskScope,
			ReviewScopeKey: request.ReviewScopeKey,
		})
		if nextCursor == "" {
			return &v1.JsonrpcResult{Code: errcode.Internal.Code, Message: errcode.Internal.Message}
		}
	}
	data := map[string]any{
		"items":       workflowTasksToAny(page.Items),
		"next_cursor": nextCursor,
		"has_more":    page.HasMore,
		"server_time": page.SnapshotAt.Unix(),
	}
	if page.Counts != nil {
		data["status_counts"] = businessStatusCountsToAny(page.StatusCounts)
		data["counts"] = map[string]any{
			"ready":     page.Counts.Ready,
			"blocked":   page.Counts.Blocked,
			"todo":      page.Counts.Todo,
			"done":      page.Counts.Done,
			"rejected":  page.Counts.Rejected,
			"withdrawn": page.Counts.Withdrawn,
			"history":   page.Counts.History,
			"total":     page.Counts.Total,
			"approval":  page.Counts.Approval,
			"risk":      page.Counts.Risk,
			"overdue":   page.Counts.Overdue,
		}
		data["risk_scope"] = riskScope
	}
	return &v1.JsonrpcResult{
		Code:    errcode.OK.Code,
		Message: errcode.OK.Message,
		Data:    newDataStruct(data),
	}
}

func getWorkflowTaskDiscoveryFilter(pm map[string]any) (biz.WorkflowTaskDiscoveryFilter, *v1.JsonrpcResult) {
	f := biz.WorkflowTaskDiscoveryFilter{}
	for key, target := range map[string]*string{"module_key": &f.ModuleKey, "stage_key": &f.StageKey, "chain_key": &f.ChainKey, "assignee": &f.Assignee} {
		value, res := getOptionalWorkflowTaskBoardString(pm, key, 64)
		if res != nil {
			return f, res
		}
		*target = value
	}
	if !biz.ValidWorkflowTaskDiscoveryFilter(f) {
		return f, &v1.JsonrpcResult{Code: errcode.InvalidParam.Code, Message: "任务分类或办理人条件无效，请重新选择"}
	}
	return f, nil
}

func workflowTaskPeopleToAny(people []biz.WorkflowTaskPerson) []any {
	result := make([]any, 0, len(people))
	for _, person := range people {
		result = append(result, map[string]any{"id": person.ID, "name": person.Name})
	}
	return result
}
