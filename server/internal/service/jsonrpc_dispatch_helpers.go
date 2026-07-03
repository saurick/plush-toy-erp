package service

import (
	"fmt"
	"strings"

	"google.golang.org/protobuf/types/known/structpb"
)

func getString(m map[string]any, key string) string {
	v, ok := m[key]
	if !ok || v == nil {
		return ""
	}
	switch x := v.(type) {
	case string:
		return x
	case float64:
		return fmt.Sprintf("%.0f", x)
	default:
		return fmt.Sprintf("%v", x)
	}
}

func redactRPCParams(value any) any {
	switch v := value.(type) {
	case map[string]any:
		out := make(map[string]any, len(v))
		for key, item := range v {
			if isSensitiveRPCParamKey(key) {
				out[key] = "<redacted>"
				continue
			}
			out[key] = redactRPCParams(item)
		}
		return out
	case []any:
		out := make([]any, len(v))
		for i, item := range v {
			out[i] = redactRPCParams(item)
		}
		return out
	default:
		return value
	}
}

func isSensitiveRPCParamKey(key string) bool {
	normalized := strings.ToLower(strings.TrimSpace(key))
	return strings.Contains(normalized, "password") ||
		strings.Contains(normalized, "token") ||
		strings.Contains(normalized, "secret") ||
		strings.Contains(normalized, "base64") ||
		normalized == "code" ||
		normalized == "content" ||
		normalized == "file_content" ||
		normalized == "filecontent" ||
		strings.Contains(normalized, "sms_code") ||
		strings.Contains(normalized, "captcha") ||
		strings.Contains(normalized, "verification_code")
}

func getAuthLoginScope(m map[string]any) (string, error) {
	scope := strings.ToLower(strings.TrimSpace(getString(m, "scope")))
	switch scope {
	case "admin":
		return "admin", nil
	default:
		return "", fmt.Errorf("invalid auth scope: %s", scope)
	}
}

func getInt(m map[string]any, key string, def int) int {
	v, ok := m[key]
	if !ok || v == nil {
		return def
	}
	switch x := v.(type) {
	case float64:
		return int(x)
	case int:
		return x
	default:
		return def
	}
}

func getBool(m map[string]any, key string, def bool) bool {
	v, ok := m[key]
	if !ok || v == nil {
		return def
	}
	if b, ok := v.(bool); ok {
		return b
	}
	return def
}

func getStringSlice(m map[string]any, key string) []string {
	v, ok := m[key]
	if !ok || v == nil {
		return nil
	}
	rawItems, ok := v.([]any)
	if !ok {
		return nil
	}
	out := make([]string, 0, len(rawItems))
	for _, item := range rawItems {
		text := strings.TrimSpace(getString(map[string]any{"value": item}, "value"))
		if text == "" {
			continue
		}
		out = append(out, text)
	}
	return out
}

func toAnySliceString(items []string) []any {
	out := make([]any, 0, len(items))
	for _, item := range items {
		out = append(out, item)
	}
	return out
}

func toAnyMapStringSlice(values map[string][]string) map[string]any {
	if len(values) == 0 {
		return map[string]any{}
	}
	out := make(map[string]any, len(values))
	for key, items := range values {
		out[key] = toAnySliceString(items)
	}
	return out
}

func newDataStruct(m map[string]any) *structpb.Struct {
	if m == nil {
		return nil
	}
	s, err := structpb.NewStruct(m)
	if err != nil {
		return nil
	}
	return s
}
