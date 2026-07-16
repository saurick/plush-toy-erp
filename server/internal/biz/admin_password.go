package biz

import "unicode/utf8"

const (
	AdminPasswordMinLength = 8
	AdminPasswordMaxLength = 20
	AdminPasswordMaxBytes  = 72
)

// ValidateAdminPassword keeps every administrator credential creation path
// inside bcrypt's input boundary and on the same 8-to-20-character policy.
func ValidateAdminPassword(password string) error {
	length := utf8.RuneCountInString(password)
	if !utf8.ValidString(password) || length < AdminPasswordMinLength || length > AdminPasswordMaxLength || len(password) > AdminPasswordMaxBytes {
		return ErrBadParam
	}
	return nil
}
