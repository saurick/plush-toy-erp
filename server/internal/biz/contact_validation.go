package biz

import (
	"net/mail"
	"strings"
	"unicode"
)

func normalizeContactEmail(value *string) (*string, error) {
	normalized := normalizeOptionalString(value)
	if normalized == nil {
		return nil, nil
	}
	if !isValidContactEmail(*normalized) {
		return nil, ErrBadParam
	}
	return normalized, nil
}

func normalizeContactPhone(value *string) (*string, error) {
	normalized := normalizeOptionalString(value)
	if normalized == nil {
		return nil, nil
	}
	if !isValidContactPhone(*normalized) {
		return nil, ErrBadParam
	}
	return normalized, nil
}

func isValidContactEmail(value string) bool {
	trimmed := strings.TrimSpace(value)
	if trimmed == "" || strings.ContainsAny(trimmed, "\r\n\t <>") {
		return false
	}
	address, err := mail.ParseAddress(trimmed)
	if err != nil || address == nil || address.Name != "" || address.Address != trimmed {
		return false
	}
	atIndex := strings.LastIndex(trimmed, "@")
	if atIndex <= 0 || atIndex >= len(trimmed)-1 {
		return false
	}
	domain := trimmed[atIndex+1:]
	return strings.Contains(domain, ".") && !strings.HasPrefix(domain, ".") && !strings.HasSuffix(domain, ".")
}

func isValidContactPhone(value string) bool {
	trimmed := strings.TrimSpace(value)
	if trimmed == "" {
		return false
	}
	digitCount := 0
	plusSeen := false
	for index, r := range trimmed {
		switch {
		case unicode.IsDigit(r):
			digitCount++
		case unicode.IsSpace(r) || r == '-' || r == '(' || r == ')' || r == '.' || r == '/':
			continue
		case r == '+':
			if plusSeen || index != 0 {
				return false
			}
			plusSeen = true
		case r == 'x' || r == 'X':
			continue
		default:
			return false
		}
	}
	return digitCount >= 6 && digitCount <= 20
}

func normalizeContactSnapshot(snapshot map[string]any) (map[string]any, error) {
	if snapshot == nil {
		return map[string]any{}, nil
	}
	out := make(map[string]any, len(snapshot))
	for key, value := range snapshot {
		out[key] = value
	}

	if err := normalizeContactSnapshotText(out, "name", nil); err != nil {
		return nil, err
	}
	if err := normalizeContactSnapshotText(out, "title", nil); err != nil {
		return nil, err
	}
	if err := normalizeContactSnapshotText(out, "phone", normalizeContactPhone); err != nil {
		return nil, err
	}
	if err := normalizeContactSnapshotText(out, "mobile", normalizeContactPhone); err != nil {
		return nil, err
	}
	if err := normalizeContactSnapshotText(out, "email", normalizeContactEmail); err != nil {
		return nil, err
	}
	return out, nil
}

func normalizeContactSnapshotText(out map[string]any, key string, normalize func(*string) (*string, error)) error {
	raw, ok := out[key]
	if !ok || raw == nil {
		delete(out, key)
		return nil
	}
	text, ok := raw.(string)
	if !ok {
		return ErrBadParam
	}
	var normalized *string
	var err error
	if normalize == nil {
		normalized = normalizeOptionalString(&text)
	} else {
		normalized, err = normalize(&text)
	}
	if err != nil {
		return err
	}
	if normalized == nil {
		delete(out, key)
		return nil
	}
	out[key] = *normalized
	return nil
}
