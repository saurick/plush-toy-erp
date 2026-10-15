package logger

import (
	"reflect"
	"regexp"
)

var diagnosticURLCredentials = regexp.MustCompile(`(?i)([a-z][a-z0-9+.-]*://)[^/\s@]+@`)
var diagnosticBearerToken = regexp.MustCompile(`(?i)\bBearer\s+[A-Za-z0-9._~+/=-]+`)
var diagnosticSecretValue = regexp.MustCompile(`(?i)\b(password|passwd|pwd|access_token|refresh_token|api_key|secret(?:_key)?)["']?\s*[:=]\s*(?:"[^"]*"|'[^']*'|[^\s&,;]+)`)

func diagnosticLogValue(value any) any {
	err, ok := value.(error)
	if !ok {
		return value
	}
	v := reflect.ValueOf(err)
	switch v.Kind() {
	case reflect.Pointer, reflect.Map, reflect.Slice, reflect.Func, reflect.Chan, reflect.Interface:
		if v.IsNil() {
			return nil
		}
	}
	// Preserve the error's diagnostic text, never its arbitrary internal fields.
	// This guards common credential formats; callers still omit payloads and PII.
	text := diagnosticURLCredentials.ReplaceAllString(err.Error(), `${1}[redacted]@`)
	text = diagnosticBearerToken.ReplaceAllString(text, "Bearer [redacted]")
	return diagnosticSecretValue.ReplaceAllString(text, `${1}=[redacted]`)
}
