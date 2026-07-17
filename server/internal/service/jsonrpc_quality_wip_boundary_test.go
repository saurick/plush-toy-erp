package service

import (
	"context"
	"io"
	"testing"

	"server/internal/biz"
	"server/internal/errcode"

	"github.com/go-kratos/kratos/v2/log"
)

func TestMapQualityErrorUsesReadableProductionWIPBoundaries(t *testing.T) {
	dispatcher := &jsonrpcDispatcher{log: log.NewHelper(log.NewStdLogger(io.Discard))}
	for _, test := range []struct {
		err     error
		message string
	}{
		{biz.ErrProductionWIPInvalidRoute, "生产路线或质量关口不完整，请刷新生产订单后核对"},
		{biz.ErrProductionWIPInvalidTransition, "当前在制批次状态已变化，不能重复办理该质量关口，请刷新后重试"},
		{biz.ErrProductionWIPQualityGateIncomplete, "前置质量关口尚未通过，不能越级办理当前检验"},
	} {
		result := dispatcher.mapQualityError(context.Background(), test.err)
		if result.Code != errcode.InvalidParam.Code || result.Message != test.message {
			t.Fatalf("error %v result = %#v", test.err, result)
		}
	}
}
