// Package unitpolicy defines the shared initialization and source spelling
// catalog. Runtime quantity checks still use the persisted units.precision.
package unitpolicy

import (
	_ "embed"
	"encoding/json"
	"strings"
)

//go:embed units.json
var catalog []byte

type Unit struct {
	Code      string   `json:"code"`
	Name      string   `json:"name"`
	Precision int      `json:"precision"`
	Aliases   []string `json:"aliases"`
}

func Standards() []Unit {
	var units []Unit
	if err := json.Unmarshal(catalog, &units); err != nil {
		panic(err)
	}
	return units
}

func CanonicalLabel(value string) string {
	value = strings.TrimSpace(value)
	for _, unit := range Standards() {
		for _, candidate := range append([]string{unit.Code, unit.Name}, unit.Aliases...) {
			if strings.EqualFold(value, candidate) {
				return unit.Name
			}
		}
	}
	return value
}
