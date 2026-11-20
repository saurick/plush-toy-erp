package service

import "server/internal/biz"

// An explicit empty or malformed ID set must never turn into an unfiltered read.
func optionalReferenceIDs(pm map[string]any, key string) ([]int, bool) {
	raw, exists := pm[key]
	if !exists {
		return nil, true
	}
	values, ok := raw.([]any)
	if !ok || len(values) == 0 || len(values) > biz.ReferenceIDBatchLimit {
		return nil, false
	}
	ids := make([]int, 0, len(values))
	for _, value := range values {
		id, valid := productionOrderJSONSafeInt(value)
		if !valid {
			return nil, false
		}
		ids = append(ids, id)
	}
	return ids, biz.ValidateReferenceIDs(ids) == nil
}
