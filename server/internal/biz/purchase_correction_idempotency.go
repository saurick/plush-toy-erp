package biz

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"sort"
	"strings"

	"server/internal/core/value"
)

func normalizePurchaseReturnFromReceiptCreate(in PurchaseReturnFromReceiptCreate) (PurchaseReturnFromReceiptCreate, error) {
	in.ReturnNo = strings.TrimSpace(in.ReturnNo)
	in.Note = normalizeOptionalString(in.Note)
	in.IdempotencyKey = strings.TrimSpace(in.IdempotencyKey)
	in.IdempotencyPayloadHash = ""
	if in.ReturnNo == "" || in.PurchaseReceiptID <= 0 || in.ReturnedAt.IsZero() ||
		in.IdempotencyKey == "" || len(in.IdempotencyKey) > 128 || len(in.Items) == 0 {
		return PurchaseReturnFromReceiptCreate{}, ErrBadParam
	}
	seen := make(map[int]struct{}, len(in.Items))
	items := append([]PurchaseReturnFromReceiptItemCreate(nil), in.Items...)
	for index := range items {
		items[index].Note = normalizeOptionalString(items[index].Note)
		if items[index].PurchaseReceiptItemID <= 0 {
			return PurchaseReturnFromReceiptCreate{}, ErrBadParam
		}
		if _, err := value.NewPositiveQuantity(items[index].Quantity); err != nil {
			return PurchaseReturnFromReceiptCreate{}, ErrBadParam
		}
		if _, duplicate := seen[items[index].PurchaseReceiptItemID]; duplicate {
			return PurchaseReturnFromReceiptCreate{}, ErrBadParam
		}
		seen[items[index].PurchaseReceiptItemID] = struct{}{}
	}
	sort.Slice(items, func(i, j int) bool {
		return items[i].PurchaseReceiptItemID < items[j].PurchaseReceiptItemID
	})
	in.Items = items
	in.IdempotencyPayloadHash = purchaseReturnFromReceiptPayloadHash(in)
	return in, nil
}

func purchaseReturnFromReceiptPayloadHash(in PurchaseReturnFromReceiptCreate) string {
	type line struct {
		PurchaseReceiptItemID int     `json:"purchase_receipt_item_id"`
		Quantity              string  `json:"quantity"`
		Note                  *string `json:"note"`
	}
	lines := make([]line, 0, len(in.Items))
	for _, item := range in.Items {
		lines = append(lines, line{
			PurchaseReceiptItemID: item.PurchaseReceiptItemID,
			Quantity:              item.Quantity.String(),
			Note:                  item.Note,
		})
	}
	payload := struct {
		ReturnNo          string  `json:"return_no"`
		PurchaseReceiptID int     `json:"purchase_receipt_id"`
		ReturnedAt        string  `json:"returned_at"`
		Note              *string `json:"note"`
		Items             []line  `json:"items"`
	}{
		ReturnNo:          in.ReturnNo,
		PurchaseReceiptID: in.PurchaseReceiptID,
		ReturnedAt:        in.ReturnedAt.UTC().Format(canonicalIntentTimeLayout),
		Note:              in.Note,
		Items:             lines,
	}
	encoded, _ := json.Marshal(payload)
	sum := sha256.Sum256(encoded)
	return hex.EncodeToString(sum[:])
}

func normalizePurchaseReturnFromQualityInspectionCreate(in PurchaseReturnFromQualityInspectionCreate) (PurchaseReturnFromQualityInspectionCreate, error) {
	in.ReturnNo = strings.TrimSpace(in.ReturnNo)
	in.Reason = strings.TrimSpace(in.Reason)
	in.Note = normalizeOptionalString(in.Note)
	in.IdempotencyKey = strings.TrimSpace(in.IdempotencyKey)
	in.IdempotencyPayloadHash = ""
	if in.ReturnNo == "" || in.QualityInspectionID <= 0 || in.ReturnedAt.IsZero() || in.Reason == "" || len(in.Reason) > 255 ||
		in.IdempotencyKey == "" || len(in.IdempotencyKey) > 128 {
		return PurchaseReturnFromQualityInspectionCreate{}, ErrBadParam
	}
	if _, err := value.NewPositiveQuantity(in.Quantity); err != nil {
		return PurchaseReturnFromQualityInspectionCreate{}, ErrBadParam
	}
	in.IdempotencyPayloadHash = purchaseReturnFromQualityInspectionPayloadHash(in)
	return in, nil
}

