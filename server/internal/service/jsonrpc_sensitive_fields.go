package service

import (
	"context"
	"strings"

	v1 "server/api/jsonrpc/v1"
	"server/internal/biz"
)

type sensitiveFieldReadPolicy struct {
	partyPrivate          bool
	salesCommercial       bool
	procurementCommercial bool
	financeSettlement     bool
}

func (d *jsonrpcDispatcher) requireSensitiveFieldMutationPermission(
	ctx context.Context,
	url, method string,
) *v1.JsonrpcResult {
	normalizedMethod := strings.ToLower(strings.TrimSpace(method))
	if !strings.HasPrefix(normalizedMethod, "create_") &&
		!strings.HasPrefix(normalizedMethod, "save_") &&
		!strings.HasPrefix(normalizedMethod, "update_") {
		return nil
	}
	permissionKey := ""
	switch strings.TrimSpace(url) {
	case "masterdata":
		if strings.Contains(normalizedMethod, "customer") ||
			strings.Contains(normalizedMethod, "supplier") ||
			strings.Contains(normalizedMethod, "contact") {
			permissionKey = biz.PermissionFieldPartyPrivateRead
		}
	case "sales_order":
		permissionKey = biz.PermissionFieldSalesCommercialRead
	case "purchase_order", "purchase", "outsourcing_order":
		permissionKey = biz.PermissionFieldProcurementCommercialRead
	case "operational_fact":
		switch {
		case strings.Contains(normalizedMethod, "receivable"), strings.Contains(normalizedMethod, "shipment"):
			permissionKey = biz.PermissionFieldSalesCommercialRead
		case strings.Contains(normalizedMethod, "payable"), strings.Contains(normalizedMethod, "purchase"), strings.Contains(normalizedMethod, "outsourcing"):
			permissionKey = biz.PermissionFieldProcurementCommercialRead
		case strings.Contains(normalizedMethod, "invoice"), strings.Contains(normalizedMethod, "reconciliation"), strings.Contains(normalizedMethod, "finance"):
			permissionKey = biz.PermissionFieldFinanceSettlementRead
		}
	}
	if permissionKey == "" {
		return nil
	}
	return d.RequireAdminPermission(ctx, permissionKey)
}

var partyPrivateFieldKeys = map[string]struct{}{
	"address": {}, "bank_account": {}, "bank_name": {}, "email": {},
	"invoice_address": {}, "invoice_phone": {}, "mobile": {}, "phone": {},
	"tax_no": {}, "tax_number": {},
}

var commercialFieldKeys = map[string]struct{}{
	"amount": {}, "amount_snapshot": {}, "discount": {}, "discount_rate": {},
	"tax_amount": {}, "tax_rate": {}, "total_amount": {}, "unit_price": {},
	"unit_price_snapshot": {},
}

var financeSettlementFieldKeys = map[string]struct{}{
	"account_name": {}, "collection_type": {}, "currency": {},
	"currency_snapshot": {}, "fee_amount": {}, "invoice_category": {},
	"paid_amount": {}, "payment_term": {}, "payment_term_days": {},
	"settled_amount": {}, "settlement_account": {}, "unpaid_amount": {},
}

func (d *jsonrpcDispatcher) applySensitiveFieldReadPolicy(
	ctx context.Context,
	url, method string,
	result *v1.JsonrpcResult,
) {
	if result == nil || result.Data == nil || result.Code != 0 || !sensitiveFieldBusinessURL(url) {
		return
	}
	permissions, permissionResult := d.CurrentEffectiveAdminPermissions(ctx)
	if permissionResult != nil {
		permissions = []string{}
	}
	set := biz.PermissionKeySet(permissions)
	policy := sensitiveFieldReadPolicy{
		partyPrivate:          biz.PermissionSetHasAny(set, biz.PermissionFieldPartyPrivateRead),
		salesCommercial:       biz.PermissionSetHasAny(set, biz.PermissionFieldSalesCommercialRead),
		procurementCommercial: biz.PermissionSetHasAny(set, biz.PermissionFieldProcurementCommercialRead),
		financeSettlement:     biz.PermissionSetHasAny(set, biz.PermissionFieldFinanceSettlementRead),
	}
	data := result.Data.AsMap()
	redactSensitiveFieldMap(data, sensitiveCommercialDomain(url, method), policy)
	result.Data = newDataStruct(data)
}

func sensitiveFieldBusinessURL(url string) bool {
	switch strings.TrimSpace(url) {
	case "business", "workflow", "masterdata", "sales_order", "purchase_order", "outsourcing_order", "purchase", "inventory", "quality", "operational_fact", "production_order", "production_wip":
		return true
	default:
		return false
	}
}

func sensitiveCommercialDomain(url, method string) string {
	switch strings.TrimSpace(url) {
	case "sales_order":
		return "sales"
	case "purchase_order", "purchase", "outsourcing_order":
		return "procurement"
	case "operational_fact":
		normalizedMethod := strings.ToLower(strings.TrimSpace(method))
		switch {
		case strings.Contains(normalizedMethod, "shipment"), strings.Contains(normalizedMethod, "receivable"):
			return "sales"
		case strings.Contains(normalizedMethod, "purchase"), strings.Contains(normalizedMethod, "outsourcing"), strings.Contains(normalizedMethod, "payable"):
			return "procurement"
		case strings.Contains(normalizedMethod, "finance"), strings.Contains(normalizedMethod, "invoice"), strings.Contains(normalizedMethod, "reconciliation"):
			return "finance"
		}
	}
	return "strict"
}

func redactSensitiveFieldMap(value map[string]any, commercialDomain string, policy sensitiveFieldReadPolicy) {
	for key, item := range value {
		normalizedKey := strings.ToLower(strings.TrimSpace(key))
		if !policy.partyPrivate && isSensitiveFieldKey(normalizedKey, partyPrivateFieldKeys) {
			delete(value, key)
			continue
		}
		if !policy.financeSettlement && isSensitiveFieldKey(normalizedKey, financeSettlementFieldKeys) {
			delete(value, key)
			continue
		}
		if isSensitiveFieldKey(normalizedKey, commercialFieldKeys) && !commercialFieldVisible(commercialDomain, policy) {
			delete(value, key)
			continue
		}
		switch child := item.(type) {
		case map[string]any:
			redactSensitiveFieldMap(child, commercialDomain, policy)
		case []any:
			for _, listItem := range child {
				if childMap, ok := listItem.(map[string]any); ok {
					redactSensitiveFieldMap(childMap, commercialDomain, policy)
				}
			}
		}
	}
}

func isSensitiveFieldKey(key string, exact map[string]struct{}) bool {
	if _, ok := exact[key]; ok {
		return true
	}
	for suffix := range exact {
		if strings.HasSuffix(key, "_"+suffix) {
			return true
		}
	}
	return false
}

func commercialFieldVisible(domain string, policy sensitiveFieldReadPolicy) bool {
	switch domain {
	case "sales":
		return policy.salesCommercial
	case "procurement":
		return policy.procurementCommercial
	case "finance":
		return policy.financeSettlement
	default:
		// Generic task and dashboard snapshots do not reliably identify whether a
		// generic amount came from sales or procurement. Only roles allowed to see
		// both commercial groups may receive that ambiguous value.
		return policy.salesCommercial && policy.procurementCommercial
	}
}
