package devdbguard

import (
	_ "embed"
	"encoding/json"
	"os"
	"strings"
)

// The maintenance scripts read the same endpoint contract as the server.
//
//go:embed development-targets.json
var developmentTargetsJSON []byte

type developmentTarget struct {
	Host                string `json:"host"`
	Port                uint16 `json:"port"`
	Database            string `json:"database"`
	SystemIdentifier    string `json:"systemIdentifier"`
	SystemIdentifierEnv string `json:"systemIdentifierEnv"`
}

var developmentTargets = func() map[string]developmentTarget {
	var targets map[string]developmentTarget
	if err := json.Unmarshal(developmentTargetsJSON, &targets); err != nil {
		panic(err)
	}
	return targets
}()

var (
	CustomerConfigLocalTestHost             = developmentTargets["shared"].Host
	CustomerConfigLocalTestPort             = developmentTargets["shared"].Port
	CustomerConfigLocalTestSystemIdentifier = developmentTargets["shared"].SystemIdentifier
)

func registeredDevelopmentEndpoint(host string, port uint16) bool {
	for _, target := range developmentTargets {
		if host == target.Host && port == target.Port {
			return true
		}
	}
	return false
}

func expectedDevelopmentSystemIdentifier(host string, port uint16) string {
	for _, target := range developmentTargets {
		if host != target.Host || port != target.Port {
			continue
		}
		if target.SystemIdentifier != "" {
			return target.SystemIdentifier
		}
		// Orb identity is captured from the protected role file in the runtime
		// bundle. It must never accept the remote cluster through a tunnel.
		identity := strings.TrimSpace(os.Getenv(target.SystemIdentifierEnv))
		if len(identity) > 20 || !allDecimalDigits(identity) || identity == "0" || identity == CustomerConfigLocalTestSystemIdentifier {
			return ""
		}
		return identity
	}
	return ""
}
