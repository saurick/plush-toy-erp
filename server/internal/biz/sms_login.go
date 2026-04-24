package biz

import (
	"crypto/rand"
	"errors"
	"fmt"
	"math/big"
	"regexp"
	"strings"
	"sync"
	"time"
	"unicode"
)

const (
	smsLoginCodeTTL         = 5 * time.Minute
	smsLoginCodeCooldown    = time.Minute
	smsLoginCodeMaxAttempts = 5
	smsLoginCodeDigits      = 6
)

var (
	ErrInvalidPhoneNumber      = errors.New("invalid phone number")
	ErrSMSCodeCooldown         = errors.New("sms code cooldown")
	ErrSMSCodeNotFound         = errors.New("sms code not found")
	ErrSMSCodeExpired          = errors.New("sms code expired")
	ErrSMSCodeInvalid          = errors.New("sms code invalid")
	ErrSMSCodeAttemptsExceeded = errors.New("sms code attempts exceeded")
	mainlandMobilePhonePattern = regexp.MustCompile(`^1[3-9]\d{9}$`)
)

type SMSLoginChallenge struct {
	Phone        string
	ExpiresAt    time.Time
	ResendAfter  time.Time
	MockDelivery bool
	MockCode     string
}

type smsLoginCodeEntry struct {
	code         string
	expiresAt    time.Time
	resendAfter  time.Time
	attemptsLeft int
}

type SMSLoginCodeManager struct {
	mu      sync.Mutex
	entries map[string]smsLoginCodeEntry
	now     func() time.Time
}

func NewSMSLoginCodeManager() *SMSLoginCodeManager {
	return &SMSLoginCodeManager{
		entries: make(map[string]smsLoginCodeEntry),
		now:     time.Now,
	}
}

func NormalizeLoginPhone(raw string) (string, error) {
	text := strings.TrimSpace(raw)
	if text == "" {
		return "", ErrInvalidPhoneNumber
	}

	var b strings.Builder
	for _, r := range text {
		if unicode.IsSpace(r) || r == '-' || r == '(' || r == ')' {
			continue
		}
		b.WriteRune(r)
	}

	phone := b.String()
	if strings.HasPrefix(phone, "+86") {
		phone = strings.TrimPrefix(phone, "+86")
	} else if strings.HasPrefix(phone, "86") && len(phone) == 13 {
		phone = strings.TrimPrefix(phone, "86")
	}

	if !mainlandMobilePhonePattern.MatchString(phone) {
		return "", ErrInvalidPhoneNumber
	}
	return phone, nil
}

func (m *SMSLoginCodeManager) Request(scope, phone string) (*SMSLoginChallenge, error) {
	if m == nil {
		m = NewSMSLoginCodeManager()
	}
	normalizedPhone, err := NormalizeLoginPhone(phone)
	if err != nil {
		return nil, err
	}

	now := m.now()
	key := smsLoginCodeKey(scope, normalizedPhone)

	m.mu.Lock()
	defer m.mu.Unlock()

	if entry, ok := m.entries[key]; ok && now.Before(entry.resendAfter) && now.Before(entry.expiresAt) {
		return nil, ErrSMSCodeCooldown
	}

	code, err := generateSMSLoginCode()
	if err != nil {
		return nil, err
	}

	entry := smsLoginCodeEntry{
		code:         code,
		expiresAt:    now.Add(smsLoginCodeTTL),
		resendAfter:  now.Add(smsLoginCodeCooldown),
		attemptsLeft: smsLoginCodeMaxAttempts,
	}
	m.entries[key] = entry

	return &SMSLoginChallenge{
		Phone:        normalizedPhone,
		ExpiresAt:    entry.expiresAt,
		ResendAfter:  entry.resendAfter,
		MockDelivery: true,
		MockCode:     code,
	}, nil
}

func (m *SMSLoginCodeManager) Verify(scope, phone, code string) (string, error) {
	if m == nil {
		return "", ErrSMSCodeNotFound
	}
	normalizedPhone, err := NormalizeLoginPhone(phone)
	if err != nil {
		return "", err
	}
	normalizedCode := strings.TrimSpace(code)
	if normalizedCode == "" {
		return "", ErrSMSCodeInvalid
	}

	now := m.now()
	key := smsLoginCodeKey(scope, normalizedPhone)

	m.mu.Lock()
	defer m.mu.Unlock()

	entry, ok := m.entries[key]
	if !ok {
		return "", ErrSMSCodeNotFound
	}
	if !now.Before(entry.expiresAt) {
		delete(m.entries, key)
		return "", ErrSMSCodeExpired
	}
	if entry.code != normalizedCode {
		entry.attemptsLeft--
		if entry.attemptsLeft <= 0 {
			delete(m.entries, key)
			return "", ErrSMSCodeAttemptsExceeded
		}
		m.entries[key] = entry
		return "", ErrSMSCodeInvalid
	}

	delete(m.entries, key)
	return normalizedPhone, nil
}

func smsLoginCodeKey(scope, phone string) string {
	normalizedScope := "user"
	if strings.EqualFold(strings.TrimSpace(scope), "admin") {
		normalizedScope = "admin"
	}
	return normalizedScope + ":" + phone
}

func generateSMSLoginCode() (string, error) {
	max := big.NewInt(1)
	for i := 0; i < smsLoginCodeDigits; i++ {
		max.Mul(max, big.NewInt(10))
	}
	n, err := rand.Int(rand.Reader, max)
	if err != nil {
		return "", err
	}
	return fmt.Sprintf("%0*d", smsLoginCodeDigits, n.Int64()), nil
}
