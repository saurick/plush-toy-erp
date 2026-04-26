package biz

import "strings"

const (
	BossRoleKey          = "boss"
	SalesRoleKey         = "sales"
	PurchaseRoleKey      = "purchase"
	ProductionRoleKey    = "production"
	WarehouseRoleKey     = "warehouse"
	QualityRoleKey       = "quality"
	FinanceRoleKey       = "finance"
	PMCRoleKey           = "pmc"
	AdminRoleKey         = "admin"
	DebugOperatorRoleKey = "debug_operator"
	EngineeringRoleKey   = "engineering"
)

const BusinessRoleKey = SalesRoleKey

func NormalizeRoleKey(roleKey string) string {
	return strings.TrimSpace(roleKey)
}

func NormalizeOptionalRoleKey(roleKey *string) *string {
	if roleKey == nil {
		return nil
	}
	normalized := NormalizeRoleKey(*roleKey)
	if normalized == "" {
		return nil
	}
	return &normalized
}
