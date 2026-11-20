// server/pkg/jwt/jwt.go
package jwtutil

import (
	"errors"
	"time"

	"github.com/golang-jwt/jwt/v5"
)

type Claims struct {
	UserID      int    `json:"uid"`
	SessionKey  string `json:"sid"`
	AuthVersion int64  `json:"auth_version"`

	jwt.RegisteredClaims
}

type Config struct {
	Secret         []byte        // HMAC 秘钥
	ExpireDuration time.Duration // 过期时间，比如 7 * 24 * time.Hour
}

const (
	adminTokenIssuer   = "plush-toy-erp"
	adminTokenAudience = "plush-toy-erp-admin"
	adminTokenSubject  = "admin_access_token"
)

func NewToken(cfg Config, userID int, sessionKey string, authVersion int64, issuedAt, requestedExpiry time.Time) (string, time.Time, error) {
	if len(cfg.Secret) == 0 {
		return "", time.Time{}, errors.New("jwt secret is required")
	}
	if userID <= 0 || sessionKey == "" || authVersion <= 0 {
		return "", time.Time{}, errors.New("invalid admin token input")
	}
	if issuedAt.IsZero() {
		issuedAt = time.Now()
	}
	expireAt := requestedExpiry
	if expireAt.IsZero() {
		expireAt = issuedAt.Add(cfg.ExpireDuration)
	}
	issuedAtClaim := jwt.NewNumericDate(issuedAt)
	expiresAtClaim := jwt.NewNumericDate(expireAt)
	if !expiresAtClaim.After(issuedAtClaim.Time) {
		return "", time.Time{}, errors.New("jwt expiry must be after issued at")
	}

	claims := &Claims{
		UserID:      userID,
		SessionKey:  sessionKey,
		AuthVersion: authVersion,
		RegisteredClaims: jwt.RegisteredClaims{
			ExpiresAt: expiresAtClaim,
			IssuedAt:  issuedAtClaim,
			Issuer:    adminTokenIssuer,
			Audience:  jwt.ClaimStrings{adminTokenAudience},
			Subject:   adminTokenSubject,
			ID:        sessionKey,
		},
	}

	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	signed, err := token.SignedString(cfg.Secret)
	if err != nil {
		return "", time.Time{}, err
	}
	return signed, expiresAtClaim.Time, nil
}

func ParseToken(secret []byte, tokenStr string) (*Claims, error) {
	if len(secret) == 0 {
		return nil, errors.New("jwt secret is required")
	}
	token, err := jwt.ParseWithClaims(tokenStr, &Claims{}, func(t *jwt.Token) (interface{}, error) {
		if t.Method != jwt.SigningMethodHS256 {
			return nil, jwt.ErrSignatureInvalid
		}
		return secret, nil
	}, jwt.WithIssuer(adminTokenIssuer), jwt.WithAudience(adminTokenAudience), jwt.WithSubject(adminTokenSubject), jwt.WithExpirationRequired(), jwt.WithIssuedAt())
	if err != nil {
		return nil, err
	}
	if claims, ok := token.Claims.(*Claims); ok && token.Valid && validAdminTokenClaims(claims) {
		return claims, nil
	}
	return nil, jwt.ErrTokenInvalidClaims
}

func validAdminTokenClaims(claims *Claims) bool {
	return claims != nil &&
		claims.IssuedAt != nil && claims.ExpiresAt != nil && claims.ExpiresAt.After(claims.IssuedAt.Time) &&
		claims.UserID > 0 && claims.SessionKey != "" && claims.ID == claims.SessionKey && claims.AuthVersion > 0
}
