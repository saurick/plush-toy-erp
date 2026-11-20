package biz

import (
	"strings"
	"time"

	"server/internal/core/value"
)

func normalizeOperationalFactMutation(in *OperationalFactMutation, allowedTypes map[string]struct{}) (*OperationalFactMutation, error) {
	if in == nil {
		return nil, ErrBadParam
	}
	out := *in
	out.FactNo = strings.TrimSpace(out.FactNo)
	out.FactType = strings.ToUpper(strings.TrimSpace(out.FactType))
	out.SubjectType = strings.ToUpper(strings.TrimSpace(out.SubjectType))
	out.SourceType = normalizeOptionalUpperString(out.SourceType)
	out.Note = normalizeOptionalString(out.Note)
	idempotencyKey, err := value.NewIdempotencyKey(out.IdempotencyKey)
	if err != nil {
		return nil, ErrBadParam
	}
	out.IdempotencyKey = idempotencyKey.String()
	if out.LotID != nil && *out.LotID <= 0 {
		out.LotID = nil
	}
	if out.ProductSkuID != nil && (*out.ProductSkuID <= 0 || out.SubjectType != InventorySubjectProduct) {
		return nil, ErrBadParam
	}
	if out.SupplierID != nil && *out.SupplierID <= 0 {
		out.SupplierID = nil
	}
	if out.SourceID != nil && *out.SourceID <= 0 {
		out.SourceID = nil
	}
	if out.SourceLineID != nil && *out.SourceLineID <= 0 {
		out.SourceLineID = nil
	}
	if out.ProductionWIPBatchID != nil && *out.ProductionWIPBatchID <= 0 {
		return nil, ErrBadParam
	}
	if _, ok := allowedTypes[out.FactType]; !ok {
		return nil, ErrBadParam
	}
	if out.ProductionWIPBatchID != nil &&
		(out.FactType != ProductionFactFinishedGoodsReceipt ||
			out.SourceType == nil || *out.SourceType != ProductionOrderSourceType ||
			out.SourceID == nil || out.SourceLineID == nil) {
		return nil, ErrBadParam
	}
	if _, ok := inventorySubjectTypes[out.SubjectType]; !ok {
		return nil, ErrBadParam
	}
	if out.FactNo == "" ||
		out.SubjectID <= 0 ||
		out.WarehouseID <= 0 ||
		out.UnitID <= 0 {
		return nil, ErrBadParam
	}
	if _, err := value.NewPositiveQuantity(out.Quantity); err != nil {
		return nil, ErrBadParam
	}
	out.OccurredAt, out.OccurredAtSpecified = normalizeIdempotencyIntentTime(out.OccurredAt)
	return &out, nil
}

func normalizeProductionCompletionFromOrderCreate(in *ProductionCompletionFromOrderCreate) (*ProductionCompletionFromOrderCreate, error) {
	if in == nil {
		return nil, ErrBadParam
	}
	out := *in
	out.FactNo = strings.TrimSpace(out.FactNo)
	out.Note = normalizeOptionalString(out.Note)
	out.NewLotNo = normalizeOptionalString(out.NewLotNo)
	idempotencyKey, err := value.NewIdempotencyKey(out.IdempotencyKey)
	if err != nil {
		return nil, ErrBadParam
	}
	out.IdempotencyKey = idempotencyKey.String()
	if out.LotID != nil && *out.LotID <= 0 {
		out.LotID = nil
	}
	if out.NewLotNo != nil && (len([]rune(*out.NewLotNo)) > 64 || out.LotID != nil) {
		return nil, ErrBadParam
	}
	if out.FactNo == "" || out.ProductionOrderID <= 0 || out.ProductionOrderItemID <= 0 || out.ProductionWIPBatchID < 0 || out.WarehouseID <= 0 {
		return nil, ErrBadParam
	}
	if _, err := value.NewPositiveQuantity(out.Quantity); err != nil {
		return nil, ErrBadParam
	}
	out.OccurredAt, out.OccurredAtSpecified = normalizeIdempotencyIntentTime(out.OccurredAt)
	return &out, nil
}

