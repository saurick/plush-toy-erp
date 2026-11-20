package service

import (
	"context"
	"encoding/json"
	"errors"
	"math"

	v1 "server/api/jsonrpc/v1"
	"server/internal/biz"
	"server/internal/errcode"
)

func helpInteger(pm map[string]any, key string) (int, bool) {
	n, ok := pm[key].(float64)
	return int(n), ok && n >= 0 && n <= math.MaxInt32 && n == math.Trunc(n)
}
func helpString(pm map[string]any, key string) string { value, _ := pm[key].(string); return value }

func (d *jsonrpcDispatcher) helpContentResult(ctx context.Context, method string, pm map[string]any) *v1.JsonrpcResult {
	admin, res := d.CurrentAdmin(ctx)
	if res != nil {
		return res
	}
	allowed := []string{}
	switch method {
	case "help_chapter":
		allowed = []string{"document_id"}
	case "help_supplement_save":
		allowed = []string{"document_id", "expected_version", "markdown", "summary"}
	case "help_supplement_publish":
		allowed = []string{"document_id", "expected_version", "summary"}
	case "help_supplement_restore":
		allowed = []string{"document_id", "expected_version", "restore_version", "summary"}
	case "help_feedback_create":
		allowed = []string{"document_id", "source_hash", "published_version", "quote", "message", "request_key"}
	case "help_feedback_respond":
		allowed = []string{"document_id", "feedback_id", "response"}
	}
	if res := rejectUnknownAdminParams(pm, allowed...); res != nil {
		return res
	}
	for _, key := range allowed {
		if key == "expected_version" || key == "restore_version" || key == "published_version" || key == "feedback_id" {
			continue
		}
		if _, ok := pm[key].(string); !ok {
			return &v1.JsonrpcResult{Code: errcode.InvalidParam.Code, Message: "请填写完整内容后重试"}
		}
	}
	if d.helpContentUC == nil {
		return &v1.JsonrpcResult{Code: errcode.Internal.Code, Message: "帮助内容维护暂不可用，请稍后重试"}
	}
	id := helpString(pm, "document_id")
	var value any
	var err error
	switch method {
	case "help_content":
		value, err = d.helpContentUC.Read(ctx, admin)
	case "help_chapter":
		value, err = d.helpContentUC.Chapter(ctx, admin, id)
	case "help_supplement_save", "help_supplement_publish", "help_supplement_restore":
		version, ok := helpInteger(pm, "expected_version")
		if !ok {
			err = biz.ErrBadParam
			break
		}
		action := "save"
		restore := 0
		if method == "help_supplement_publish" {
			action = "publish"
		}
		if method == "help_supplement_restore" {
			action = "restore"
			var ok bool
			restore, ok = helpInteger(pm, "restore_version")
			if !ok {
				err = biz.ErrBadParam
				break
			}
		}
		value, err = d.helpContentUC.Write(ctx, admin, id, action, version, helpString(pm, "markdown"), helpString(pm, "summary"), restore)
	case "help_feedback_create":
		version, ok := helpInteger(pm, "published_version")
		if !ok {
			err = biz.ErrBadParam
			break
		}
		value, err = d.helpContentUC.Feedback(ctx, admin, id, helpString(pm, "source_hash"), helpString(pm, "quote"), helpString(pm, "message"), helpString(pm, "request_key"), version)
	case "help_feedback_respond":
		feedbackID, ok := helpInteger(pm, "feedback_id")
		if !ok {
			err = biz.ErrBadParam
			break
		}
		err = d.helpContentUC.Respond(ctx, admin, id, feedbackID, helpString(pm, "response"))
		value = map[string]any{"saved": true}
	}
	if err != nil {
		if errors.Is(err, biz.ErrForbidden) {
			return &v1.JsonrpcResult{Code: errcode.PermissionDenied.Code, Message: "当前账号不能读取或维护这部分帮助内容"}
		}
		if errors.Is(err, biz.ErrBadParam) {
			return &v1.JsonrpcResult{Code: errcode.InvalidParam.Code, Message: "请核对内容长度、修改说明和所选版本"}
		}
		if errors.Is(err, biz.ErrHelpContentConflict) {
			return &v1.JsonrpcResult{Code: errcode.ResourceVersionConflict.Code, Message: "内容已被更新。请保留当前输入，重新读取后核对再保存"}
		}
		d.log.WithContext(ctx).Errorf("help content operation failed method=%s actor=%d err=%v", method, admin.ID, err)
		return &v1.JsonrpcResult{Code: errcode.Internal.Code, Message: "帮助内容暂时无法保存或读取，请稍后重试"}
	}
	if method != "help_content" && method != "help_chapter" {
		d.log.WithContext(ctx).Infof("help content operation completed method=%s actor=%d document=%s", method, admin.ID, id)
	}
	encoded, err := json.Marshal(value)
	if err != nil {
		return &v1.JsonrpcResult{Code: errcode.Internal.Code, Message: errcode.Internal.Message}
	}
	data := map[string]any{}
	if err := json.Unmarshal(encoded, &data); err != nil {
		return &v1.JsonrpcResult{Code: errcode.Internal.Code, Message: errcode.Internal.Message}
	}
	return &v1.JsonrpcResult{Code: 0, Message: "OK", Data: newDataStruct(data)}
}
