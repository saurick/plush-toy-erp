package biz

import (
	"os"
	"strings"
	"testing"
)

func TestTraceAttributesDoNotExposeUserIdentifiers(t *testing.T) {
	files := []string{
		"auth.go",
		"admin_auth.go",
		"admin_manage.go",
	}
	forbiddenKeys := []string{
		`"` + "auth.username" + `"`,
		`"` + "admin_auth.username" + `"`,
		`"` + "admin.username" + `"`,
	}

	for _, file := range files {
		content, err := os.ReadFile(file)
		if err != nil {
			t.Fatalf("read %s: %v", file, err)
		}
		for _, key := range forbiddenKeys {
			if strings.Contains(string(content), key) {
				t.Fatalf("%s must not expose trace attribute %s", file, key)
			}
		}
	}
}