func normalizeOutsourcingFactFromOrderCreate(in *OutsourcingFactFromOrderCreate) (*OutsourcingFactFromOrderCreate, error) {
	if in == nil {
		return nil, ErrBadParam
	}
	out := *in
	out.FactNo = strings.TrimSpace(out.FactNo)
	out.Note = normalizeOptionalString(out.Note)
	out.NewLotNo = normalizeOptionalString(out.NewLotNo)
	idempotencyKey, err := value.NewIdempotencyKey(out.IdempotencyKey)
	if err != nil {
		return nil, ErrBadParam
	}
	out.IdempotencyKey = idempotencyKey.String()
	if out.LotID != nil && *out.LotID <= 0 {
		out.LotID = nil
	}
	if out.NewLotNo != nil && (len([]rune(*out.NewLotNo)) > 64 || out.LotID != nil) {
		return nil, ErrBadParam
	}
	if out.FactNo == "" || out.OutsourcingOrderID <= 0 || out.OutsourcingOrderItemID <= 0 || out.WarehouseID <= 0 {
		return nil, ErrBadParam
	}
	if _, err := value.NewPositiveQuantity(out.Quantity); err != nil {
		return nil, ErrBadParam
	}
	out.OccurredAt, out.OccurredAtSpecified = normalizeIdempotencyIntentTime(out.OccurredAt)
	return &out, nil
}

func normalizeProductionMaterialIssueFromOrderCreate(in *ProductionMaterialIssueFromOrderCreate) (*ProductionMaterialIssueFromOrderCreate, error) {
	if in == nil {
		return nil, ErrBadParam
	}
	out := *in
	out.FactNo = strings.TrimSpace(out.FactNo)
	out.Note = normalizeOptionalString(out.Note)
	idempotencyKey, err := value.NewIdempotencyKey(out.IdempotencyKey)
	if err != nil {
		return nil, ErrBadParam
	}
	out.IdempotencyKey = idempotencyKey.String()
	if out.LotID != nil && *out.LotID <= 0 {
		out.LotID = nil
	}
	if out.FactNo == "" || out.ProductionOrderID <= 0 || out.ProductionOrderItemID <= 0 ||
		out.ProductionOrderMaterialRequirementID <= 0 || out.WarehouseID <= 0 {
		return nil, ErrBadParam
	}
	if _, err := value.NewPositiveQuantity(out.Quantity); err != nil {
		return nil, ErrBadParam
	}
	out.OccurredAt, out.OccurredAtSpecified = normalizeIdempotencyIntentTime(out.OccurredAt)
	return &out, nil
}

func normalizeProductionReworkFromCompletionCreate(in *ProductionReworkFromCompletionCreate) (*ProductionReworkFromCompletionCreate, error) {
	if in == nil {
		return nil, ErrBadParam
	}
	out := *in
	out.FactNo = strings.TrimSpace(out.FactNo)
	out.Reason = strings.TrimSpace(out.Reason)
	idempotencyKey, err := value.NewIdempotencyKey(out.IdempotencyKey)
	if err != nil {
		return nil, ErrBadParam
	}
	out.IdempotencyKey = idempotencyKey.String()
	if out.FactNo == "" || out.SourceCompletionFactID <= 0 || out.Reason == "" || len([]rune(out.Reason)) > 255 {
		return nil, ErrBadParam
	}
	if _, err := value.NewPositiveQuantity(out.Quantity); err != nil {
		return nil, ErrBadParam
	}
	out.OccurredAt, out.OccurredAtSpecified = normalizeIdempotencyIntentTime(out.OccurredAt)
	return &out, nil
}

