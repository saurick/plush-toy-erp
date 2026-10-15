package factguard

import (
	"strings"
	"testing"
	"time"

	"entgo.io/ent"
)

type createMutation struct {
	ent.Mutation
	op     ent.Op
	fields map[string]ent.Value
}

func (m *createMutation) Op() ent.Op {
	return m.op
}

func (m *createMutation) Field(name string) (ent.Value, bool) {
	value, ok := m.fields[name]
	return value, ok
}

func TestRejectCreateBypass(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name             string
		fields           map[string]ent.Value
		additionalFields []string
		wantErr          string
	}{
		{name: "draft", fields: map[string]ent.Value{"status": "DRAFT"}},
		{name: "posted", fields: map[string]ent.Value{"status": "POSTED"}, wantErr: "must be created as DRAFT"},
		{name: "cancelled", fields: map[string]ent.Value{"status": "CANCELLED"}, wantErr: "must be created as DRAFT"},
		{name: "missing status", fields: map[string]ent.Value{}, wantErr: "must be created as DRAFT"},
		{
			name:    "draft with posted time",
			fields:  map[string]ent.Value{"status": "DRAFT", "posted_at": time.Now()},
			wantErr: "must be created without posted_at",
		},
		{
			name:             "draft with settled time",
			fields:           map[string]ent.Value{"status": "DRAFT", "settled_at": time.Now()},
			additionalFields: []string{"settled_at"},
			wantErr:          "must be created without settled_at",
		},
	}

	for _, tt := range tests {
		tt := tt
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()
			err := RejectCreateBypass(
				&createMutation{op: ent.OpCreate, fields: tt.fields},
				"operational_fact",
				tt.additionalFields,
			)
			if tt.wantErr == "" {
				if err != nil {
					t.Fatalf("RejectCreateBypass() error = %v", err)
				}
				return
			}
			if err == nil || !strings.Contains(err.Error(), tt.wantErr) {
				t.Fatalf("RejectCreateBypass() error = %v, want substring %q", err, tt.wantErr)
			}
		})
	}
}
