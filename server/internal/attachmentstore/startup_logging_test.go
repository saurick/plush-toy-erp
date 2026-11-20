package attachmentstore

import (
	"bytes"
	"github.com/go-kratos/kratos/v2/log"
	"strings"
	"testing"
)

func TestStorageStartupLogIncludesTargetWithoutCredentials(t *testing.T) {
	t.Setenv("ATTACHMENT_S3_ENDPOINT", "http://objects.example:8333/")
	t.Setenv("ATTACHMENT_S3_BUCKET", "erp-private-test")
	t.Setenv("ATTACHMENT_S3_REGION", "")
	t.Setenv("ATTACHMENT_S3_ACCESS_KEY_ID", "private-access")
	t.Setenv("ATTACHMENT_S3_SECRET_ACCESS_KEY", "private-secret")
	var output bytes.Buffer
	if _, err := NewFromEnv(log.NewStdLogger(&output)); err != nil {
		t.Fatal(err)
	}
	text := output.String()
	for _, want := range []string{"endpoint=http://objects.example:8333", "bucket=erp-private-test", "region=us-east-1"} {
		if !strings.Contains(text, want) {
			t.Fatalf("missing %s in %s", want, text)
		}
	}
	if strings.Contains(text, "private-access") || strings.Contains(text, "private-secret") {
		t.Fatalf("unsafe log: %s", text)
	}
}
