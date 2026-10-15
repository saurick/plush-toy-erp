package jwtutil

import (
	"slices"
	"testing"
	"time"

	"github.com/golang-jwt/jwt/v5"
)

var testSecret = []byte("test-only-jwt-secret")

func TestNewTokenAndParseToken(t *testing.T) {
	now := time.Now().UTC().Add(-time.Minute)
	requestedExpiry := now.Add(2 * time.Hour)
	wantExpiry := jwt.NewNumericDate(requestedExpiry).Time

	token, expiry, err := NewToken(Config{
		Secret:         testSecret,
		ExpireDuration: 24 * time.Hour,
	}, 42, "session-42", 7, now, requestedExpiry)
	if err != nil {
		t.Fatalf("NewToken() error = %v", err)
	}
	if !expiry.Equal(wantExpiry) {
		t.Fatalf("NewToken() expiry = %v, want %v", expiry, wantExpiry)
	}

	claims, err := ParseToken(testSecret, token)
	if err != nil {
		t.Fatalf("ParseToken() error = %v", err)
	}
	if claims.UserID != 42 || claims.SessionKey != "session-42" || claims.AuthVersion != 7 {
		t.Fatalf("ParseToken() claims = %+v", claims)
	}
	if claims.Issuer != adminTokenIssuer || claims.Subject != adminTokenSubject {
		t.Fatalf("ParseToken() registered claims = %+v", claims.RegisteredClaims)
	}
	if !slices.Contains(claims.Audience, adminTokenAudience) || claims.ID != claims.SessionKey {
		t.Fatalf("ParseToken() audience/jti = %+v", claims.RegisteredClaims)
	}
}

func TestNewTokenUsesConfiguredDuration(t *testing.T) {
	now := time.Now().UTC().Add(-time.Minute)
	token, expiry, err := NewToken(Config{
		Secret:         testSecret,
		ExpireDuration: 90 * time.Minute,
	}, 1, "session-default-expiry", 1, now, time.Time{})
	if err != nil {
		t.Fatalf("NewToken() error = %v", err)
	}
	if want := jwt.NewNumericDate(now.Add(90 * time.Minute)).Time; !expiry.Equal(want) {
		t.Fatalf("NewToken() expiry = %v, want %v", expiry, want)
	}
	if _, err := ParseToken(testSecret, token); err != nil {
		t.Fatalf("ParseToken() error = %v", err)
	}
}

func TestNewTokenRejectsInvalidInputAndEmptySecret(t *testing.T) {
	now := time.Now().UTC()
	for _, tc := range []struct {
		name            string
		cfg             Config
		userID          int
		sessionKey      string
		authVersion     int64
		requestedExpiry time.Time
	}{
		{name: "empty secret", cfg: Config{}, userID: 1, sessionKey: "session", authVersion: 1, requestedExpiry: now.Add(time.Hour)},
		{name: "invalid user", cfg: Config{Secret: testSecret}, userID: 0, sessionKey: "session", authVersion: 1, requestedExpiry: now.Add(time.Hour)},
		{name: "empty session", cfg: Config{Secret: testSecret}, userID: 1, sessionKey: "", authVersion: 1, requestedExpiry: now.Add(time.Hour)},
		{name: "invalid auth version", cfg: Config{Secret: testSecret}, userID: 1, sessionKey: "session", authVersion: 0, requestedExpiry: now.Add(time.Hour)},
		{name: "non-positive requested lifetime", cfg: Config{Secret: testSecret}, userID: 1, sessionKey: "session", authVersion: 1, requestedExpiry: now},
		{name: "non-positive configured lifetime", cfg: Config{Secret: testSecret}, userID: 1, sessionKey: "session", authVersion: 1},
	} {
		t.Run(tc.name, func(t *testing.T) {
			if _, _, err := NewToken(tc.cfg, tc.userID, tc.sessionKey, tc.authVersion, now, tc.requestedExpiry); err == nil {
				t.Fatal("NewToken() error = nil, want rejection")
			}
		})
	}
}

func TestNewTokenRejectsLifetimeThatCollapsesAtJWTPrecision(t *testing.T) {
	issuedAt := time.Date(2026, time.July, 14, 8, 0, 0, int(100*time.Millisecond), time.UTC)
	requestedExpiry := issuedAt.Add(500 * time.Millisecond)

	if _, _, err := NewToken(
		Config{Secret: testSecret},
		1,
		"session-same-second",
		1,
		issuedAt,
		requestedExpiry,
	); err == nil {
		t.Fatal("NewToken() error = nil, want encoded exp == iat rejection")
	}
}

