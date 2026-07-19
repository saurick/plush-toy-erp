package service

import (
	"context"
	"io"
	"testing"

	"server/internal/biz"

	"github.com/go-kratos/kratos/v2/log"
)

func TestSourceDocumentSettlementErrorsUseBusinessMessages(t *testing.T) {
	d := &jsonrpcDispatcher{log: log.NewHelper(log.With(log.NewStdLogger(io.Discard), "module", "source-document-settlement-test"))}
	tests := []struct {
		name string
		err  error
		mapf func(context.Context, error) string
		want string
	}{
		{name: "sales shipment", err: biz.ErrSalesOrderCancellationShipmentDependency, mapf: func(ctx context.Context, err error) string { return d.mapSalesOrderError(ctx, err).Message }, want: "销售订单已有未取消的出货单，不能取消"},
		{name: "sales reservation", err: biz.ErrSalesOrderCancellationReservationDependency, mapf: func(ctx context.Context, err error) string { return d.mapSalesOrderError(ctx, err).Message }, want: "销售订单仍有生效库存预留，请先释放后再取消"},
		{name: "sales production", err: biz.ErrSalesOrderCancellationProductionDependency, mapf: func(ctx context.Context, err error) string { return d.mapSalesOrderError(ctx, err).Message }, want: "销售订单已有未取消的生产订单，不能取消"},
		{name: "sales process", err: biz.ErrSalesOrderCancellationProcessDependency, mapf: func(ctx context.Context, err error) string { return d.mapSalesOrderError(ctx, err).Message }, want: "销售订单仍有进行中的审批流程，不能取消"},
		{name: "purchase draft receipt", err: biz.ErrPurchaseOrderCloseDraftReceiptDependency, mapf: func(ctx context.Context, err error) string { return d.mapPurchaseOrderError(ctx, err).Message }, want: "采购订单存在待入账的入库草稿，不能关闭"},
		{name: "purchase receipt", err: biz.ErrPurchaseOrderCancelReceiptDependency, mapf: func(ctx context.Context, err error) string { return d.mapPurchaseOrderError(ctx, err).Message }, want: "采购订单已生成未取消的入库单，不能取消"},
		{name: "purchase process", err: biz.ErrPurchaseOrderLifecycleProcessDependency, mapf: func(ctx context.Context, err error) string { return d.mapPurchaseOrderError(ctx, err).Message }, want: "采购订单仍有进行中的备料流程，不能关闭或取消"},
		{name: "purchase receipt correction", err: biz.ErrPurchaseReceiptCorrectionDependency, mapf: func(ctx context.Context, err error) string { return d.mapPurchaseError(ctx, err).Message }, want: "采购入库仍有未取消的退货或调整单，不能取消"},
		{name: "production fact", err: biz.ErrProductionOrderFactDependency, mapf: func(ctx context.Context, err error) string { return d.mapProductionOrderError(ctx, err).Message }, want: "生产订单仍有未过账或未取消的领料、完工或返工记录，请先处理后再关闭或取消"},
		{name: "outsourcing fact", err: biz.ErrOutsourcingOrderFactDependency, mapf: func(ctx context.Context, err error) string { return d.mapOutsourcingOrderError(ctx, err).Message }, want: "委外合同仍有未结清的发料或回货记录；关闭前请完成或取消草稿，取消合同前请先取消或冲正相关记录"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := tt.mapf(context.Background(), tt.err); got != tt.want {
				t.Fatalf("message = %q, want %q", got, tt.want)
			}
		})
	}
}
