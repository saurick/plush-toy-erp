package biz

import (
	"errors"
	"strings"
	"time"
)

var (
	ErrUserNotFound     = errors.New("user not found")
	ErrPhoneNotBound    = errors.New("phone not bound")
	ErrMobileRoleDenied = errors.New("mobile role denied")
	ErrInvalidPassword  = errors.New("invalid password")
	ErrUserDisabled     = errors.New("user disabled")
	ErrUserRevoked      = errors.New("user revoked")
	ErrSessionNotFound  = errors.New("admin session not found")
	ErrSessionRevoked   = errors.New("admin session revoked")
	ErrSessionExpired   = errors.New("admin session expired")
	ErrAuthVersionStale = errors.New("admin auth version stale")
)

type AdminTokenInput struct {
	UserID      int
	SessionKey  string
	AuthVersion int64
	IssuedAt    time.Time
	ExpiresAt   time.Time
}

type AdminTokenGenerator func(input AdminTokenInput) (token string, expireAt time.Time, err error)
type AdminTokenParser func(token string) (*AuthClaims, error)

func maskPhone(phone string) string {
	trimmed := strings.TrimSpace(phone)
	if len(trimmed) <= 4 {
		return "****"
	}
	return strings.Repeat("*", len(trimmed)-4) + trimmed[len(trimmed)-4:]
}
