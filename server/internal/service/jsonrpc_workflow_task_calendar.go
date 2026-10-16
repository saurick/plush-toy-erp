package service

import (
	v1 "server/api/jsonrpc/v1"
	"server/internal/biz"
	"server/internal/errcode"
)

func parseWorkflowTaskCalendar(pm map[string]any) (*biz.WorkflowTaskCalendarQuery, *v1.JsonrpcResult) {
	_, hasMonth := pm["calendar_month"]
	_, hasSelection := pm["calendar_selection"]
	_, hasOffset := pm["calendar_offset"]
	if !hasMonth && !hasSelection && !hasOffset {
		return nil, nil
	}
	invalid := &v1.JsonrpcResult{Code: errcode.InvalidParam.Code, Message: "待办日历日期无效，请重新选择"}
	month, monthOK := pm["calendar_month"].(string)
	selection, selectionOK := pm["calendar_selection"].(string)
	offset, offsetOK := getOptionalWorkflowTaskBoardInteger(pm, "calendar_offset", 0, 0)
	query := &biz.WorkflowTaskCalendarQuery{Month: month, Selection: selection, Offset: offset}
	if !monthOK || !selectionOK || !offsetOK {
		return nil, invalid
	}
	if _, _, err := query.Bounds(); err != nil {
		return nil, invalid
	}
	return query, nil
}

func workflowTaskCalendarToMap(calendar *biz.WorkflowTaskCalendar) map[string]any {
	days := make(map[string]any, len(calendar.Days))
	for day, count := range calendar.Days {
		days[day] = count
	}
	return map[string]any{"calendar": map[string]any{
		"month": calendar.Month, "selection": calendar.Selection, "days": days,
		"overdue": calendar.Overdue, "undated": calendar.Undated,
		"total": calendar.Total, "offset": calendar.Offset, "limit": calendar.Limit,
		"snapshot_at": calendar.SnapshotAt.Unix(), "items": workflowTasksToAny(calendar.Tasks),
	}}
}
