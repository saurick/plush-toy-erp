package biz

import "unicode/utf8"

const (
	AdminPasswordMinLength = 8
	AdminPasswordMaxBytes  = 72
)

// ValidateAdminPassword keeps every administrator credential creation path
// inside bcrypt's input boundary and on the same minimum-length policy.
func ValidateAdminPassword(password string) error {
	if !utf8.ValidString(password) || utf8.RuneCountInString(password) < AdminPasswordMinLength || len(password) > AdminPasswordMaxBytes {
		return ErrBadParam
	}
	return nil
}