func normalizeProductionFactDraftSave(in *ProductionFactDraftSave, factType, sourceType string) (*ProductionFactDraftSave, error) {
	if in == nil || in.ID <= 0 || in.ExpectedVersion <= 0 {
		return nil, ErrBadParam
	}
	out := *in
	out.FactType = strings.ToUpper(strings.TrimSpace(factType))
	out.SourceType = strings.ToUpper(strings.TrimSpace(sourceType))
	out.FactNo = strings.TrimSpace(out.FactNo)
	out.Note = normalizeOptionalString(out.Note)
	out.NewLotNo = normalizeOptionalString(out.NewLotNo)
	if out.LotID != nil && *out.LotID <= 0 {
		out.LotID = nil
	}
	if out.NewLotNo != nil && (len([]rune(*out.NewLotNo)) > 64 || out.LotID != nil) {
		return nil, ErrBadParam
	}
	if _, err := value.NewPositiveQuantity(out.Quantity); err != nil || out.OccurredAt.IsZero() {
		return nil, ErrBadParam
	}
	out.OccurredAt = out.OccurredAt.UTC().Truncate(time.Microsecond)
	switch out.FactType {
	case ProductionFactMaterialIssue:
		if out.SourceType != ProductionOrderSourceType || out.WarehouseID <= 0 || out.LotID == nil || out.NewLotNo != nil || out.FactNo != "" {
			return nil, ErrBadParam
		}
	case ProductionFactFinishedGoodsReceipt:
		if out.SourceType != ProductionOrderSourceType || out.WarehouseID <= 0 || (out.LotID == nil) == (out.NewLotNo == nil) || out.FactNo != "" {
			return nil, ErrBadParam
		}
	case ProductionFactRework:
		if out.SourceType != ProductionFactSourceType || out.WarehouseID != 0 || out.LotID != nil || out.NewLotNo != nil || out.FactNo == "" || len([]rune(out.FactNo)) > 64 || out.Note == nil || len([]rune(*out.Note)) > 255 {
			return nil, ErrBadParam
		}
	default:
		return nil, ErrBadParam
	}
	if out.Note != nil && len([]rune(*out.Note)) > value.BusinessNoteMaxCharacters {
		return nil, ErrBadParam
	}
	return &out, nil
}

func normalizeOutsourcingFactDraftSave(in *OutsourcingFactDraftSave, factType string) (*OutsourcingFactDraftSave, error) {
	if in == nil || in.ID <= 0 || in.ExpectedVersion <= 0 {
		return nil, ErrBadParam
	}
	out := *in
	out.FactType = strings.ToUpper(strings.TrimSpace(factType))
	out.Note = normalizeOptionalString(out.Note)
	out.NewLotNo = normalizeOptionalString(out.NewLotNo)
	if out.LotID != nil && *out.LotID <= 0 {
		out.LotID = nil
	}
	if out.NewLotNo != nil && (len([]rune(*out.NewLotNo)) > 64 || out.LotID != nil) {
		return nil, ErrBadParam
	}
	if out.WarehouseID <= 0 || out.OccurredAt.IsZero() {
		return nil, ErrBadParam
	}
	if _, err := value.NewPositiveQuantity(out.Quantity); err != nil {
		return nil, ErrBadParam
	}
	out.OccurredAt = out.OccurredAt.UTC().Truncate(time.Microsecond)
	switch out.FactType {
	case OutsourcingFactMaterialIssue:
		if out.LotID == nil || out.NewLotNo != nil {
			return nil, ErrBadParam
		}
	case OutsourcingFactReturnReceipt:
		if (out.LotID == nil) == (out.NewLotNo == nil) {
			return nil, ErrBadParam
		}
	default:
		return nil, ErrBadParam
	}
	if out.Note != nil && len([]rune(*out.Note)) > value.BusinessNoteMaxCharacters {
		return nil, ErrBadParam
	}
	return &out, nil
}

