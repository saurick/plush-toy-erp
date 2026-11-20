package commandconfig

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"
)

// GuardSeedProduction protects each seed command unless its production override was explicitly set.
func GuardSeedProduction(confPath string, allowProd bool, operation string) error {
	if allowProd {
		return nil
	}
	normalizedConf := filepath.ToSlash(strings.ToLower(confPath))
	if strings.Contains(normalizedConf, "/prod/") || strings.Contains(normalizedConf, "configs/prod") {
		return fmt.Errorf("refuse to %s with prod config; pass --allow-prod only for an intentional controlled operation", operation)
	}
	for _, key := range []string{"APP_ENV", "ERP_ENV", "GO_ENV"} {
		if strings.EqualFold(strings.TrimSpace(os.Getenv(key)), "prod") || strings.EqualFold(strings.TrimSpace(os.Getenv(key)), "production") {
			return fmt.Errorf("refuse to %s when %s=%s; pass --allow-prod only for an intentional controlled operation", operation, key, os.Getenv(key))
		}
	}
	return nil
}
