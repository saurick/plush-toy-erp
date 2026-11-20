package biz

// Work-center lists show task and progress context per row, so their page budget
// stays below ordinary business tables. Overview previews use explicit limits.
const (
	WorkCenterDefaultLimit = 20
	WorkCenterMaxLimit     = 100
)