func normalizeShipmentCreate(in *ShipmentCreate) (*ShipmentCreate, error) {
	if in == nil {
		return nil, ErrBadParam
	}
	out := *in
	out.ShipmentNo = strings.TrimSpace(out.ShipmentNo)
	out.CustomerSnapshot = normalizeOptionalString(out.CustomerSnapshot)
	var err error
	out.DeliverySnapshot, err = normalizeDeliverySnapshot(out.DeliverySnapshot)
	if err != nil {
		return nil, err
	}
	out.TransportMethod = normalizeOptionalString(out.TransportMethod)
	out.CarrierName = normalizeOptionalString(out.CarrierName)
	out.TrackingNo = normalizeOptionalString(out.TrackingNo)
	out.ShippingMark = normalizeOptionalString(out.ShippingMark)
	out.FreightCurrency = normalizeOptionalUpperString(out.FreightCurrency)
	out.Note = normalizeOptionalString(out.Note)
	if ValidateShipmentWeights(out.TotalNetWeightG, out.GrossWeightKg) != nil {
		return nil, ErrBadParam
	}
	if out.PackageCount != nil && *out.PackageCount <= 0 {
		return nil, ErrBadParam
	}
	if !validOptionalPositiveNumeric20Scale6(out.GrossWeightKg) ||
		!validOptionalPositiveNumeric20Scale6(out.VolumeM3) {
		return nil, ErrBadParam
	}
	if err := value.ValidateOptionalNonNegativeMoney(out.FreightAmount); err != nil {
		return nil, ErrBadParam
	}
	if (out.FreightAmount == nil) != (out.FreightCurrency == nil) {
		return nil, ErrBadParam
	}
	if out.FreightCurrency != nil {
		if normalized, ok := normalizeSourceOrderCurrency(*out.FreightCurrency, false); !ok {
			return nil, ErrBadParam
		} else {
			out.FreightCurrency = &normalized
		}
	}
	idempotencyKey, err := value.NewIdempotencyKey(out.IdempotencyKey)
	if err != nil {
		return nil, ErrBadParam
	}
	out.IdempotencyKey = idempotencyKey.String()
	if out.SalesOrderID != nil && *out.SalesOrderID <= 0 {
		out.SalesOrderID = nil
	}
	if out.CustomerID != nil && *out.CustomerID <= 0 {
		out.CustomerID = nil
	}
	if out.PlannedShipAt != nil {
		plannedShipAt := out.PlannedShipAt.UTC().Truncate(time.Microsecond)
		out.PlannedShipAt = &plannedShipAt
	}
	if out.ShipmentNo == "" {
		return nil, ErrBadParam
	}
	return &out, nil
}

func normalizeShipmentItemCreate(in *ShipmentItemCreate) (*ShipmentItemCreate, error) {
	if in == nil {
		return nil, ErrBadParam
	}
	out := *in
	out.Note = normalizeOptionalString(out.Note)
	out.PackageDescription = normalizeOptionalString(out.PackageDescription)
	out.CaseNo = normalizeOptionalString(out.CaseNo)
	if out.SalesOrderItemID != nil && *out.SalesOrderItemID <= 0 {
		out.SalesOrderItemID = nil
	}
	if out.ProductSkuID != nil && *out.ProductSkuID <= 0 {
		out.ProductSkuID = nil
	}
	if out.LotID != nil && *out.LotID <= 0 {
		out.LotID = nil
	}
	if out.ProductID <= 0 || out.WarehouseID <= 0 || out.UnitID <= 0 {
		return nil, ErrBadParam
	}
	if !validShipmentNetWeightQuantity(out.Quantity) {
		return nil, ErrBadParam
	}
	return &out, nil
}

func normalizeShipmentCreateWithItems(in *ShipmentCreateWithItems) (*ShipmentCreateWithItems, error) {
	if in == nil || len(in.Items) == 0 {
		return nil, ErrBadParam
	}
	shipment, err := normalizeShipmentCreate(in.Shipment)
	if err != nil {
		return nil, err
	}
	items := make([]*ShipmentItemCreate, 0, len(in.Items))
	for _, item := range in.Items {
		if item == nil {
			return nil, ErrBadParam
		}
		normalizedItem, err := normalizeShipmentItemCreate(item)
		if err != nil {
			return nil, err
		}
		items = append(items, normalizedItem)
	}
	return &ShipmentCreateWithItems{Shipment: shipment, Items: items}, nil
}

