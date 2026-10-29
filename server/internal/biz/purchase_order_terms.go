package biz

import (
	"context"
	"errors"
	"sort"
	"strings"
	"time"

	"server/internal/core/value"

	"github.com/shopspring/decimal"
)

const PurchaseOrderActionCompleteTerms = "complete_terms"
const PurchaseOrderActionUpdateDelivery = "update_delivery"

var ErrPurchaseOrderPriceFrozen = errors.New("confirmed purchase price cannot be changed")

type PurchaseOrderTermsItem struct {
	ID                  int              `json:"id"`
	UnitPrice           *decimal.Decimal `json:"unit_price"`
	ExpectedArrivalDate *time.Time       `json:"expected_arrival_date"`
}

// PurchaseOrderTermsCompletion contains commercial fields only. Approved
// quantities, material identities, supplier and currency remain on the order.
type PurchaseOrderTermsCompletion struct {
	ID                           int
	ExpectedVersion              int
	ActorID                      int
	IdempotencyKey               string
	IntentHash                   string
	DeliveryOnly                 bool
	ExpectedArrivalDate          *time.Time
	SupplierConfirmedArrivalDate *time.Time
	Items                        []PurchaseOrderTermsItem
}

type PurchaseOrderTermsRepo interface {
	CompletePurchaseOrderTerms(context.Context, *PurchaseOrderTermsCompletion) (*PurchaseOrder, error)
}

func (uc *PurchaseOrderUsecase) CompletePurchaseOrderTerms(ctx context.Context, in *PurchaseOrderTermsCompletion) (*PurchaseOrder, error) {
	if uc == nil || in == nil {
		return nil, ErrBadParam
	}
	repo, ok := uc.repo.(PurchaseOrderTermsRepo)
	if !ok {
		return nil, ErrBadParam
	}
	n := *in
	n.IdempotencyKey = strings.TrimSpace(n.IdempotencyKey)
	if n.ID <= 0 || n.ExpectedVersion <= 0 || n.ActorID <= 0 || n.IdempotencyKey == "" || len(n.IdempotencyKey) > 128 || len(n.Items) == 0 {
		return nil, ErrBadParam
	}
	n.Items = append([]PurchaseOrderTermsItem(nil), in.Items...)
	sort.Slice(n.Items, func(i, j int) bool { return n.Items[i].ID < n.Items[j].ID })
	for i, item := range n.Items {
		if item.ID <= 0 || (!n.DeliveryOnly && item.UnitPrice == nil) || (n.DeliveryOnly && item.UnitPrice != nil) || (i > 0 && n.Items[i-1].ID == item.ID) {
			return nil, ErrBadParam
		}
		if err := value.ValidateOptionalNonNegativeMoney(item.UnitPrice); err != nil {
			return nil, ErrBadParam
		}
	}
	hash, err := processCanonicalSHA256(map[string]any{
		"action": n.ActionKey(), "id": n.ID, "version": n.ExpectedVersion,
		"actor": n.ActorID, "idempotency_key": n.IdempotencyKey, "items": n.Items,
		"expected_arrival_date": n.ExpectedArrivalDate, "supplier_confirmed_arrival_date": n.SupplierConfirmedArrivalDate,
	})
	if err != nil {
		return nil, err
	}
	n.IntentHash = hash
	return repo.CompletePurchaseOrderTerms(ctx, &n)
}

func (in *PurchaseOrderTermsCompletion) ActionKey() string {
	if in.DeliveryOnly {
		return PurchaseOrderActionUpdateDelivery
	}
	return PurchaseOrderActionCompleteTerms
}
