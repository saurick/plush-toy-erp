// server/internal/biz/auth_claims.go
package biz

import "context"

type Role int8

const (
	RoleUser    Role = 0
	RoleAdmin   Role = 1
	RolePartner Role = 2
)

type AuthClaims struct {
	UserID      int
	Username    string
	SessionKey  string
	AuthVersion int64
	Role        Role
}

type ctxKeyClaims struct{}

type ctxKeyCurrentAdmin struct{}

func NewContextWithClaims(ctx context.Context, c *AuthClaims) context.Context {
	return context.WithValue(ctx, ctxKeyClaims{}, c)
}

func GetClaimsFromContext(ctx context.Context) (*AuthClaims, bool) {
	c, ok := ctx.Value(ctxKeyClaims{}).(*AuthClaims)
	return c, ok
}

// WithCurrentAdmin stores the account identity that has already passed
// token, session, account-state and auth-version checks. Employee and partner
// authorization remains explicit at each protected entry.
// HTTP handlers must not construct this value from unverified token claims.
func WithCurrentAdmin(ctx context.Context, admin *AdminUser) context.Context {
	return context.WithValue(ctx, ctxKeyCurrentAdmin{}, admin)
}

func GetCurrentAdminFromContext(ctx context.Context) (*AdminUser, bool) {
	admin, ok := ctx.Value(ctxKeyCurrentAdmin{}).(*AdminUser)
	return admin, ok && admin != nil
}

func (c *AuthClaims) IsAdmin() bool {
	// Authentication resolves the role from the current account. A valid session
	// alone does not grant employee access.
	return c != nil && c.UserID > 0 && c.Role == RoleAdmin
}