func TestParseTokenRejectsInvalidTokenAndSecret(t *testing.T) {
	validToken := signTestToken(t, jwt.SigningMethodHS256, validTestClaims(), testSecret)
	wrongSecretToken := signTestToken(t, jwt.SigningMethodHS256, validTestClaims(), []byte("different-secret"))

	for _, tc := range []struct {
		name   string
		secret []byte
		token  string
	}{
		{name: "empty secret", secret: nil, token: validToken},
		{name: "wrong secret", secret: testSecret, token: wrongSecretToken},
		{name: "malformed", secret: testSecret, token: "not-a-jwt"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			if _, err := ParseToken(tc.secret, tc.token); err == nil {
				t.Fatal("ParseToken() error = nil, want rejection")
			}
		})
	}
}

func TestParseTokenRejectsExpiredAndWrongRegisteredClaims(t *testing.T) {
	now := time.Now().UTC()
	for _, tc := range []struct {
		name   string
		mutate func(*Claims)
	}{
		{name: "expired", mutate: func(claims *Claims) { claims.ExpiresAt = jwt.NewNumericDate(now.Add(-time.Minute)) }},
		{name: "future issued at", mutate: func(claims *Claims) { claims.IssuedAt = jwt.NewNumericDate(now.Add(time.Hour)) }},
		{name: "missing issued at", mutate: func(claims *Claims) { claims.IssuedAt = nil }},
		{name: "expiry not after issued at", mutate: func(claims *Claims) { claims.ExpiresAt = claims.IssuedAt }},
		{name: "wrong issuer", mutate: func(claims *Claims) { claims.Issuer = "another-issuer" }},
		{name: "wrong audience", mutate: func(claims *Claims) { claims.Audience = jwt.ClaimStrings{"another-audience"} }},
		{name: "wrong subject", mutate: func(claims *Claims) { claims.Subject = "another-subject" }},
		{name: "missing expiry", mutate: func(claims *Claims) { claims.ExpiresAt = nil }},
	} {
		t.Run(tc.name, func(t *testing.T) {
			claims := validTestClaims()
			tc.mutate(claims)
			token := signTestToken(t, jwt.SigningMethodHS256, claims, testSecret)
			if _, err := ParseToken(testSecret, token); err == nil {
				t.Fatal("ParseToken() error = nil, want rejection")
			}
		})
	}
}

func TestParseTokenRejectsInvalidCustomClaims(t *testing.T) {
	for _, tc := range []struct {
		name   string
		mutate func(*Claims)
	}{
		{name: "invalid user", mutate: func(claims *Claims) { claims.UserID = 0 }},
		{name: "empty session", mutate: func(claims *Claims) { claims.SessionKey = "" }},
		{name: "invalid auth version", mutate: func(claims *Claims) { claims.AuthVersion = 0 }},
		{name: "mismatched jti", mutate: func(claims *Claims) { claims.ID = "another-session" }},
	} {
		t.Run(tc.name, func(t *testing.T) {
			claims := validTestClaims()
			tc.mutate(claims)
			token := signTestToken(t, jwt.SigningMethodHS256, claims, testSecret)
			if _, err := ParseToken(testSecret, token); err == nil {
				t.Fatal("ParseToken() error = nil, want rejection")
			}
		})
	}
}

func TestValidAdminTokenClaimsRequiresOrderedLifetime(t *testing.T) {
	claims := validTestClaims()
	if !validAdminTokenClaims(claims) {
		t.Fatal("validAdminTokenClaims() = false, want true")
	}

	claims.ExpiresAt = claims.IssuedAt
	if validAdminTokenClaims(claims) {
		t.Fatal("validAdminTokenClaims() = true for exp == iat")
	}
}

func TestParseTokenRejectsNonHS256Algorithms(t *testing.T) {
	hs384 := signTestToken(t, jwt.SigningMethodHS384, validTestClaims(), testSecret)
	none := signTestToken(t, jwt.SigningMethodNone, validTestClaims(), jwt.UnsafeAllowNoneSignatureType)

	for name, token := range map[string]string{
		"hs384": hs384,
		"none":  none,
	} {
		t.Run(name, func(t *testing.T) {
			if _, err := ParseToken(testSecret, token); err == nil {
				t.Fatal("ParseToken() error = nil, want algorithm rejection")
			}
		})
	}
}

func validTestClaims() *Claims {
	now := time.Now().UTC()
	return &Claims{
		UserID:      9,
		SessionKey:  "session-9",
		AuthVersion: 3,
		RegisteredClaims: jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(now.Add(time.Hour)),
			IssuedAt:  jwt.NewNumericDate(now.Add(-time.Minute)),
			Issuer:    adminTokenIssuer,
			Audience:  jwt.ClaimStrings{adminTokenAudience},
			Subject:   adminTokenSubject,
			ID:        "session-9",
		},
	}
}

func signTestToken(t *testing.T, method jwt.SigningMethod, claims *Claims, key any) string {
	t.Helper()
	token, err := jwt.NewWithClaims(method, claims).SignedString(key)
	if err != nil {
		t.Fatalf("SignedString() error = %v", err)
	}
	return token
}
