package biz

import (
	"math/big"
	"regexp"
	"strings"
)

var bomVersionNumberPattern = regexp.MustCompile(`(?i)^V([0-9]+)$`)

// NextBOMVersion includes drafts and historical versions. Existing labels are
// never renamed; numeric V-series labels reserve their sequence number.
func NextBOMVersion(versions []string) (string, error) {
	latest := new(big.Int)
	for _, version := range versions {
		match := bomVersionNumberPattern.FindStringSubmatch(strings.TrimSpace(version))
		if match == nil {
			continue
		}
		number, ok := new(big.Int).SetString(match[1], 10)
		if ok && number.Cmp(latest) > 0 {
			latest = number
		}
	}
	version := "V" + latest.Add(latest, big.NewInt(1)).String()
	if len(version) > 64 {
		return "", ErrBadParam
	}
	return version, nil
}
