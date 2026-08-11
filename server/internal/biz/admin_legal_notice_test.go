package biz

import (
	"context"
	"encoding/json"
	"io"
	"strings"
	"testing"
	"time"

	"github.com/go-kratos/kratos/v2/log"
	tracesdk "go.opentelemetry.io/otel/sdk/trace"
)

func legalNoticeTestUsecase(t *testing.T) (*AdminManageUsecase, *stubAdminManageRepo, context.Context) {
	t.Helper()
	repo := newStubAdminManageRepo()
	repo.adminsByID[7] = &AdminUser{ID: 7, Username: "worker"}
	repo.adminsByName["worker"] = repo.adminsByID[7]
	uc := NewAdminManageUsecase(repo, log.NewStdLogger(io.Discard), tracesdk.NewTracerProvider())
	ctx := NewContextWithClaims(context.Background(), &AuthClaims{
		UserID:   7,
		Username: "worker",
		Role:     RoleAdmin,
	})
	return uc, repo, ctx
}

func TestAdminManageUsecase_LegalNoticeAcknowledgementIsVersionedAndIdempotent(t *testing.T) {
	uc, repo, ctx := legalNoticeTestUsecase(t)

	before, err := uc.GetLegalNoticeStatus(ctx, "2026-08-11.1", "0123456789abcdef")
	if err != nil {
		t.Fatalf("GetLegalNoticeStatus() error = %v", err)
	}
	if before.Acknowledged {
		t.Fatal("fresh legal notice must not be acknowledged")
	}

	acknowledged, err := uc.AcknowledgeLegalNotice(ctx, "2026-08-11.1", "0123456789abcdef")
	if err != nil {
		t.Fatalf("AcknowledgeLegalNotice() error = %v", err)
	}
	if !acknowledged.Acknowledged || acknowledged.AcknowledgedAt == nil {
		t.Fatalf("unexpected acknowledgement = %#v", acknowledged)
	}
	if len(repo.auditEvents) != 1 {
		t.Fatalf("audit event count = %d, want 1", len(repo.auditEvents))
	}

	replayed, err := uc.AcknowledgeLegalNotice(ctx, "2026-08-11.1", "0123456789abcdef")
	if err != nil || !replayed.Acknowledged {
		t.Fatalf("replayed acknowledgement = %#v, err = %v", replayed, err)
	}
	if len(repo.auditEvents) != 1 {
		t.Fatalf("idempotent replay created %d events", len(repo.auditEvents))
	}

	changed, err := uc.GetLegalNoticeStatus(ctx, "2026-08-11.1", "fedcba9876543210")
	if err != nil {
		t.Fatalf("changed status error = %v", err)
	}
	if changed.Acknowledged {
		t.Fatal("changed content fingerprint must require a new acknowledgement")
	}
}

func TestBuildLegalNoticeAcknowledgementAuditEventStoresNoCredentialOrPhone(t *testing.T) {
	admin := &AdminUser{ID: 7, Username: "worker", Phone: "13800138000"}
	event, err := BuildLegalNoticeAcknowledgementAuditEvent(
		admin,
		"2026-08-11.1",
		"0123456789abcdef",
		time.Date(2026, time.August, 11, 0, 0, 0, 0, time.UTC),
	)
	if err != nil {
		t.Fatalf("BuildLegalNoticeAcknowledgementAuditEvent() error = %v", err)
	}
	encoded, err := json.Marshal(event.Payload)
	if err != nil {
		t.Fatalf("json.Marshal() error = %v", err)
	}
	payload := string(encoded)
	for _, forbidden := range []string{"13800138000", "password", "token"} {
		if strings.Contains(payload, forbidden) {
			t.Fatalf("audit payload contains forbidden value %q: %s", forbidden, payload)
		}
	}
	enriched := EnrichRuntimeAuditEvent(RuntimeAuditEvent{
		EventType: event.EventType,
		EventKey:  event.EventKey,
		Source:    event.Source,
		Payload:   event.Payload,
	})
	if enriched.ActionLabel != "隐私与使用规则知悉" || enriched.RiskLevel != "normal" {
		t.Fatalf("unexpected enriched event = %#v", enriched)
	}
}

func TestAdminManageUsecase_LegalNoticeRejectsInvalidIdentity(t *testing.T) {
	uc, _, ctx := legalNoticeTestUsecase(t)
	for _, input := range []struct {
		version     string
		fingerprint string
	}{
		{version: "", fingerprint: "0123456789abcdef"},
		{version: "2026/08/11", fingerprint: "0123456789abcdef"},
		{version: "2026-08-11.1", fingerprint: "not-a-fingerprint"},
	} {
		if _, err := uc.GetLegalNoticeStatus(ctx, input.version, input.fingerprint); err != ErrBadParam {
			t.Fatalf("GetLegalNoticeStatus(%q, %q) error = %v", input.version, input.fingerprint, err)
		}
	}
}