func normalizeShipmentDraftSave(in *ShipmentDraftSave) (*ShipmentDraftSave, error) {
	if in == nil || in.ID <= 0 || in.ExpectedVersion <= 0 || len(in.Items) == 0 {
		return nil, ErrBadParam
	}
	out := *in
	out.ShipmentNo = strings.TrimSpace(out.ShipmentNo)
	out.CustomerSnapshot = normalizeOptionalString(out.CustomerSnapshot)
	var err error
	out.DeliverySnapshot, err = normalizeDeliverySnapshot(out.DeliverySnapshot)
	if err != nil {
		return nil, err
	}
	out.TransportMethod = normalizeOptionalString(out.TransportMethod)
	out.CarrierName = normalizeOptionalString(out.CarrierName)
	out.TrackingNo = normalizeOptionalString(out.TrackingNo)
	out.ShippingMark = normalizeOptionalString(out.ShippingMark)
	out.FreightCurrency = normalizeOptionalUpperString(out.FreightCurrency)
	out.Note = normalizeOptionalString(out.Note)
	if out.SalesOrderID != nil && *out.SalesOrderID <= 0 {
		out.SalesOrderID = nil
	}
	if out.CustomerID != nil && *out.CustomerID <= 0 {
		out.CustomerID = nil
	}
	if out.PlannedShipAt != nil {
		plannedShipAt := out.PlannedShipAt.UTC().Truncate(time.Microsecond)
		out.PlannedShipAt = &plannedShipAt
	}
	if out.ShipmentNo == "" || ValidateShipmentWeights(out.TotalNetWeightG, out.GrossWeightKg) != nil ||
		(out.PackageCount != nil && *out.PackageCount <= 0) ||
		!validOptionalPositiveNumeric20Scale6(out.GrossWeightKg) ||
		!validOptionalPositiveNumeric20Scale6(out.VolumeM3) {
		return nil, ErrBadParam
	}
	if err := value.ValidateOptionalNonNegativeMoney(out.FreightAmount); err != nil {
		return nil, ErrBadParam
	}
	if (out.FreightAmount == nil) != (out.FreightCurrency == nil) {
		return nil, ErrBadParam
	}
	if out.FreightCurrency != nil {
		if normalized, ok := normalizeSourceOrderCurrency(*out.FreightCurrency, false); !ok {
			return nil, ErrBadParam
		} else {
			out.FreightCurrency = &normalized
		}
	}
	out.Items = make([]*ShipmentItemCreate, 0, len(in.Items))
	for _, item := range in.Items {
		normalizedItem, err := normalizeShipmentItemCreate(item)
		if err != nil {
			return nil, err
		}
		out.Items = append(out.Items, normalizedItem)
	}
	return &out, nil
}

func normalizeStockReservationCreate(in *StockReservationCreate) (*StockReservationCreate, error) {
	if in == nil {
		return nil, ErrBadParam
	}
	out := *in
	out.ReservationNo = strings.TrimSpace(out.ReservationNo)
	out.Note = normalizeOptionalString(out.Note)
	idempotencyKey, err := value.NewIdempotencyKey(out.IdempotencyKey)
	if err != nil {
		return nil, ErrBadParam
	}
	out.IdempotencyKey = idempotencyKey.String()
	if out.SalesOrderID != nil && *out.SalesOrderID <= 0 {
		out.SalesOrderID = nil
	}
	if out.SalesOrderItemID != nil && *out.SalesOrderItemID <= 0 {
		out.SalesOrderItemID = nil
	}
	if out.ProductSkuID != nil && *out.ProductSkuID <= 0 {
		return nil, ErrBadParam
	}
	if out.LotID != nil && *out.LotID <= 0 {
		out.LotID = nil
	}
	out.ReservedAt, out.ReservedAtSpecified = normalizeIdempotencyIntentTime(out.ReservedAt)
	if out.ReservationNo == "" || out.ProductID <= 0 || out.WarehouseID <= 0 || out.UnitID <= 0 {
		return nil, ErrBadParam
	}
	if _, err := value.NewPositiveQuantity(out.Quantity); err != nil {
		return nil, ErrBadParam
	}
	return &out, nil
}

