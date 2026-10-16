package biz

import "context"

// PurchaseReceiptAccessRepo applies the authenticated warehouse boundary inside
// the same transaction as inventory mutations. Trusted domain commands keep
// their existing repository contract.
type PurchaseReceiptAccessRepo interface {
	PostPurchaseReceiptForAccess(context.Context, int, WarehouseDataScope) (*PurchaseReceipt, error)
	CancelPostedPurchaseReceiptForAccess(context.Context, int, int, WarehouseDataScope) (*PurchaseReceipt, error)
}

// A receipt is one document: partial warehouse access must not expose its
// header or a misleading subset of its lines. Unassigned headers require ALL.
func ValidatePurchaseReceiptWarehouseAccess(scope WarehouseDataScope, items []*PurchaseReceiptItem) error {
	scope = NormalizeWarehouseDataScope(scope)
	if scope.Mode == DataScopeModeNone || (!scope.IsAll() && len(items) == 0) {
		return ErrDataScopeForbidden
	}
	for _, item := range items {
		if item == nil || !scope.Allows(item.WarehouseID) {
			return ErrDataScopeForbidden
		}
	}
	return nil
}

func (uc *InventoryUsecase) PostPurchaseReceiptForAccess(ctx context.Context, receiptID int, scope WarehouseDataScope) (*PurchaseReceipt, error) {
	if uc == nil || receiptID <= 0 {
		return nil, ErrBadParam
	}
	repo, ok := uc.repo.(PurchaseReceiptAccessRepo)
	if !ok {
		return nil, ErrDataScopeForbidden
	}
	return repo.PostPurchaseReceiptForAccess(ctx, receiptID, NormalizeWarehouseDataScope(scope))
}

func (uc *InventoryUsecase) CancelPostedPurchaseReceiptForAccess(ctx context.Context, receiptID, actorID int, scope WarehouseDataScope) (*PurchaseReceipt, error) {
	if uc == nil || receiptID <= 0 || actorID <= 0 {
		return nil, ErrBadParam
	}
	repo, ok := uc.repo.(PurchaseReceiptAccessRepo)
	if !ok {
		return nil, ErrDataScopeForbidden
	}
	return repo.CancelPostedPurchaseReceiptForAccess(ctx, receiptID, actorID, NormalizeWarehouseDataScope(scope))
}

func (uc *InventoryUsecase) GetPurchaseReceiptForAccess(ctx context.Context, receiptID int, scope WarehouseDataScope) (*PurchaseReceipt, error) {
	item, err := uc.GetPurchaseReceipt(ctx, receiptID)
	if err != nil {
		return nil, err
	}
	if item == nil {
		return nil, ErrPurchaseReceiptNotFound
	}
	if err := ValidatePurchaseReceiptWarehouseAccess(scope, item.Items); err != nil {
		return nil, err
	}
	return item, nil
}

// Access checks precede Process Runtime's stored-result replay without repeating
// quality, lifecycle or quantity checks on an already settled command.
func (uc *InventoryUsecase) ValidatePurchaseReceiptProcessWarehouseAccess(ctx context.Context, in *ProcessDomainCommandInput) error {
	if uc == nil || uc.repo == nil || in == nil || in.WarehouseScope == nil {
		return ErrDataScopeForbidden
	}
	scope := NormalizeWarehouseDataScope(*in.WarehouseScope)
	if scope.Mode == DataScopeModeNone {
		return ErrDataScopeForbidden
	}
	switch in.CommandKey {
	case ProcessDomainCommandInventoryPostInbound:
		receiptID, err := purchaseReceiptIDFromProcessCommandPayload(in.Payload)
		if err != nil {
			return err
		}
		_, err = uc.GetPurchaseReceiptForAccess(ctx, receiptID, scope)
		return err
	case ProcessDomainCommandPurchaseReceiptCreate:
		create, err := purchaseReceiptCreateFromProcessCommandInput(in)
		if err != nil {
			return err
		}
		normalized, err := normalizePurchaseReceiptFromPurchaseOrderCreate(*create)
		if err != nil {
			return err
		}
		if normalized.WarehouseID > 0 && !scope.Allows(normalized.WarehouseID) {
			return ErrDataScopeForbidden
		}
		for _, line := range normalized.Lines {
			if !scope.Allows(line.WarehouseID) {
				return ErrDataScopeForbidden
			}
		}
		_, _, err = uc.repo.ResolvePurchaseReceiptFromPurchaseOrderReplay(ctx, &normalized)
		return err
	default:
		return ErrBadParam
	}
}
