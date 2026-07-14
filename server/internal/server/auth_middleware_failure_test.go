package server

import (
	"errors"
	"fmt"
	"testing"

	"server/internal/biz"

	"github.com/golang-jwt/jwt/v5"
)

func TestClassifyAdminAuthFailureContract(t *testing.T) {
	tests := []struct {
		name       string
		err        error
		wantState  biz.AuthState
		wantReason adminAuthFailureReason
	}{
		{name: "wrapped token expired", err: fmt.Errorf("parse: %w", jwt.ErrTokenExpired), wantState: biz.AuthExpired, wantReason: adminAuthFailureTokenExpired},
		{name: "session expired", err: biz.ErrSessionExpired, wantState: biz.AuthExpired, wantReason: adminAuthFailureSessionExpired},
		{name: "session revoked", err: biz.ErrSessionRevoked, wantState: biz.AuthInvalid, wantReason: adminAuthFailureSessionRevoked},
		{name: "auth version stale", err: biz.ErrAuthVersionStale, wantState: biz.AuthInvalid, wantReason: adminAuthFailureAuthVersionStale},
		{name: "account inactive", err: biz.ErrUserDisabled, wantState: biz.AuthInvalid, wantReason: adminAuthFailureAccountInactive},
		{name: "session not found", err: biz.ErrSessionNotFound, wantState: biz.AuthInvalid, wantReason: adminAuthFailureSessionNotFound},
		{name: "account not found", err: biz.ErrUserNotFound, wantState: biz.AuthInvalid, wantReason: adminAuthFailureAccountNotFound},
		{name: "incomplete result", err: nil, wantState: biz.AuthInvalid, wantReason: adminAuthFailureResultIncomplete},
		{name: "invalid token", err: fmt.Errorf("parse: %w", jwt.ErrTokenMalformed), wantState: biz.AuthInvalid, wantReason: adminAuthFailureTokenInvalid},
		{name: "authentication backend error", err: errors.New("storage unavailable"), wantState: biz.AuthUnavailable, wantReason: adminAuthFailureBackendError},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			state, reason := classifyAdminAuthFailure(tt.err)
			if state != tt.wantState || reason != tt.wantReason {
				t.Fatalf("classifyAdminAuthFailure(%v) = (%v, %q), want (%v, %q)", tt.err, state, reason, tt.wantState, tt.wantReason)
			}
		})
	}
}
