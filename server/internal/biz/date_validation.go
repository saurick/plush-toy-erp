package biz

import "time"

func validateOptionalDateNotBefore(start time.Time, next *time.Time) error {
	if next != nil && next.Before(start) {
		return ErrBadParam
	}
	return nil
}