func normalizeStockReservationFromSalesOrderCreate(in *StockReservationFromSalesOrderCreate) (*StockReservationFromSalesOrderCreate, error) {
	if in == nil {
		return nil, ErrBadParam
	}
	out := *in
	out.ReservationNo = strings.TrimSpace(out.ReservationNo)
	out.Note = normalizeOptionalString(out.Note)
	idempotencyKey, err := value.NewIdempotencyKey(out.IdempotencyKey)
	if err != nil {
		return nil, ErrBadParam
	}
	out.IdempotencyKey = idempotencyKey.String()
	if out.LotID != nil && *out.LotID <= 0 {
		out.LotID = nil
	}
	out.ReservedAt, out.ReservedAtSpecified = normalizeIdempotencyIntentTime(out.ReservedAt)
	if out.ReservationNo == "" || out.SalesOrderID <= 0 || out.SalesOrderItemID <= 0 || out.WarehouseID <= 0 {
		return nil, ErrBadParam
	}
	if _, err := value.NewPositiveQuantity(out.Quantity); err != nil {
		return nil, ErrBadParam
	}
	return &out, nil
}

func normalizeFinanceFactCreate(in *FinanceFactCreate) (*FinanceFactCreate, error) {
	if in == nil {
		return nil, ErrBadParam
	}
	out := *in
	out.FactNo = strings.TrimSpace(out.FactNo)
	out.FactType = strings.ToUpper(strings.TrimSpace(out.FactType))
	out.CounterpartyType = strings.ToUpper(strings.TrimSpace(out.CounterpartyType))
	out.Currency = strings.ToUpper(strings.TrimSpace(out.Currency))
	out.CollectionType = normalizeOptionalUpperString(out.CollectionType)
	out.PaymentTerm = normalizeOptionalUpperString(out.PaymentTerm)
	out.InvoiceCategory = normalizeOptionalUpperString(out.InvoiceCategory)
	out.SourceType = normalizeOptionalUpperString(out.SourceType)
	out.Note = normalizeOptionalString(out.Note)
	idempotencyKey, err := value.NewIdempotencyKey(out.IdempotencyKey)
	if err != nil {
		return nil, ErrBadParam
	}
	out.IdempotencyKey = idempotencyKey.String()
	if out.CounterpartyID != nil && *out.CounterpartyID <= 0 {
		out.CounterpartyID = nil
	}
	if out.SourceID != nil && *out.SourceID <= 0 {
		out.SourceID = nil
	}
	if out.SourceLineID != nil && *out.SourceLineID <= 0 {
		out.SourceLineID = nil
	}
	var currencyOK bool
	out.Currency, currencyOK = NormalizeFinanceCurrency(out.Currency)
	if !currencyOK {
		return nil, ErrBadParam
	}
	if out.CollectionType != nil && *out.CollectionType != FinanceCollectionAccountsReceivable {
		return nil, ErrBadParam
	}
	if out.InvoiceCategory != nil {
		if _, ok := financeInvoiceCategories[*out.InvoiceCategory]; !ok {
			return nil, ErrBadParam
		}
	}
	if _, ok := financeFactTypes[out.FactType]; !ok {
		return nil, ErrBadParam
	}
	if out.CounterpartyType != FinanceCounterpartyCustomer && out.CounterpartyType != FinanceCounterpartySupplier {
		return nil, ErrBadParam
	}
	if out.FactNo == "" {
		return nil, ErrBadParam
	}
	if _, err := value.NewPositiveMoney(out.Amount); err != nil {
		return nil, ErrBadParam
	}
	if _, err := value.NewNonNegativeMoney(out.FeeAmount); err != nil {
		return nil, ErrBadParam
	}
	out.OccurredAt, out.OccurredAtSpecified = normalizeIdempotencyIntentTime(out.OccurredAt)
	switch out.FactType {
	case FinanceFactReceivable, FinanceFactPayable:
		if out.PaymentTermDays == nil {
			return nil, ErrFinanceFactPaymentTermMissing
		}
		canonicalTerm, canonicalDays, err := FinancePaymentTermSnapshotFromDays(out.PaymentTermDays)
		if err != nil || !sameOptionalFinanceText(out.PaymentTerm, canonicalTerm) {
			return nil, ErrBadParam
		}
		dueAt, err := FinanceFactDueAtFromDays(out.OccurredAt, canonicalDays)
		if err != nil {
			return nil, err
		}
		if out.DueAt != nil && !out.DueAt.UTC().Truncate(time.Microsecond).Equal(*dueAt) {
			return nil, ErrBadParam
		}
		out.PaymentTerm = canonicalTerm
		out.PaymentTermDays = canonicalDays
		out.DueAt = dueAt
	default:
		if out.PaymentTerm != nil || out.PaymentTermDays != nil || out.DueAt != nil {
			return nil, ErrBadParam
		}
	}
	return &out, nil
}

