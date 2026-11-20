package errcode

import "testing"

func TestDefinitionsUseUniqueCodes(t *testing.T) {
	seen := make(map[int32]string, len(Definitions()))
	for _, item := range Definitions() {
		if prev, ok := seen[item.Code]; ok {
			t.Fatalf("duplicate code=%d: %s vs %s", item.Code, prev, item.Name)
		}
		seen[item.Code] = item.Name
	}
}

func TestIsAuthFailureCode(t *testing.T) {
	if !IsAuthFailureCode(AuthExpired.Code) {
		t.Fatalf("auth expired should require relogin")
	}
	if !IsAuthFailureCode(AuthInvalid.Code) {
		t.Fatalf("auth invalid should require relogin")
	}
	if !IsAuthFailureCode(AuthRequired.Code) {
		t.Fatalf("auth required should require relogin")
	}
	if IsAuthFailureCode(PermissionDenied.Code) {
		t.Fatalf("permission denied must not be treated as relogin")
	}
}

func TestIsSystemFailureCode(t *testing.T) {
	for _, tc := range []struct {
		definition Definition
		system     bool
	}{
		{Internal, true}, {TemplateRenderFailed, true},
		{AuthSMSServiceUnavailable, true}, {AuthSMSServiceQuotaExceeded, true},
		{AuthSMSCodeTooFrequent, false}, {AuthInvalidSMSCode, false},
		{InvalidParam, false}, {PermissionDenied, false}, {ResourceNotFound, false},
		{ResourceConflict, false}, {BusinessRuleViolation, false},
		{ResourceVersionConflict, false}, {IdempotencyConflict, false},
		{RequestCanceled, false}, {OK, false},
	} {
		if got := IsSystemFailureCode(tc.definition.Code); got != tc.system {
			t.Errorf("%s: system failure=%v, want %v", tc.definition.Name, got, tc.system)
		}
	}
}
