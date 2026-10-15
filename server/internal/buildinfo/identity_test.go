package buildinfo

import "testing"

func TestResolveFormalIdentity(t *testing.T) {
	identity := Resolve(
		"yoyoosun-20260810.1",
		"20C96D3819429361A35D2551B63B211F055DE37E",
	)
	if identity.ReleaseVersion != "yoyoosun-20260810.1" {
		t.Fatalf("unexpected release version: %q", identity.ReleaseVersion)
	}
	if identity.GitSHA != "20c96d3819429361a35d2551b63b211f055de37e" {
		t.Fatalf("unexpected git SHA: %q", identity.GitSHA)
	}
	if identity.GitSHAShort() != "20c96d38" || !identity.IsFormal() {
		t.Fatalf("unexpected formal identity: %#v", identity)
	}
}

func TestResolveLocalAndInvalidIdentity(t *testing.T) {
	local := Resolve("", "")
	if local.ReleaseVersion != LocalVersion || local.GitSHA != "" || local.IsFormal() {
		t.Fatalf("unexpected local identity: %#v", local)
	}

	invalid := Resolve(" unsafe version ", "not-a-sha")
	if invalid.ReleaseVersion != "" || invalid.GitSHA != "" || invalid.IsFormal() {
		t.Fatalf("invalid input must not be exposed: %#v", invalid)
	}
}

func TestFromEnv(t *testing.T) {
	values := map[string]string{
		ReleaseVersionEnv: "release-20260810",
		GitSHAEnv:         "20c96d3819429361a35d2551b63b211f055de37e",
	}
	identity := FromEnv(func(key string) string { return values[key] })
	if identity.ReleaseVersion != values[ReleaseVersionEnv] || identity.GitSHA != values[GitSHAEnv] {
		t.Fatalf("unexpected env identity: %#v", identity)
	}
}
