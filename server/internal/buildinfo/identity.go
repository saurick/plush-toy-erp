package buildinfo

import (
	"regexp"
	"strings"
)

const (
	ReleaseVersionEnv = "RELEASE_VERSION"
	GitSHAEnv         = "GIT_SHA"
	LocalVersion      = "local"
)

var (
	releaseVersionPattern = regexp.MustCompile(`^[0-9A-Za-z](?:[0-9A-Za-z._-]{0,62}[0-9A-Za-z])?$`)
	gitSHAPattern         = regexp.MustCompile(`^[0-9a-f]{40}$`)
)

// Identity is the public, non-secret identity embedded in one release build.
// A formal release requires both ReleaseVersion and GitSHA; local development
// deliberately reports "local" without inventing a commit identity.
type Identity struct {
	ReleaseVersion string
	GitSHA         string
}

func Resolve(releaseVersion, gitSHA string) Identity {
	return Identity{
		ReleaseVersion: normalizeReleaseVersion(releaseVersion),
		GitSHA:         normalizeGitSHA(gitSHA),
	}
}

func FromEnv(getenv func(string) string) Identity {
	if getenv == nil {
		return Resolve("", "")
	}
	return Resolve(getenv(ReleaseVersionEnv), getenv(GitSHAEnv))
}

func (identity Identity) GitSHAShort() string {
	if len(identity.GitSHA) < 8 {
		return ""
	}
	return identity.GitSHA[:8]
}

func (identity Identity) IsFormal() bool {
	return identity.ReleaseVersion != "" && identity.ReleaseVersion != LocalVersion && identity.GitSHA != ""
}

func normalizeReleaseVersion(value string) string {
	value = strings.TrimSpace(value)
	if value == "" {
		return LocalVersion
	}
	if !releaseVersionPattern.MatchString(value) {
		return ""
	}
	return value
}

func normalizeGitSHA(value string) string {
	value = strings.ToLower(strings.TrimSpace(value))
	if !gitSHAPattern.MatchString(value) {
		return ""
	}
	return value
}
