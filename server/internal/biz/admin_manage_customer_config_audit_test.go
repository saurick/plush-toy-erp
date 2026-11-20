package biz

import "testing"

func TestEnrichRuntimeAuditEventCustomerConfigSummary(t *testing.T) {
	tests := []struct {
		name        string
		eventKey    string
		actionLabel string
		summary     string
	}{
		{
			name:        "activate",
			eventKey:    "customer_config.activate",
			actionLabel: "客户配置激活",
			summary:     "99 激活了客户配置 yoyoosun/rev-1",
		},
		{
			name:        "rollback",
			eventKey:    "customer_config.rollback",
			actionLabel: "客户配置回滚",
			summary:     "99 回滚了客户配置 yoyoosun/rev-1",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			event := EnrichRuntimeAuditEvent(RuntimeAuditEvent{
				EventKey: tt.eventKey,
				Payload: map[string]any{
					"actor": map[string]any{"id": 99},
					"target": map[string]any{
						"type": "customer_config_revision",
						"key":  "yoyoosun/rev-1",
					},
				},
			})

			if event.ActorKey != "99" {
				t.Fatalf("ActorKey = %q", event.ActorKey)
			}
			if event.ActionLabel != tt.actionLabel {
				t.Fatalf("ActionLabel = %q", event.ActionLabel)
			}
			if event.RiskLevel != "high" {
				t.Fatalf("RiskLevel = %q", event.RiskLevel)
			}
			if event.Summary != tt.summary {
				t.Fatalf("Summary = %q", event.Summary)
			}
		})
	}
}