func normalizeFinanceFactFromShipmentCreate(in *FinanceFactFromShipmentCreate) (*FinanceFactFromShipmentCreate, error) {
	if in == nil {
		return nil, ErrBadParam
	}
	out := *in
	out.FactNo = strings.TrimSpace(out.FactNo)
	out.Note = normalizeOptionalString(out.Note)
	out.InvoiceCategory = normalizeOptionalUpperString(out.InvoiceCategory)
	idempotencyKey, err := value.NewIdempotencyKey(out.IdempotencyKey)
	if err != nil {
		return nil, ErrBadParam
	}
	out.IdempotencyKey = idempotencyKey.String()
	if out.FactNo == "" || out.ShipmentID <= 0 {
		return nil, ErrBadParam
	}
	if out.InvoiceCategory != nil {
		if _, ok := financeInvoiceCategories[*out.InvoiceCategory]; !ok {
			return nil, ErrBadParam
		}
	}
	out.OccurredAt, out.OccurredAtSpecified = normalizeIdempotencyIntentTime(out.OccurredAt)
	return &out, nil
}

func financeFactTypeCanSettle(factType string) bool {
	switch strings.ToUpper(strings.TrimSpace(factType)) {
	case FinanceFactReconciliation:
		return true
	default:
		return false
	}
}

func normalizeOperationalFactFilter(in OperationalFactFilter) OperationalFactFilter {
	in.Status = strings.ToUpper(strings.TrimSpace(in.Status))
	in.FactType = strings.ToUpper(strings.TrimSpace(in.FactType))
	in.Keyword = strings.TrimSpace(in.Keyword)
	in.DateField = strings.ToLower(strings.TrimSpace(in.DateField))
	in.SubjectType = strings.ToUpper(strings.TrimSpace(in.SubjectType))
	in.SourceType = strings.ToUpper(strings.TrimSpace(in.SourceType))
	in.Limit = NormalizeBusinessListLimit(in.Limit)
	if in.Offset < 0 {
		in.Offset = 0
	}
	return in
}

func normalizeProductionFactFilter(in OperationalFactFilter) (OperationalFactFilter, error) {
	in = normalizeOperationalFactFilter(in)
	if err := validateOperationalFactStatusAndType(in, postedOperationalFactStatuses, productionFactTypes); err != nil {
		return OperationalFactFilter{}, err
	}
	var err error
	in, err = normalizeOperationalFactDateRange(in, "occurred_at")
	if err != nil {
		return OperationalFactFilter{}, err
	}
	return in, nil
}

func normalizeOutsourcingFactFilter(in OperationalFactFilter) (OperationalFactFilter, error) {
	in = normalizeOperationalFactFilter(in)
	if err := validateOperationalFactStatusAndType(in, postedOperationalFactStatuses, outsourcingFactTypes); err != nil {
		return OperationalFactFilter{}, err
	}
	var err error
	in, err = normalizeOperationalFactDateRange(in, "occurred_at")
	if err != nil {
		return OperationalFactFilter{}, err
	}
	return in, nil
}

