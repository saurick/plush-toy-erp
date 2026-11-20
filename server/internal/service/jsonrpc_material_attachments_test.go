package service

import (
	"context"
	"testing"

	"server/internal/biz"
	"server/internal/errcode"
)

func (r *stubAttachmentJSONRPCRepo) ListMaterialImageReferences(ctx context.Context, ids []int) (map[int]int, error) {
	return r.ListProductImageReferences(ctx, ids)
}

func (r *stubAttachmentJSONRPCRepo) ClearMaterialImage(_ context.Context, materialID, attachmentID int) error {
	r.clearCalls++
	r.clearMaterial = materialID
	r.clearAttachmentID = attachmentID
	return nil
}

func TestRPCDocumentedMaterialAttachments(t *testing.T) {
	ctx := workflowJSONRPCAdminContext()
	t.Run("list_material_image_references", func(t *testing.T) {
		params := mustJSONRPCStruct(t, map[string]any{"material_ids": []any{7, 8, 7}})
		repo := &stubAttachmentJSONRPCRepo{current: &biz.BusinessAttachment{ID: 71, OwnerType: biz.BusinessAttachmentOwnerMaterial, OwnerID: 7}}
		denied := newAttachmentJSONRPCTestDispatcher(t, repo, workflowJSONRPCAdmin([]string{biz.EngineeringRoleKey}, biz.PermissionProductRead))
		_, res, err := denied.handleBusinessAttachment(ctx, "list_material_image_references", "denied", params)
		if err != nil || res.Code != errcode.PermissionDenied.Code || repo.listCalls != 0 {
			t.Fatalf("product access authorized material image: %#v, %v", res, err)
		}
		allowed := newAttachmentJSONRPCTestDispatcher(t, repo, workflowJSONRPCAdmin([]string{biz.EngineeringRoleKey}, biz.PermissionMaterialRead))
		_, res, err = allowed.handleBusinessAttachment(ctx, "list_material_image_references", "allowed", params)
		if err != nil || res.Code != 0 || repo.listCalls != 1 || repo.contentCalls != 0 {
			t.Fatalf("material references failed: %#v, %v", res, err)
		}
		rows := res.Data.AsMap()["images"].([]any)
		refs := map[int]int{}
		for _, value := range rows {
			row := value.(map[string]any)
			if len(row) != 2 {
				t.Fatalf("reference exposes metadata: %v", row)
			}
			refs[int(row["material_id"].(float64))] = int(row["image_attachment_id"].(float64))
		}
		if len(refs) != 2 || refs[7] != 71 || refs[8] != 0 {
			t.Fatalf("unexpected references: %v", refs)
		}
	})
	t.Run("clear_material_image", func(t *testing.T) {
		params := mustJSONRPCStruct(t, map[string]any{"material_id": 7, "id": 71})
		repo := &stubAttachmentJSONRPCRepo{}
		denied := newAttachmentJSONRPCTestDispatcher(t, repo, workflowJSONRPCAdmin([]string{biz.EngineeringRoleKey}, biz.PermissionMaterialRead, biz.PermissionProductUpdate))
		_, res, err := denied.handleBusinessAttachment(ctx, "clear_material_image", "denied", params)
		if err != nil || res.Code != errcode.PermissionDenied.Code || repo.clearCalls != 0 {
			t.Fatalf("read or product rights authorized clear: %#v, %v", res, err)
		}
		allowed := newAttachmentJSONRPCTestDispatcher(t, repo, workflowJSONRPCAdmin([]string{biz.EngineeringRoleKey}, biz.PermissionMaterialUpdate))
		_, res, err = allowed.handleBusinessAttachment(ctx, "clear_material_image", "allowed", params)
		if err != nil || res.Code != 0 || repo.clearCalls != 1 || repo.clearMaterial != 7 || repo.clearAttachmentID != 71 {
			t.Fatalf("material clear did not retain its scope: %#v, %v", res, err)
		}
		_, res, err = allowed.handleBusinessAttachment(ctx, "clear_material_image", "missing-id", mustJSONRPCStruct(t, map[string]any{"material_id": 7}))
		if err != nil || res.Code != errcode.InvalidParam.Code || repo.clearCalls != 1 {
			t.Fatalf("unscoped clear accepted: %#v, %v", res, err)
		}
	})
}
