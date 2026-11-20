package service

import (
	"fmt"
	"testing"

	"server/internal/biz"

	"google.golang.org/protobuf/types/known/structpb"
)

func sourceOrderLifecycleTestParams(
	t *testing.T,
	id int,
	version int,
	action string,
) *structpb.Struct {
	t.Helper()
	params := map[string]any{
		"id":               float64(id),
		"expected_version": float64(version),
		"idempotency_key":  fmt.Sprintf("test/%s/%d/v%d", action, id, version),
	}
	switch action {
	case biz.SourceOrderActionClose:
		params["close_mode"] = biz.SourceOrderCloseModeNormal
	case biz.SourceOrderActionCancel:
		params["reason"] = "测试取消原因"
	}
	return mustJSONRPCStruct(t, params)
}
