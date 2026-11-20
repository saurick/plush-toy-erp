package service

import (
	"context"
	"testing"

	"server/internal/biz"
	"server/internal/errcode"
)

func (r *stubAttachmentJSONRPCRepo) ListProductImageReferences(_ context.Context, ids []int) (map[int]int, error) {
	r.listCalls++
	out := make(map[int]int)
	for _, id := range ids {
		out[id] = 0
		if r.current != nil && r.current.OwnerID == id {
			out[id] = r.current.ID
		}
	}
	return out, nil
}

func TestJsonrpcProductImageReferencesRequiresActiveSession(t *testing.T) {
	for _, name := range []string{"anonymous", "disabled", "super-admin"} {
		t.Run(name, func(t *testing.T) {
			admin := workflowJSONRPCAdmin([]string{biz.EngineeringRoleKey}, biz.PermissionProductRead)
			ctx := workflowJSONRPCAdminContext()
			if name == "anonymous" {
				ctx = context.Background()
			}
			admin.Disabled = name == "disabled"
			admin.IsSuperAdmin = name == "super-admin"
			repo := &stubAttachmentJSONRPCRepo{}
			d := newAttachmentJSONRPCTestDispatcher(t, repo, admin)
			_, result, err := d.handleBusinessAttachment(ctx, "list_product_image_references", "session", mustJSONRPCStruct(t, map[string]any{"product_ids": []any{7}}))
			if err != nil {
				t.Fatal(err)
			}
			if name == "super-admin" {
				if result.Code != 0 || repo.listCalls != 1 {
					t.Fatalf("valid session rejected: %#v", result)
				}
			} else if result.Code == 0 || repo.listCalls != 0 {
				t.Fatalf("inactive session read image references: %#v calls=%d", result, repo.listCalls)
			}
		})
	}
}

func TestJsonrpcProductImageReferencesPermissionAndBounds(t *testing.T) {
	for _, permitted := range []bool{false, true} {
		t.Run(map[bool]string{false: "forbidden", true: "allowed"}[permitted], func(t *testing.T) {
			repo := &stubAttachmentJSONRPCRepo{current: &biz.BusinessAttachment{ID: 71, OwnerID: 7}}
			admin := workflowJSONRPCAdmin(nil)
			if permitted {
				admin = workflowJSONRPCAdmin([]string{biz.EngineeringRoleKey}, biz.PermissionProductRead)
			}
			d := newAttachmentJSONRPCTestDispatcher(t, repo, admin)
			_, result, err := d.handleBusinessAttachment(workflowJSONRPCAdminContext(), "list_product_image_references", "images", mustJSONRPCStruct(t, map[string]any{"product_ids": []any{7, 8}}))
			if err != nil {
				t.Fatal(err)
			}
			if !permitted {
				if result.Code != errcode.PermissionDenied.Code || repo.listCalls != 0 {
					t.Fatalf("permission leak: %#v calls=%d", result, repo.listCalls)
				}
				return
			}
			if result.Code != 0 || repo.listCalls != 1 || repo.contentCalls != 0 {
				t.Fatalf("unexpected result %#v", result)
			}
			rows := result.Data.AsMap()["images"].([]any)
			if len(rows) != 2 {
				t.Fatalf("missing reference rows: %v", rows)
			}
			for _, row := range rows {
				if len(row.(map[string]any)) != 2 {
					t.Fatal("batch exposed image content or metadata")
				}
			}
			for _, ids := range []any{nil, []any{}, []any{0}, []any{1.5}, []any{"7"}, make([]any, 81)} {
				_, r, _ := d.handleBusinessAttachment(workflowJSONRPCAdminContext(), "list_product_image_references", "invalid", mustJSONRPCStruct(t, map[string]any{"product_ids": ids}))
				if r.Code == 0 || repo.listCalls != 1 {
					t.Fatalf("invalid ids accepted: %v", ids)
				}
			}
		})
	}
}