func purchaseReturnFromQualityInspectionPayloadHash(in PurchaseReturnFromQualityInspectionCreate) string {
	payload := struct {
		ReturnNo            string  `json:"return_no"`
		QualityInspectionID int     `json:"quality_inspection_id"`
		Quantity            string  `json:"quantity"`
		ReturnedAt          string  `json:"returned_at"`
		Reason              string  `json:"reason"`
		Note                *string `json:"note"`
	}{
		ReturnNo:            in.ReturnNo,
		QualityInspectionID: in.QualityInspectionID,
		Quantity:            in.Quantity.String(),
		ReturnedAt:          in.ReturnedAt.UTC().Format(canonicalIntentTimeLayout),
		Reason:              in.Reason,
		Note:                in.Note,
	}
	encoded, _ := json.Marshal(payload)
	sum := sha256.Sum256(encoded)
	return hex.EncodeToString(sum[:])
}

func normalizePurchaseReceiptAdjustmentFromReceiptCreate(in PurchaseReceiptAdjustmentFromReceiptCreate) (PurchaseReceiptAdjustmentFromReceiptCreate, error) {
	in.AdjustmentNo = strings.TrimSpace(in.AdjustmentNo)
	in.Reason = normalizeOptionalString(in.Reason)
	in.Note = normalizeOptionalString(in.Note)
	in.IdempotencyKey = strings.TrimSpace(in.IdempotencyKey)
	in.IdempotencyPayloadHash = ""
	if in.AdjustmentNo == "" || in.PurchaseReceiptID <= 0 || in.AdjustedAt.IsZero() ||
		in.IdempotencyKey == "" || len(in.IdempotencyKey) > 128 || len(in.Items) == 0 {
		return PurchaseReceiptAdjustmentFromReceiptCreate{}, ErrBadParam
	}
	items := append([]PurchaseReceiptAdjustmentFromReceiptItemCreate(nil), in.Items...)
	seen := make(map[string]struct{}, len(items))
	groups := make(map[string][]PurchaseReceiptAdjustmentFromReceiptItemCreate)
	for index := range items {
		item := &items[index]
		item.AdjustType = strings.ToUpper(strings.TrimSpace(item.AdjustType))
		item.CorrectionGroup = normalizeOptionalString(item.CorrectionGroup)
		item.Note = normalizeOptionalString(item.Note)
		if item.PurchaseReceiptItemID <= 0 || !IsValidPurchaseReceiptAdjustmentType(item.AdjustType) {
			return PurchaseReceiptAdjustmentFromReceiptCreate{}, ErrBadParam
		}
		if _, err := value.NewPositiveQuantity(item.Quantity); err != nil {
			return PurchaseReceiptAdjustmentFromReceiptCreate{}, ErrBadParam
		}
		if item.LotID != nil && *item.LotID <= 0 {
			return PurchaseReceiptAdjustmentFromReceiptCreate{}, ErrBadParam
		}
		lineIdentity := fmt.Sprintf("%d:%s", item.PurchaseReceiptItemID, item.AdjustType)
		if _, duplicate := seen[lineIdentity]; duplicate {
			return PurchaseReceiptAdjustmentFromReceiptCreate{}, ErrBadParam
		}
		seen[lineIdentity] = struct{}{}
		switch item.AdjustType {
		case PurchaseReceiptAdjustmentQuantityIncrease, PurchaseReceiptAdjustmentQuantityDecrease:
			if item.WarehouseID > 0 || item.LotID != nil || item.CorrectionGroup != nil {
				return PurchaseReceiptAdjustmentFromReceiptCreate{}, ErrBadParam
			}
		case PurchaseReceiptAdjustmentLotCorrectionOut, PurchaseReceiptAdjustmentWarehouseCorrectionOut:
			if item.WarehouseID > 0 || item.LotID != nil || item.CorrectionGroup == nil {
				return PurchaseReceiptAdjustmentFromReceiptCreate{}, ErrBadParam
			}
			groups[*item.CorrectionGroup] = append(groups[*item.CorrectionGroup], *item)
		case PurchaseReceiptAdjustmentLotCorrectionIn:
			if item.WarehouseID > 0 || item.LotID == nil || item.CorrectionGroup == nil {
				return PurchaseReceiptAdjustmentFromReceiptCreate{}, ErrBadParam
			}
			groups[*item.CorrectionGroup] = append(groups[*item.CorrectionGroup], *item)
		case PurchaseReceiptAdjustmentWarehouseCorrectionIn:
			if item.WarehouseID <= 0 || item.LotID != nil || item.CorrectionGroup == nil {
				return PurchaseReceiptAdjustmentFromReceiptCreate{}, ErrBadParam
			}
			groups[*item.CorrectionGroup] = append(groups[*item.CorrectionGroup], *item)
		default:
			return PurchaseReceiptAdjustmentFromReceiptCreate{}, ErrBadParam
		}
	}
	for _, pair := range groups {
		if len(pair) != 2 || pair[0].PurchaseReceiptItemID != pair[1].PurchaseReceiptItemID || pair[0].Quantity.Cmp(pair[1].Quantity) != 0 {
			return PurchaseReceiptAdjustmentFromReceiptCreate{}, ErrBadParam
		}
		a, b := pair[0].AdjustType, pair[1].AdjustType
		lotPair := (a == PurchaseReceiptAdjustmentLotCorrectionOut && b == PurchaseReceiptAdjustmentLotCorrectionIn) ||
			(a == PurchaseReceiptAdjustmentLotCorrectionIn && b == PurchaseReceiptAdjustmentLotCorrectionOut)
		warehousePair := (a == PurchaseReceiptAdjustmentWarehouseCorrectionOut && b == PurchaseReceiptAdjustmentWarehouseCorrectionIn) ||
			(a == PurchaseReceiptAdjustmentWarehouseCorrectionIn && b == PurchaseReceiptAdjustmentWarehouseCorrectionOut)
		if !lotPair && !warehousePair {
			return PurchaseReceiptAdjustmentFromReceiptCreate{}, ErrBadParam
		}
	}
	sort.Slice(items, func(i, j int) bool {
		return adjustmentRequestLineKey(items[i]) < adjustmentRequestLineKey(items[j])
	})
	in.Items = items
	in.IdempotencyPayloadHash = purchaseReceiptAdjustmentFromReceiptPayloadHash(in)
	return in, nil
}

