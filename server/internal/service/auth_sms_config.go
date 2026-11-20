package service

import (
	"strings"

	"server/internal/conf"
)

const (
	authSMSModeDisabled = "disabled"
	authSMSModeMock     = "mock"
	authSMSModeProvider = "provider"
)

type authSMSRuntimeConfig struct {
	Mode           string
	Enabled        bool
	MockDelivery   bool
	DisabledReason string
}

func newAuthSMSRuntimeConfig(c *conf.Data) authSMSRuntimeConfig {
	mode := ""
	if c != nil && c.Auth != nil && c.Auth.Sms != nil {
		mode = c.Auth.Sms.Mode
	}
	return normalizeAuthSMSRuntimeConfig(mode)
}

func normalizeAuthSMSRuntimeConfig(mode string) authSMSRuntimeConfig {
	switch strings.ToLower(strings.TrimSpace(mode)) {
	case authSMSModeMock:
		return authSMSRuntimeConfig{
			Mode:         authSMSModeMock,
			Enabled:      true,
			MockDelivery: true,
		}
	case authSMSModeProvider:
		return authSMSRuntimeConfig{
			Mode:    authSMSModeProvider,
			Enabled: true,
		}
	case "", authSMSModeDisabled:
		return authSMSRuntimeConfig{
			Mode:           authSMSModeDisabled,
			DisabledReason: "短信登录未启用",
		}
	default:
		return authSMSRuntimeConfig{
			Mode:           authSMSModeDisabled,
			DisabledReason: "短信登录配置不合法",
		}
	}
}

func authSMSCapabilitiesToMap(config authSMSRuntimeConfig) map[string]any {
	if strings.TrimSpace(config.Mode) == "" && !config.Enabled {
		config = normalizeAuthSMSRuntimeConfig("")
	}
	return map[string]any{
		"sms_login": map[string]any{
			"enabled":         config.Enabled,
			"mode":            config.Mode,
			"mock_delivery":   config.MockDelivery,
			"disabled_reason": config.DisabledReason,
		},
	}
}