func normalizeShipmentFilter(in OperationalFactFilter) (OperationalFactFilter, error) {
	in = normalizeOperationalFactFilter(in)
	if !validBusinessListSort(in.SortBy, in.SortDirection, ShipmentSortNetWeight) {
		return OperationalFactFilter{}, ErrBadParam
	}
	if err := validateFilterValue(in.Status, shipmentStatuses); err != nil {
		return OperationalFactFilter{}, err
	}
	switch in.DateField {
	case "", "planned_ship_at", "shipped_at":
	default:
		return OperationalFactFilter{}, ErrBadParam
	}
	if in.DateField == "" && (in.DateFrom != nil || in.DateTo != nil) {
		in.DateField = "planned_ship_at"
	}
	if in.DateFrom != nil && in.DateTo != nil && in.DateFrom.After(*in.DateTo) {
		return OperationalFactFilter{}, ErrBadParam
	}
	return in, nil
}

func normalizeStockReservationFilter(in OperationalFactFilter) (OperationalFactFilter, error) {
	in = normalizeOperationalFactFilter(in)
	if err := validateFilterValue(in.Status, stockReservationStatuses); err != nil {
		return OperationalFactFilter{}, err
	}
	var err error
	in, err = normalizeOperationalFactDateRange(in, "reserved_at")
	if err != nil {
		return OperationalFactFilter{}, err
	}
	return in, nil
}

func normalizeFinanceFactFilter(in OperationalFactFilter) (OperationalFactFilter, error) {
	in = normalizeOperationalFactFilter(in)
	if err := validateOperationalFactStatusAndType(in, financeFactStatuses, financeFactTypes); err != nil {
		return OperationalFactFilter{}, err
	}
	var err error
	in, err = normalizeOperationalFactDateRange(in, "occurred_at")
	if err != nil {
		return OperationalFactFilter{}, err
	}
	return in, nil
}

func validateOperationalFactStatusAndType(in OperationalFactFilter, allowedStatuses map[string]struct{}, allowedTypes map[string]struct{}) error {
	if err := validateFilterValue(in.Status, allowedStatuses); err != nil {
		return err
	}
	return validateFilterValue(in.FactType, allowedTypes)
}

func normalizeOperationalFactDateRange(in OperationalFactFilter, defaultDateField string) (OperationalFactFilter, error) {
	switch in.DateField {
	case "", defaultDateField:
	default:
		return OperationalFactFilter{}, ErrBadParam
	}
	if in.DateField == "" && (in.DateFrom != nil || in.DateTo != nil) {
		in.DateField = defaultDateField
	}
	if in.DateFrom != nil && in.DateTo != nil && in.DateFrom.After(*in.DateTo) {
		return OperationalFactFilter{}, ErrBadParam
	}
	return in, nil
}

func validateFilterValue(value string, allowed map[string]struct{}) error {
	if value == "" {
		return nil
	}
	if _, ok := allowed[value]; !ok {
		return ErrBadParam
	}
	return nil
}

func normalizeOptionalUpperString(value *string) *string {
	value = normalizeOptionalString(value)
	if value == nil {
		return nil
	}
	upper := strings.ToUpper(*value)
	return &upper
}

func normalizeOperationalFactStatusMutation(in *OperationalFactStatusMutation, requireReason bool) (*OperationalFactStatusMutation, error) {
	if in == nil || in.ID <= 0 || in.ExpectedVersion <= 0 || in.ActorID <= 0 {
		return nil, ErrBadParam
	}
	normalized := *in
	normalized.Reason = strings.TrimSpace(normalized.Reason)
	if requireReason && (normalized.Reason == "" || len([]rune(normalized.Reason)) > 255) {
		return nil, ErrBadParam
	}
	if !requireReason && normalized.Reason != "" {
		return nil, ErrBadParam
	}
	return &normalized, nil
}