func adjustmentRequestLineKey(item PurchaseReceiptAdjustmentFromReceiptItemCreate) string {
	lotID := 0
	if item.LotID != nil {
		lotID = *item.LotID
	}
	return strings.Join([]string{
		decimalIntKey(item.PurchaseReceiptItemID),
		item.AdjustType,
		decimalIntKey(item.WarehouseID),
		decimalIntKey(lotID),
		optionalStringKey(item.CorrectionGroup),
	}, "\x00")
}

func purchaseReceiptAdjustmentFromReceiptPayloadHash(in PurchaseReceiptAdjustmentFromReceiptCreate) string {
	type line struct {
		PurchaseReceiptItemID int     `json:"purchase_receipt_item_id"`
		AdjustType            string  `json:"adjust_type"`
		Quantity              string  `json:"quantity"`
		WarehouseID           int     `json:"warehouse_id"`
		LotID                 *int    `json:"lot_id"`
		CorrectionGroup       *string `json:"correction_group"`
		Note                  *string `json:"note"`
	}
	lines := make([]line, 0, len(in.Items))
	for _, item := range in.Items {
		lines = append(lines, line{
			PurchaseReceiptItemID: item.PurchaseReceiptItemID,
			AdjustType:            item.AdjustType,
			Quantity:              item.Quantity.String(),
			WarehouseID:           item.WarehouseID,
			LotID:                 item.LotID,
			CorrectionGroup:       item.CorrectionGroup,
			Note:                  item.Note,
		})
	}
	payload := struct {
		AdjustmentNo      string  `json:"adjustment_no"`
		PurchaseReceiptID int     `json:"purchase_receipt_id"`
		Reason            *string `json:"reason"`
		AdjustedAt        string  `json:"adjusted_at"`
		Note              *string `json:"note"`
		Items             []line  `json:"items"`
	}{
		AdjustmentNo:      in.AdjustmentNo,
		PurchaseReceiptID: in.PurchaseReceiptID,
		Reason:            in.Reason,
		AdjustedAt:        in.AdjustedAt.UTC().Format(canonicalIntentTimeLayout),
		Note:              in.Note,
		Items:             lines,
	}
	encoded, _ := json.Marshal(payload)
	sum := sha256.Sum256(encoded)
	return hex.EncodeToString(sum[:])
}

const canonicalIntentTimeLayout = "2006-01-02T15:04:05.999999999Z07:00"

func decimalIntKey(value int) string {
	// Fixed width keeps lexical ordering stable without leaking this
	// transport-only representation into the persisted payload.
	return fmt.Sprintf("%020d", value)
}

func optionalStringKey(value *string) string {
	if value == nil {
		return ""
	}
	return *value
}
