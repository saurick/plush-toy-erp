// Package commandconfig reads configuration for repository maintenance commands.
// Target authorization stays with each command and devdbguard.
package commandconfig

import (
	"errors"
	"fmt"
	"net/url"
	"os"
	"path/filepath"
	"strings"

	"gopkg.in/yaml.v3"
)

type bootstrapConfig struct {
	Data struct {
		Postgres struct {
			DSN string `yaml:"dsn"`
		} `yaml:"postgres"`
	} `yaml:"data"`
}

// ResolvePostgresDSN gives POSTGRES_DSN precedence over config and its local override.
// An explicit .local config is read once; an absent optional override is allowed.
func ResolvePostgresDSN(confPath string) (string, error) {
	if dsn := strings.TrimSpace(os.Getenv("POSTGRES_DSN")); dsn != "" {
		return dsn, nil
	}
	dsn, err := readPostgresDSN(confPath)
	if err != nil {
		return "", err
	}
	ext := filepath.Ext(confPath)
	if ext != "" && !strings.HasSuffix(confPath, ".local"+ext) {
		localPath := strings.TrimSuffix(confPath, ext) + ".local" + ext
		if _, statErr := os.Lstat(localPath); statErr == nil {
			info, targetErr := os.Stat(localPath)
			if targetErr != nil {
				return "", fmt.Errorf("inspect local config: %w", targetErr)
			}
			if !info.Mode().IsRegular() {
				return "", fmt.Errorf("local config must be a regular file: %s", localPath)
			}
			localDSN, readErr := readPostgresDSN(localPath)
			if readErr != nil {
				return "", readErr
			}
			if localDSN != "" {
				dsn = localDSN
			}
		} else if statErr != nil && !errors.Is(statErr, os.ErrNotExist) {
			return "", fmt.Errorf("inspect local config: %w", statErr)
		}
	}
	if dsn == "" {
		return "", fmt.Errorf("postgres dsn is empty in %s", confPath)
	}
	return dsn, nil
}

func readPostgresDSN(path string) (string, error) {
	raw, err := os.ReadFile(path)
	if err != nil {
		return "", fmt.Errorf("read config failed: %w", err)
	}
	var cfg bootstrapConfig
	if err := yaml.Unmarshal(raw, &cfg); err != nil {
		return "", fmt.Errorf("parse config failed in %s", path)
	}
	return strings.TrimSpace(cfg.Data.Postgres.DSN), nil
}

// NormalizePostgresURL canonicalizes the scheme without changing target identity.
func NormalizePostgresURL(raw string) (string, error) {
	u, err := url.Parse(strings.TrimSpace(raw))
	if err != nil {
		return "", errors.New("invalid postgres URL")
	}
	if u.Scheme != "postgres" && u.Scheme != "postgresql" {
		return "", fmt.Errorf("unsupported scheme %q", u.Scheme)
	}
	if strings.TrimPrefix(u.Path, "/") == "" {
		return "", errors.New("postgres dsn missing db name")
	}
	q := u.Query()
	if q.Get("sslmode") == "" {
		q.Set("sslmode", "disable")
	}
	u.Scheme = "postgres"
	u.RawQuery = q.Encode()
	return u.String(), nil
}
