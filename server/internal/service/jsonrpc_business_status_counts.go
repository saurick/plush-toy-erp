package service

import "server/internal/biz"

// Only primary list requests ask for counts; exports and reference pickers do not.
func requestedBusinessStatusCounts(params map[string]any, load func() (map[string]int, error)) (map[string]any, error) {
	requested, ok := getOptionalJSONRPCBool(params, "include_status_counts")
	if !ok {
		return nil, biz.ErrBadParam
	}
	if requested == nil || !*requested {
		return nil, nil
	}
	counts, err := load()
	if err != nil {
		return nil, err
	}
	values := make(map[string]any, len(counts))
	for status, count := range counts {
		values[status] = count
	}
	return values, nil
}

func withBusinessStatusCounts(fields map[string]any, counts map[string]any) map[string]any {
	if counts != nil {
		fields["status_counts"] = counts
	}
	return fields
}
