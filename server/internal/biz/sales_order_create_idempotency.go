package biz

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"strings"
)

// Creation identity is independent of the allocated number and later edits.
// Manual-number imports may rely on their unique source number; automatic
// numbering requires a caller-owned intent that survives a lost response.
func prepareSalesOrderCreateIntent(id int, order *SalesOrderMutation, items []*SalesOrderItemSaveMutation) error {
	order.IdempotencyKey = strings.TrimSpace(order.IdempotencyKey)
	order.CreateIntentHash = ""
	if id > 0 {
		if order.IdempotencyKey != "" {
			return ErrBadParam
		}
		order.ActorID = 0
		return nil
	}
	order.ExpectedVersion = 0
	if order.IdempotencyKey == "" {
		order.ActorID = 0
		if order.OrderNo == "" {
			return ErrBadParam
		}
		return nil
	}
	if len(order.IdempotencyKey) > 128 || order.ActorID <= 0 {
		return ErrBadParam
	}
	canonical := *order
	canonical.IdempotencyKey = ""
	canonical.ActorID = 0
	canonical.OrderDate = canonical.OrderDate.UTC()
	if canonical.PlannedDeliveryDate != nil {
		date := canonical.PlannedDeliveryDate.UTC()
		canonical.PlannedDeliveryDate = &date
	}
	raw, err := json.Marshal(struct {
		Order SalesOrderMutation
		Items []*SalesOrderItemSaveMutation
	}{canonical, items})
	if err != nil {
		return ErrBadParam
	}
	sum := sha256.Sum256(raw)
	order.CreateIntentHash = hex.EncodeToString(sum[:])
	return nil
}
