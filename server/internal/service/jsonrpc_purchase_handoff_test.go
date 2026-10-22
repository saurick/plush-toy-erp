package service

import (
	"context"
	"strings"
	"testing"

	"github.com/go-kratos/kratos/v2/log"

	"server/internal/biz"
	"server/internal/errcode"
)

func TestPurchaseRejectionCancellationReportsEndedSourceOrder(t *testing.T) {
	d := &jsonrpcDispatcher{log: log.NewHelper(log.DefaultLogger)}
	result := d.purchaseErrorResult(context.Background(), biz.ErrPurchaseRejectionCancelOrderState)
	if result.Code != errcode.BusinessRuleViolation.Code || !strings.Contains(result.Message, "来源采购单") || !strings.Contains(result.Message, "不能撤销拒收处置") {
		t.Fatalf("source-order guard error=%+v", result)
	}
}
