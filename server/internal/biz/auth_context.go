// server/internal/biz/auth_context.go
package biz

import "context"

type ctxKeyAuthClaims struct{}

func WithAuthClaims(ctx context.Context, c *AuthClaims) context.Context {
	return context.WithValue(ctx, ctxKeyAuthClaims{}, c)
}

func GetAuthClaims(ctx context.Context) (*AuthClaims, bool) {
	c, ok := ctx.Value(ctxKeyAuthClaims{}).(*AuthClaims)
	return c, ok
}

type ctxKeyAuthState struct{}

type AuthState int

const (
	AuthNone AuthState = iota
	AuthOK
	AuthExpired
	AuthInvalid
	// AuthUnavailable means the token could not be verified against the server-side
	// session/account source because that source failed. It must not be treated as
	// an anonymous or invalid-token success path by sensitive endpoints such as logout.
	AuthUnavailable
)

func WithAuthState(ctx context.Context, st AuthState) context.Context {
	return context.WithValue(ctx, ctxKeyAuthState{}, st)
}

func AuthStateFrom(ctx context.Context) AuthState {
	v := ctx.Value(ctxKeyAuthState{})
	if x, ok := v.(AuthState); ok {
		return x
	}
	return AuthNone
}
