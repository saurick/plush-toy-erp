package service

import (
	"context"
	"errors"
	"fmt"
	"io"
	"strings"
	"testing"

	v1 "server/api/jsonrpc/v1"
	"server/internal/biz"
	"server/internal/errcode"

	"github.com/go-kratos/kratos/v2/log"
)

func TestProcessEntryBusinessErrorsKeepActionableGuidance(t *testing.T) {
	d := &jsonrpcDispatcher{log: log.NewHelper(log.NewStdLogger(io.Discard))}
	cases := []struct {
		name string
		err  error
		code int32
		text string
	}{
		{"sales terms", &biz.SalesOrderReadinessError{MissingFields: []string{"tax_mode", "freight_terms"}}, errcode.InvalidParam.Code, "提交前请补齐：计税方式、报价是否含运费"},
		{"tax rate", &biz.SalesOrderReadinessError{MissingFields: []string{"tax_rate"}}, errcode.InvalidParam.Code, "提交前请补齐：税率"},
		{"freight quote", &biz.SalesOrderReadinessError{MissingFields: []string{"quoted_freight_amount"}}, errcode.InvalidParam.Code, "提交前请补齐：报价运费"},
		{"no items", &biz.SalesOrderReadinessError{MissingFields: []string{"items"}}, errcode.InvalidParam.Code, "提交前请补齐：订货明细"},
		{"missing totals", &biz.SalesOrderReadinessError{MissingFields: []string{"amounts"}}, errcode.InvalidParam.Code, "订单金额尚未完整计算"},
		{"missing unit price", biz.ErrSalesOrderItemPriceMissing, errcode.InvalidParam.Code, "未填写单价"},
		{"tax pricing without rate", biz.ErrSalesOrderTaxRateRequired, errcode.InvalidParam.Code, "请同时填写税率"},
		{"sales version", biz.ErrSalesOrderConflict, errcode.ResourceVersionConflict.Code, errcode.ResourceVersionConflict.Message},
		{"purchase version", biz.ErrPurchaseOrderConflict, errcode.ResourceVersionConflict.Code, errcode.ResourceVersionConflict.Message},
		{"supplier inactive", biz.ErrSupplierInactive, errcode.InvalidParam.Code, "已停用"},
		{"receipt quality rejected", biz.ErrPurchaseReceiptQualityRejected, errcode.InvalidParam.Code, "拒收行"},
		{"receipt version", biz.ErrPurchaseRecordConflict, errcode.InvalidParam.Code, "已存在"},
		{"quality source", biz.ErrQualityInspectionSourceInvalid, errcode.InvalidParam.Code, "质检来源"},
		{"shipment quantity", biz.ErrShipmentQuantityExceeded, errcode.InvalidParam.Code, "剩余可出货数量"},
		{"shipment release", biz.ErrShipmentFinanceReleaseRequired, errcode.InvalidParam.Code, "财务审批尚未通过"},
		{"stock shortage", biz.ErrInventoryInsufficientStock, errcode.InvalidParam.Code, "库存不足"},
		{"stock self approval", biz.ErrInventoryOperationSelfApproval, errcode.PermissionDenied.Code, "另一位"},
		{"production source", biz.ErrProductionExceptionSourceInvalid, errcode.InvalidParam.Code, "来源"},
		{"finance payment term", biz.ErrFinanceFactPaymentTermMissing, errcode.InvalidParam.Code, "账期天数"},
		{"finance invoice category", biz.ErrFinanceFactInvoiceCategoryMissing, errcode.InvalidParam.Code, "发票类别"},
		{"outsourcing terms", biz.ErrOutsourcingOrderIncomplete, errcode.InvalidParam.Code, "加工合同信息不完整"},
		{"quantity precision", &biz.UnitQuantityError{Precision: 0}, errcode.InvalidParam.Code, "整数数量"},
		{"forbidden", biz.ErrForbidden, errcode.PermissionDenied.Code, errcode.PermissionDenied.Message},
		{"no permission", biz.ErrNoPermission, errcode.PermissionDenied.Code, errcode.PermissionDenied.Message},
		{"data scope", biz.ErrDataScopeForbidden, errcode.PermissionDenied.Code, errcode.PermissionDenied.Message},
		{"recovery", biz.ErrProcessDomainCommandRecoveryRequired, errcode.ProcessDomainCommandRecoveryRequired.Code, errcode.ProcessDomainCommandRecoveryRequired.Message},
		{"unknown", errors.New("database connection failed: private diagnostic"), errcode.Internal.Code, errcode.Internal.Message},
		{"same text is not a domain error", errors.New(biz.ErrSalesOrderCommercialTermsIncomplete.Error()), errcode.Internal.Code, errcode.Internal.Message},
	}
	for name, entry := range map[string]func(context.Context, error) *v1.JsonrpcResult{
		"customer process": d.mapCustomerConfigError,
		"workflow task":    d.mapWorkflowError,
	} {
		t.Run(name, func(t *testing.T) {
			for _, tc := range cases {
				t.Run(tc.name, func(t *testing.T) {
					for _, err := range []error{tc.err, fmt.Errorf("linked command: %w", tc.err)} {
						result := entry(context.Background(), err)
						if result.Code != tc.code || !strings.Contains(result.Message, tc.text) {
							t.Fatalf("code=%d message=%q; want code=%d containing %q", result.Code, result.Message, tc.code, tc.text)
						}
						if strings.Contains(result.Message, "private diagnostic") || strings.Contains(result.Message, "tax_mode") {
							t.Fatalf("internal details exposed: %q", result.Message)
						}
					}
				})
			}
		})
	}
}

func TestSalesOrderReadinessGuidanceIsSharedByDirectAndProcessEntries(t *testing.T) {
	d := &jsonrpcDispatcher{log: log.NewHelper(log.NewStdLogger(io.Discard))}
	err := &biz.SalesOrderReadinessError{MissingFields: []string{"tax_rate", "quoted_freight_amount"}}
	direct := d.mapSalesOrderError(context.Background(), err)
	for _, entry := range []func(context.Context, error) *v1.JsonrpcResult{d.mapCustomerConfigError, d.mapWorkflowError} {
		got := entry(context.Background(), err)
		if got.Code != direct.Code || got.Message != direct.Message {
			t.Fatalf("submission guidance differs: direct=%v process=%v", direct, got)
		}
	}
}
