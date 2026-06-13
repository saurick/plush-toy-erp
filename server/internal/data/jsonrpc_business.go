package data

import (
	"context"
	"fmt"

	v1 "server/api/jsonrpc/v1"
	"server/internal/biz"
	"server/internal/errcode"

	"google.golang.org/protobuf/types/known/structpb"
)

func (d *JsonrpcData) handleBusiness(
	ctx context.Context,
	method, id string,
	_ *structpb.Struct,
) (string, *v1.JsonrpcResult, error) {
	l := d.log.WithContext(ctx)

	if _, res := d.requireAdmin(ctx); res != nil {
		l.Warnf("[business] requireAdmin denied method=%s id=%s code=%d msg=%s", method, id, res.Code, res.Message)
		return id, res, nil
	}

	switch method {
	case "dashboard_stats":
		if res := d.RequireAdminPermission(ctx, biz.PermissionERPDashboardRead); res != nil {
			return id, res, nil
		}
		stats, err := d.businessDashboardProjectionStats(ctx)
		if err != nil {
			l.Errorf("[business] dashboard stats projection failed err=%v", err)
			return id, &v1.JsonrpcResult{Code: errcode.Internal.Code, Message: errcode.Internal.Message}, nil
		}
		modules := make([]any, 0, len(stats))
		for _, item := range stats {
			statusCounts := make(map[string]any, len(item.StatusCounts))
			for statusKey, count := range item.StatusCounts {
				statusCounts[statusKey] = count
			}
			modules = append(modules, map[string]any{
				"module_key":    item.ModuleKey,
				"total":         item.TotalRecords,
				"status_counts": statusCounts,
			})
		}
		return id, &v1.JsonrpcResult{
			Code:    errcode.OK.Code,
			Message: errcode.OK.Message,
			Data: newDataStruct(map[string]any{
				"modules": modules,
			}),
		}, nil

	default:
		return id, &v1.JsonrpcResult{
			Code:    errcode.UnknownMethod.Code,
			Message: fmt.Sprintf("未知 business 接口 method=%s", method),
		}, nil
	}
}

var businessDashboardProjectionModuleKeys = []string{
	"customers",
	"suppliers",
	"products",
	"sales-orders",
	"material-bom",
	"accessories-purchase",
	"processing-contracts",
	"inbound",
	"inventory",
	"shipping-release",
	"outbound",
	"production-scheduling",
	"production-progress",
	"production-exceptions",
	"quality-inspections",
	"reconciliation",
	"payables",
	"receivables",
	"invoices",
}

func (d *JsonrpcData) businessDashboardProjectionStats(ctx context.Context) ([]biz.BusinessDashboardModuleStats, error) {
	statsByModule := make(map[string]*biz.BusinessDashboardModuleStats, len(businessDashboardProjectionModuleKeys))
	for _, moduleKey := range businessDashboardProjectionModuleKeys {
		statsByModule[moduleKey] = &biz.BusinessDashboardModuleStats{
			ModuleKey:    moduleKey,
			StatusCounts: map[string]int{},
		}
	}
	setTotal := func(moduleKey string, total int) {
		if stats, ok := statsByModule[moduleKey]; ok && total > 0 {
			stats.TotalRecords = total
		}
	}

	if d.masterDataUC != nil {
		if _, total, err := d.masterDataUC.ListCustomers(ctx, biz.MasterDataFilter{Limit: 1}); err != nil {
			return nil, err
		} else {
			setTotal("customers", total)
		}
		if _, total, err := d.masterDataUC.ListSuppliers(ctx, biz.MasterDataFilter{Limit: 1}); err != nil {
			return nil, err
		} else {
			setTotal("suppliers", total)
		}
	}

	if d.salesOrderUC != nil {
		if _, total, err := d.salesOrderUC.ListSalesOrders(ctx, biz.SalesOrderFilter{Limit: 1}); err != nil {
			return nil, err
		} else {
			setTotal("sales-orders", total)
		}
	}

	if d.inventoryUC != nil {
		if _, total, err := d.inventoryUC.ListPurchaseReceipts(ctx, biz.PurchaseReceiptFilter{Limit: 1}); err != nil {
			return nil, err
		} else {
			setTotal("inbound", total)
		}
		for _, status := range []string{
			biz.PurchaseReceiptStatusDraft,
			biz.PurchaseReceiptStatusPosted,
			biz.PurchaseReceiptStatusCancelled,
		} {
			if _, total, err := d.inventoryUC.ListPurchaseReceipts(ctx, biz.PurchaseReceiptFilter{Status: status, Limit: 1}); err != nil {
				return nil, err
			} else if total > 0 {
				statsByModule["inbound"].StatusCounts[status] = total
			}
		}
	}

	if d.phase8UC != nil {
		if _, total, err := d.phase8UC.ListOutsourcingFacts(ctx, biz.Phase8Filter{Limit: 1}); err != nil {
			return nil, err
		} else {
			setTotal("processing-contracts", total)
		}
		if _, total, err := d.phase8UC.ListStockReservations(ctx, biz.Phase8Filter{Limit: 1}); err != nil {
			return nil, err
		} else {
			setTotal("inventory", total)
		}
		if _, total, err := d.phase8UC.ListShipments(ctx, biz.Phase8Filter{Limit: 1}); err != nil {
			return nil, err
		} else {
			setTotal("outbound", total)
		}
		if _, total, err := d.phase8UC.ListProductionFacts(ctx, biz.Phase8Filter{Limit: 1}); err != nil {
			return nil, err
		} else {
			setTotal("production-progress", total)
		}
		if _, total, err := d.phase8UC.ListFinanceFacts(ctx, biz.Phase8Filter{Limit: 1}); err != nil {
			return nil, err
		} else {
			setTotal("reconciliation", total)
		}
	}

	out := make([]biz.BusinessDashboardModuleStats, 0, len(businessDashboardProjectionModuleKeys))
	for _, moduleKey := range businessDashboardProjectionModuleKeys {
		stats := statsByModule[moduleKey]
		out = append(out, biz.BusinessDashboardModuleStats{
			ModuleKey:    stats.ModuleKey,
			TotalRecords: stats.TotalRecords,
			StatusCounts: stats.StatusCounts,
		})
	}
	return out, nil
}
