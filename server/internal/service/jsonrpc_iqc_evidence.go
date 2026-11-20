package service

import (
	"bytes"
	"encoding/json"

	"server/internal/biz"
	"server/internal/core/qualitycheck"
)

func purchaseReceiptLinesFromParams(pm map[string]any) ([]biz.PurchaseReceiptOrderLine, bool) {
	var lines []biz.PurchaseReceiptOrderLine
	if raw, exists := pm["items"]; exists {
		var rawLines []map[string]any
		if !decodeIQCEvidence(raw, &rawLines) {
			return nil, false
		}
		for _, line := range rawLines {
			if _, ok := line["quantity"].(string); !ok {
				return nil, false
			}
			if value, exists := line["declared_quantity"]; exists {
				if _, ok := value.(string); !ok {
					return nil, false
				}
			}
		}
		if raw == nil || !decodeIQCEvidence(raw, &lines) || len(lines) == 0 || len(lines) > 200 {
			return nil, false
		}
	}
	return lines, true
}

func qualityCheckItemsFromParams(pm map[string]any) ([]qualitycheck.Item, bool) {
	var items []qualitycheck.Item
	if raw, exists := pm["check_items"]; exists {
		if raw == nil || !decodeIQCEvidence(raw, &items) || len(items) > 50 {
			return nil, false
		}
	}
	return items, true
}

func decodeIQCEvidence(raw any, out any) bool {
	encoded, err := json.Marshal(raw)
	if err != nil || len(encoded) > 100000 {
		return false
	}
	decoder := json.NewDecoder(bytes.NewReader(encoded))
	decoder.DisallowUnknownFields()
	return decoder.Decode(out) == nil
}

func qualityCheckItemsToAny(items []qualitycheck.Item) []any {
	out := make([]any, 0, len(items))
	for _, item := range items {
		out = append(out, map[string]any{"name": item.Name, "requirement": item.Requirement, "observation": item.Observation, "result": item.Result, "scope": item.Scope, "note": item.Note})
	}
	return out
}
