package biz

// SourceDocumentItemOrderMutation changes only the display order of the
// current open lines. ItemIDs must be the complete ordered set of stable line
// identities for the expected document version.
type SourceDocumentItemOrderMutation struct {
	ExpectedVersion int
	ItemIDs         []int
}

func normalizeSourceDocumentItemOrderMutation(id int, in *SourceDocumentItemOrderMutation) (SourceDocumentItemOrderMutation, error) {
	if id <= 0 || in == nil || in.ExpectedVersion <= 0 || len(in.ItemIDs) == 0 {
		return SourceDocumentItemOrderMutation{}, ErrBadParam
	}
	normalized := SourceDocumentItemOrderMutation{
		ExpectedVersion: in.ExpectedVersion,
		ItemIDs:         make([]int, 0, len(in.ItemIDs)),
	}
	seen := make(map[int]struct{}, len(in.ItemIDs))
	for _, itemID := range in.ItemIDs {
		if itemID <= 0 {
			return SourceDocumentItemOrderMutation{}, ErrBadParam
		}
		if _, exists := seen[itemID]; exists {
			return SourceDocumentItemOrderMutation{}, ErrBadParam
		}
		seen[itemID] = struct{}{}
		normalized.ItemIDs = append(normalized.ItemIDs, itemID)
	}
	return normalized, nil
}
