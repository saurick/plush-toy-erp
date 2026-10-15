package service

import (
	"context"

	v1 "server/api/jsonrpc/v1"
	"server/internal/biz"
)

// requireSourceActionReadPermissions applies the shared all-of source-read
// contract before a public handler reaches the source-derived write usecase.
// Missing contracts fail closed so a newly added source action cannot silently
// fall back to its target create/update permission.
func (d *jsonrpcDispatcher) requireSourceActionReadPermissions(
	ctx context.Context,
	domain string,
	method string,
	conditions ...string,
) *v1.JsonrpcResult {
	permissions, registered := biz.SourceActionReadPermissions(domain, method, conditions...)
	if !registered {
		return invalidParamResult()
	}
	for _, permission := range permissions {
		if res := d.RequireAdminPermission(ctx, permission); res != nil {
			return res
		}
	}
	return nil
}

func (d *jsonrpcDispatcher) requireAnySourceActionReadPermission(
	ctx context.Context,
	domain string,
	method string,
) *v1.JsonrpcResult {
	permissions, registered := biz.SourceActionReadPermissionCandidates(domain, method)
	if !registered || len(permissions) == 0 {
		return invalidParamResult()
	}
	return d.RequireAdminAnyPermission(ctx, permissions...)
}

// Runtime process commands authorize the customer-scoped action against the
// immutable revision captured by the process. Their source-read preflight uses
// the current administrator's RBAC upper bound so switching the active revision
// cannot strand an already-authorized in-flight process.
func (d *jsonrpcDispatcher) requireSourceActionRBACReadPermissions(
	ctx context.Context,
	domain string,
	method string,
) *v1.JsonrpcResult {
	permissions, registered := biz.SourceActionReadPermissions(domain, method)
	if !registered {
		return invalidParamResult()
	}
	for _, permission := range permissions {
		if res := d.RequireAdminRBACPermission(ctx, permission); res != nil {
			return res
		}
	}
	return nil
}

func productionOrderDraftSourceReadConditions(draft biz.ProductionOrderDraft) []string {
	hasSalesOrderItem := false
	hasBOMHeader := false
	for _, item := range draft.Items {
		hasSalesOrderItem = hasSalesOrderItem || item.SalesOrderItemID != nil
		hasBOMHeader = hasBOMHeader || item.BOMHeaderID != nil
	}
	conditions := make([]string, 0, 2)
	if hasSalesOrderItem {
		conditions = append(conditions, biz.SourceReadConditionProductionSalesOrderItem)
	}
	if hasBOMHeader {
		conditions = append(conditions, biz.SourceReadConditionProductionBOMHeader)
	}
	return conditions
}

func productionOrderReferenceSourceReadConditions(referenceType string) []string {
	switch referenceType {
	case biz.ProductionOrderReferenceSalesOrderItem:
		return []string{biz.SourceReadConditionProductionSalesOrderItem}
	case biz.ProductionOrderReferenceActiveBOM:
		return []string{biz.SourceReadConditionProductionBOMHeader}
	default:
		return nil
	}
}
