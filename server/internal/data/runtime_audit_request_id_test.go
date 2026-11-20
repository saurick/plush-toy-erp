package data

import (
	"context"
	"encoding/json"
	"testing"

	"server/internal/biz"
	pkglogger "server/pkg/logger"
)

func TestNormalizeRuntimeAuditEventCreateUsesRequestContext(t *testing.T) {
	payload := map[string]any{
		"actor_key":  "boss:17",
		"request_id": "caller-supplied",
	}
	ctx := pkglogger.WithRequestID(context.Background(), " request-authoritative ")

	_, _, _, encoded, err := normalizeRuntimeAuditEventCreate(ctx, &biz.RuntimeAuditEventCreate{
		EventType: " workflow.task.reassign ",
		EventKey:  "task:42",
		Source:    " workflow ",
		Payload:   payload,
	})
	if err != nil {
		t.Fatalf("normalize runtime audit event: %v", err)
	}

	var got map[string]any
	if err := json.Unmarshal([]byte(encoded), &got); err != nil {
		t.Fatalf("decode normalized payload: %v", err)
	}
	if got["request_id"] != "request-authoritative" {
		t.Fatalf("request_id = %#v, want authoritative request context", got["request_id"])
	}
	if got["actor_key"] != "boss:17" {
		t.Fatalf("actor_key = %#v, want preserved payload", got["actor_key"])
	}
	if payload["request_id"] != "caller-supplied" {
		t.Fatalf("input payload mutated: %#v", payload)
	}
}

func TestNormalizeRuntimeAuditEventCreateDropsUntrustedRequestID(t *testing.T) {
	_, _, _, encoded, err := normalizeRuntimeAuditEventCreate(context.Background(), &biz.RuntimeAuditEventCreate{
		EventType: "role.settings.set",
		EventKey:  "role:warehouse",
		Source:    "admin",
		Payload: map[string]any{
			"Request_ID": "caller-supplied",
			"target_key": "warehouse",
		},
	})
	if err != nil {
		t.Fatalf("normalize runtime audit event: %v", err)
	}

	var got map[string]any
	if err := json.Unmarshal([]byte(encoded), &got); err != nil {
		t.Fatalf("decode normalized payload: %v", err)
	}
	if _, ok := got["request_id"]; ok {
		t.Fatalf("untrusted request_id retained: %#v", got)
	}
	if _, ok := got["Request_ID"]; ok {
		t.Fatalf("case-variant request_id retained: %#v", got)
	}
	if got["target_key"] != "warehouse" {
		t.Fatalf("target_key = %#v, want preserved payload", got["target_key"])
	}
}
