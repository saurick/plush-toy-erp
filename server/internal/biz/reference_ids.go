package biz

// ReferenceIDBatchLimit bounds exact lookups independently of the list page size.
const ReferenceIDBatchLimit = 200

func ValidateReferenceIDs(ids []int) error {
	if ids == nil {
		return nil
	}
	if len(ids) == 0 || len(ids) > ReferenceIDBatchLimit {
		return ErrBadParam
	}
	seen := make(map[int]bool, len(ids))
	for _, id := range ids {
		if id <= 0 || seen[id] {
			return ErrBadParam
		}
		seen[id] = true
	}
	return nil
}
