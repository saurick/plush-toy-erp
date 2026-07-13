// server/internal/data/admin_token.go
package data

import (
	"time"

	"server/internal/biz"
	"server/internal/conf"
	jwtutil "server/pkg/jwt"

	"github.com/go-kratos/kratos/v2/log"
)

// NewAdminTokenGenerator 提供 biz.AdminTokenGenerator 给 wire
func NewAdminTokenGenerator(c *conf.Data, logger log.Logger) biz.AdminTokenGenerator {
	l := log.NewHelper(log.With(logger, "module", "data.admin_token"))

	if c == nil || c.Auth == nil || c.Auth.JwtSecret == "" {
		panic("NewAdminTokenGenerator: missing data.auth.jwt_secret in config")
	}

	secret := []byte(c.Auth.JwtSecret)

	exp := 7 * 24 * time.Hour
	if c.Auth.JwtExpireSeconds > 0 {
		exp = time.Duration(c.Auth.JwtExpireSeconds) * time.Second
	}

	cfg := jwtutil.Config{
		Secret:         secret,
		ExpireDuration: exp,
	}

	l.Infof("admin token generator init ok, expire=%s", exp)

	return func(input biz.AdminTokenInput) (string, time.Time, error) {
		l.Infof("gen admin token uid=%d", input.UserID)
		return jwtutil.NewToken(cfg, input.UserID, input.SessionKey, input.AuthVersion, input.IssuedAt, input.ExpiresAt)
	}
}

func NewAdminTokenParser(c *conf.Data) biz.AdminTokenParser {
	if c == nil || c.Auth == nil || c.Auth.JwtSecret == "" {
		panic("NewAdminTokenParser: missing data.auth.jwt_secret in config")
	}
	secret := []byte(c.Auth.JwtSecret)
	return func(token string) (*biz.AuthClaims, error) {
		claims, err := jwtutil.ParseToken(secret, token)
		if err != nil {
			return nil, err
		}
		return &biz.AuthClaims{UserID: claims.UserID, SessionKey: claims.SessionKey, AuthVersion: claims.AuthVersion}, nil
	}
}
