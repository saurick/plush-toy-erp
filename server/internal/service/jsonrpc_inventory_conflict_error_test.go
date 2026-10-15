package service

import (
	"context"
	"fmt"
	"io"
	"testing"

	v1 "server/api/jsonrpc/v1"
	"server/internal/biz"
	"server/internal/errcode"

	"github.com/go-kratos/kratos/v2/log"
)

func TestInventoryConflictErrorsKeepPublicMessages(t *testing.T) {
	d := &jsonrpcDispatcher{log: log.NewHelper(log.NewStdLogger(io.Discard))}
	tests := []struct {
		name     string
		conflict error
		mapError func(context.Context, error) *v1.JsonrpcResult
		message  string
	}{
		{"bom", biz.ErrBOMRecordConflict, d.mapBOMError, "同一产品的 BOM 版本不能重复，且最多只能有一个激活版本"},
		{"purchase", biz.ErrPurchaseRecordConflict, d.mapPurchaseError, "采购入库、退货或调整单号及行号已存在"},
		{"quality", biz.ErrQualityInspectionRecordConflict, d.mapQualityError, "质检单号或待检批次已存在"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := tt.mapError(t.Context(), fmt.Errorf("save record: %w", tt.conflict))
			if result.Code != errcode.InvalidParam.Code || result.Message != tt.message {
				t.Fatalf("unexpected public error: %+v", result)
			}
		})
	}
}
