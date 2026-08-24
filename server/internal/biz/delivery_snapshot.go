package biz

var deliverySnapshotTextLimits = map[string]int{
	"country_region": 128,
	"recipient":      128,
	"phone":          64,
	"address":        512,
}

func normalizeDeliverySnapshot(snapshot map[string]any) (map[string]any, error) {
	if snapshot == nil {
		return map[string]any{}, nil
	}
	out := make(map[string]any, len(snapshot))
	for key, raw := range snapshot {
		limit, allowed := deliverySnapshotTextLimits[key]
		if !allowed {
			return nil, ErrBadParam
		}
		if raw == nil {
			continue
		}
		text, ok := raw.(string)
		if !ok {
			return nil, ErrBadParam
		}
		normalized := normalizeOptionalString(&text)
		if normalized == nil {
			continue
		}
		if len([]rune(*normalized)) > limit {
			return nil, ErrBadParam
		}
		if key == "phone" {
			var err error
			normalized, err = normalizeContactPhone(normalized)
			if err != nil {
				return nil, err
			}
		}
		out[key] = *normalized
	}
	return out, nil
}
