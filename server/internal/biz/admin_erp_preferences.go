package biz

import (
	_ "embed"
	"encoding/json"
	"slices"
	"strings"
)

//go:embed admin_erp_appearance.json
var adminERPAppearanceContractJSON []byte

type adminERPAppearanceOptions struct {
	ThemeModes []string           `json:"theme_modes"`
	Accents    []string           `json:"accents"`
	Densities  []string           `json:"densities"`
	TableLines []string           `json:"table_lines"`
	Defaults   AdminERPAppearance `json:"defaults"`
}

var adminERPAppearanceContract = func() adminERPAppearanceOptions {
	var contract adminERPAppearanceOptions
	if err := json.Unmarshal(adminERPAppearanceContractJSON, &contract); err != nil {
		panic(err)
	}
	return contract
}()

type AdminERPAppearance struct {
	ThemeMode  string `json:"theme_mode"`
	Accent     string `json:"accent"`
	Density    string `json:"density"`
	TableLines string `json:"tableLines"`
}

type AdminERPAppearancePatch struct {
	ThemeMode  *string
	Accent     *string
	Density    *string
	TableLines *string
}

func (patch AdminERPAppearancePatch) Validate() error {
	if patch.ThemeMode == nil && patch.Accent == nil && patch.Density == nil && patch.TableLines == nil {
		return ErrBadParam
	}
	if patch.ThemeMode != nil && !slices.Contains(adminERPAppearanceContract.ThemeModes, *patch.ThemeMode) ||
		patch.Accent != nil && !slices.Contains(adminERPAppearanceContract.Accents, *patch.Accent) ||
		patch.Density != nil && !slices.Contains(adminERPAppearanceContract.Densities, *patch.Density) ||
		patch.TableLines != nil && !slices.Contains(adminERPAppearanceContract.TableLines, *patch.TableLines) {
		return ErrBadParam
	}
	return nil
}

func (patch AdminERPAppearancePatch) Apply(current AdminERPAppearance) AdminERPAppearance {
	if patch.ThemeMode != nil {
		current.ThemeMode = *patch.ThemeMode
	}
	if patch.Accent != nil {
		current.Accent = *patch.Accent
	}
	if patch.Density != nil {
		current.Density = *patch.Density
	}
	if patch.TableLines != nil {
		current.TableLines = *patch.TableLines
	}
	return NormalizeAdminERPAppearance(current)
}

func NormalizeAdminERPAppearance(input AdminERPAppearance) AdminERPAppearance {
	defaults := adminERPAppearanceContract.Defaults
	if !slices.Contains(adminERPAppearanceContract.ThemeModes, input.ThemeMode) {
		input.ThemeMode = defaults.ThemeMode
	}
	if !slices.Contains(adminERPAppearanceContract.Accents, input.Accent) {
		input.Accent = defaults.Accent
	}
	if !slices.Contains(adminERPAppearanceContract.Densities, input.Density) {
		input.Density = defaults.Density
	}
	if !slices.Contains(adminERPAppearanceContract.TableLines, input.TableLines) {
		input.TableLines = defaults.TableLines
	}
	return input
}

type AdminERPPreferences struct {
	ColumnOrders  map[string][]string `json:"column_orders,omitempty"`
	HiddenColumns map[string][]string `json:"hidden_columns,omitempty"`
	Appearance    AdminERPAppearance  `json:"appearance"`
}

func NormalizeAdminERPPreferences(input AdminERPPreferences) AdminERPPreferences {
	return AdminERPPreferences{
		ColumnOrders:  normalizeAdminERPColumnMap(input.ColumnOrders),
		HiddenColumns: normalizeAdminERPColumnMap(input.HiddenColumns),
		Appearance:    NormalizeAdminERPAppearance(input.Appearance),
	}
}

func normalizeAdminERPColumnMap(input map[string][]string) map[string][]string {
	out := map[string][]string{}
	for rawModuleKey, rawOrder := range input {
		moduleKey := normalizeAdminERPPreferenceModuleKey(rawModuleKey)
		if moduleKey == "" {
			continue
		}
		normalizedOrder := NormalizeAdminERPColumnOrder(rawOrder)
		if len(normalizedOrder) == 0 {
			continue
		}
		out[moduleKey] = normalizedOrder
	}
	if len(out) == 0 {
		return nil
	}
	return out
}

func NormalizeAdminERPColumnOrder(input []string) []string {
	seen := make(map[string]struct{}, len(input))
	out := make([]string, 0, len(input))
	for _, rawValue := range input {
		value := strings.TrimSpace(rawValue)
		if value == "" {
			continue
		}
		if _, exists := seen[value]; exists {
			continue
		}
		seen[value] = struct{}{}
		out = append(out, value)
	}
	return out
}

func normalizeAdminERPPreferenceModuleKey(input string) string {
	value := strings.TrimSpace(input)
	if value == "" {
		return ""
	}
	if len(value) > 128 {
		return value[:128]
	}
	return value
}
