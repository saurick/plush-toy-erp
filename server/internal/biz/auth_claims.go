// server/internal/biz/auth_claims.go
package biz

import "context"

type Role int8

const (
	RoleUser  Role = 0
	RoleAdmin Role = 1
)

type AuthClaims struct {
	UserID      int
	Username    string
	SessionKey  string
	AuthVersion int64
	Role        Role
}

type ctxKeyClaims struct{}

func NewContextWithClaims(ctx context.Context, c *AuthClaims) context.Context {
	return context.WithValue(ctx, ctxKeyClaims{}, c)
}

func GetClaimsFromContext(ctx context.Context) (*AuthClaims, bool) {
	c, ok := ctx.Value(ctxKeyClaims{}).(*AuthClaims)
	return c, ok
}

func (c *AuthClaims) IsAdmin() bool {
	// RoleAdmin is retained for trusted in-process contexts and tests. External requests only
	// receive claims after AdminAuthUsecase has validated the server-side session.
	return c != nil && c.UserID > 0 && (c.Role == RoleAdmin || (c.SessionKey != "" && c.AuthVersion > 0))
}
