package data

import "time"

func endOfDateFilter(value time.Time) time.Time {
	if value.Hour() == 0 && value.Minute() == 0 && value.Second() == 0 && value.Nanosecond() == 0 {
		return value.AddDate(0, 0, 1).Add(-time.Nanosecond)
	}
	return value
}
