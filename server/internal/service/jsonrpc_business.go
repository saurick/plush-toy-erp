package service

import (
	"context"
	"fmt"

	v1 "server/api/jsonrpc/v1"
	"server/internal/biz"
	"server/internal/errcode"

	"google.golang.org/protobuf/types/known/structpb"
)

func (d *jsonrpcDispatcher) handleBusiness(
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
		admin, res := d.CurrentAdmin(ctx)
		if res != nil {
			return id, res, nil
		}
		permissions, res := d.CurrentAdminPermissions(ctx)
		if res != nil {
			return id, res, nil
		}
		stats, err := d.businessDashboardProjectionStats(
			ctx,
			admin,
			biz.PermissionSetHasAny(biz.PermissionKeySet(permissions), biz.PermissionWorkflowTaskRead),
		)
		if err != nil {
			l.Errorf("[business] dashboard stats projection failed err=%v", err)
			return id, &v1.JsonrpcResult{Code: errcode.Internal.Code, Message: errcode.Internal.Message}, nil
		}
		modules := make([]any, 0, len(stats))
		for _, item := range stats {
			modules = append(modules, map[string]any{
				"module_key": item.ModuleKey,
				"available":  item.Available,
				"total":      item.TotalRecords,
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
	"production-orders",
	"production-scheduling",
	"production-progress",
	"production-exceptions",
	"quality-inspections",
	"reconciliation",
	"payables",
	"receivables",
	"invoices",
}

func (d *jsonrpcDispatcher) businessDashboardProjectionStats(
	ctx context.Context,
	admin *biz.AdminUser,
	canReadWorkflowTasks bool,
) ([]biz.BusinessDashboardModuleStats, error) {
	statsByModule := make(map[string]*biz.BusinessDashboardModuleStats, len(businessDashboardProjectionModuleKeys))
	for _, moduleKey := range businessDashboardProjectionModuleKeys {
		statsByModule[moduleKey] = &biz.BusinessDashboardModuleStats{
			ModuleKey: moduleKey,
		}
	}
	setAvailableTotal := func(moduleKey string, total int) {
		if stats, ok := statsByModule[moduleKey]; ok {
			stats.Available = true
			stats.TotalRecords = total
		}
	}

	if d.masterDataUC != nil {
		if _, total, err := d.masterDataUC.ListCustomers(ctx, biz.MasterDataFilter{Limit: 1}); err != nil {
			return nil, err
		} else {
			setAvailableTotal("customers", total)
		}
		if _, total, err := d.masterDataUC.ListSuppliers(ctx, biz.MasterDataFilter{Limit: 1}); err != nil {
			return nil, err
		} else {
			setAvailableTotal("suppliers", total)
		}
		if _, total, err := d.masterDataUC.ListProducts(ctx, biz.MasterDataFilter{Limit: 1}); err != nil {
			return nil, err
		} else {
			setAvailableTotal("products", total)
		}
	}

	if d.salesOrderUC != nil {
		if _, total, err := d.salesOrderUC.ListSalesOrders(ctx, biz.SalesOrderFilter{Limit: 1}); err != nil {
			return nil, err
		} else {
			setAvailableTotal("sales-orders", total)
		}
	}

	if d.purchaseOrderUC != nil {
		if _, total, err := d.purchaseOrderUC.ListPurchaseOrders(ctx, biz.PurchaseOrderFilter{Limit: 1}); err != nil {
			return nil, err
		} else {
			setAvailableTotal("accessories-purchase", total)
		}
	}

	if d.outsourcingOrderUC != nil {
		if _, total, err := d.outsourcingOrderUC.ListOutsourcingOrders(ctx, biz.OutsourcingOrderFilter{Limit: 1}); err != nil {
			return nil, err
		} else {
			setAvailableTotal("processing-contracts", total)
		}
	}

	if d.inventoryUC != nil {
		if _, total, err := d.inventoryUC.ListBOMHeaders(ctx, biz.BOMHeaderFilter{Limit: 1}); err != nil {
			return nil, err
		} else {
			setAvailableTotal("material-bom", total)
		}
		if _, total, err := d.inventoryUC.ListPurchaseReceipts(ctx, biz.PurchaseReceiptFilter{Limit: 1}); err != nil {
			return nil, err
		} else {
			setAvailableTotal("inbound", total)
		}
		if _, total, err := d.inventoryUC.ListInventoryBalances(ctx, biz.InventoryBalanceFilter{Limit: 1}); err != nil {
			return nil, err
		} else {
			setAvailableTotal("inventory", total)
		}
		if _, total, err := d.inventoryUC.ListQualityInspections(ctx, biz.QualityInspectionFilter{Limit: 1}); err != nil {
			return nil, err
		} else {
			setAvailableTotal("quality-inspections", total)
		}
	}

	if d.operationalFactUC != nil {
		if _, total, err := d.operationalFactUC.ListShipments(ctx, biz.OperationalFactFilter{Limit: 1}); err != nil {
			return nil, err
		} else {
			setAvailableTotal("outbound", total)
		}
		if _, total, err := d.operationalFactUC.ListProductionFacts(ctx, biz.OperationalFactFilter{Limit: 1}); err != nil {
			return nil, err
		} else {
			setAvailableTotal("production-progress", total)
		}
		for _, financeModule := range []struct {
			moduleKey string
			factType  string
		}{
			{moduleKey: "reconciliation", factType: biz.FinanceFactReconciliation},
			{moduleKey: "payables", factType: biz.FinanceFactPayable},
			{moduleKey: "receivables", factType: biz.FinanceFactReceivable},
			{moduleKey: "invoices", factType: biz.FinanceFactInvoice},
		} {
			if _, total, err := d.operationalFactUC.ListFinanceFacts(ctx, biz.OperationalFactFilter{FactType: financeModule.factType, Limit: 1}); err != nil {
				return nil, err
			} else {
				setAvailableTotal(financeModule.moduleKey, total)
			}
		}
	}

	if d.productionOrderUC != nil {
		if _, total, err := d.productionOrderUC.List(ctx, biz.ProductionOrderFilter{Limit: 1}); err != nil {
			return nil, err
		} else {
			setAvailableTotal("production-orders", total)
		}
	}

	if d.workflowUC != nil && canReadWorkflowTasks {
		visibilityScope, err := d.workflowTaskQueryVisibilityScope(ctx, admin, biz.PermissionWorkflowTaskRead)
		if err != nil {
			return nil, err
		}
		visibilityScope = businessDashboardWorkflowAggregationScope(admin, visibilityScope)
		for _, workflowModule := range []struct {
			moduleKey string
			taskGroup string
		}{
			{moduleKey: "shipping-release", taskGroup: "shipment_release"},
			{moduleKey: "production-scheduling", taskGroup: "production_scheduling"},
			{moduleKey: "production-exceptions", taskGroup: "production_exception"},
		} {
			if _, total, err := d.workflowUC.ListTasks(ctx, biz.WorkflowTaskFilter{
				Limit:           1,
				TaskGroup:       workflowModule.taskGroup,
				VisibilityScope: visibilityScope,
			}); err != nil {
				return nil, err
			} else {
				setAvailableTotal(workflowModule.moduleKey, total)
			}
		}
	}

	out := make([]biz.BusinessDashboardModuleStats, 0, len(businessDashboardProjectionModuleKeys))
	for _, moduleKey := range businessDashboardProjectionModuleKeys {
		stats := statsByModule[moduleKey]
		out = append(out, biz.BusinessDashboardModuleStats{
			ModuleKey:    stats.ModuleKey,
			Available:    stats.Available,
			TotalRecords: stats.TotalRecords,
		})
	}
	return out, nil
}

// businessDashboardWorkflowAggregationScope broadens only the count queries
// used by the management overview. A boss can see company-wide workflow
// totals without receiving list, detail, assignment or mutation access to
// another role's tasks; those endpoints continue to use the ordinary
// revision-aware visibility scope.
func businessDashboardWorkflowAggregationScope(
	admin *biz.AdminUser,
	scope *biz.WorkflowTaskVisibilityScope,
) *biz.WorkflowTaskVisibilityScope {
	normalized := biz.NormalizeWorkflowTaskVisibilityScope(scope)
	if normalized == nil || admin == nil || admin.Disabled ||
		(!admin.IsSuperAdmin && !biz.AdminHasRole(admin, biz.BossRoleKey)) {
		return normalized
	}
	normalized.StandaloneAllowAllOwnerRoles = true
	normalized.StandaloneVisibleOwnerRoleKeys = nil
	normalized.VisibleAssigneeID = nil
	for index := range normalized.RevisionRoleScopes {
		normalized.RevisionRoleScopes[index].AllowAllOwnerRoles = true
		normalized.RevisionRoleScopes[index].VisibleOwnerRoleKeys = nil
	}
	return biz.NormalizeWorkflowTaskVisibilityScope(normalized)
}
