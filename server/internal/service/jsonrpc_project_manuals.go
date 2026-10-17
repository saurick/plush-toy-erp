package service

import (
	"context"

	v1 "server/api/jsonrpc/v1"
	"server/internal/errcode"
	"server/internal/projectmanuals"
)

func (d *jsonrpcDispatcher) projectManualsResult(ctx context.Context) *v1.JsonrpcResult {
	admin, result := d.CurrentAdmin(ctx)
	if result != nil {
		return result
	}
	manuals, err := projectmanuals.Visible(admin)
	if err != nil {
		d.log.WithContext(ctx).Errorf("project handbooks unavailable: %v", err)
		return &v1.JsonrpcResult{Code: errcode.Internal.Code, Message: "项目手册暂时无法读取，请稍后重试"}
	}
	items := make([]any, 0, len(manuals))
	for _, manual := range manuals {
		items = append(items, map[string]any{
			"key": manual.Key, "title": manual.Title, "summary": manual.Summary,
			"markdown": manual.Markdown, "source_hash": manual.SourceHash,
		})
	}
	return &v1.JsonrpcResult{
		Code: errcode.OK.Code, Message: errcode.OK.Message,
		Data: newDataStruct(map[string]any{"manuals": items}),
	}
}
