package service

import (
	"context"
	"testing"

	"server/internal/biz"
	"server/internal/errcode"
)

func (r *stubAttachmentJSONRPCRepo) ListDocumentProductPreviews(_ context.Context, _ string, ids []int) ([]biz.DocumentProductPreview, error) {
	r.listCalls++
	rows := make([]biz.DocumentProductPreview, 0, len(ids))
	for _, id := range ids {
		rows = append(rows, biz.DocumentProductPreview{DocumentID: id, ProductCount: 2, ProductID: 7, ProductName: "模拟小熊", ProductCode: "DEMO-BEAR"})
	}
	return rows, nil
}

func TestJsonrpcDocumentProductPreviews(t *testing.T) {
	for _, source := range []string{biz.DocumentProductPreviewSalesOrder, biz.DocumentProductPreviewProductionOrder, biz.DocumentProductPreviewOutsourcingOrder} {
		t.Run(source, func(t *testing.T) {
			permissions := biz.DocumentProductPreviewPermissions(source)
			for _, missing := range append([]string{""}, permissions...) {
				allowed := []string{}
				for _, p := range permissions {
					if p != missing {
						allowed = append(allowed, p)
					}
				}
				repo := &stubAttachmentJSONRPCRepo{}
				d := newAttachmentJSONRPCTestDispatcher(t, repo, workflowJSONRPCAdmin([]string{biz.EngineeringRoleKey, biz.PMCRoleKey, biz.PurchaseRoleKey}, allowed...))
				if source == biz.DocumentProductPreviewOutsourcingOrder {
					activateOperationalFactTestCustomerConfig(t, d, customerConfigPublishParamsWithRevisionAndModuleState(t, customerConfigPublishParams(t), "gallery-outsourcing", "outsourcing_orders", "enabled"))
				}
				_, result, err := d.handleBusinessAttachment(workflowJSONRPCAdminContext(), "list_document_product_previews", "previews", mustJSONRPCStruct(t, map[string]any{"source_type": source, "document_ids": []any{11}}))
				if err != nil {
					t.Fatal(err)
				}
				if missing != "" {
					if result.Code != errcode.PermissionDenied.Code || repo.listCalls != 0 {
						t.Fatalf("missing %s read data: %#v", missing, result)
					}
				} else {
					if result.Code != 0 || repo.listCalls != 1 || repo.contentCalls != 0 {
						t.Fatalf("read failed %#v", result)
					}
					rows := result.Data.AsMap()["previews"].([]any)
					if len(rows) != 1 || len(rows[0].(map[string]any)) != 5 {
						t.Fatalf("invalid preview projection: %#v", rows)
					}
				}
			}
		})
	}
}

func TestJsonrpcDocumentProductPreviewsRejectsInvalidAndInactive(t *testing.T) {
	for _, ids := range []any{nil, []any{}, []any{0}, []any{1.5}, []any{"1"}, []any{1, 1}, make([]any, 81)} {
		repo := &stubAttachmentJSONRPCRepo{}
		admin := workflowJSONRPCAdmin(nil, biz.DocumentProductPreviewPermissions(biz.DocumentProductPreviewSalesOrder)...)
		d := newAttachmentJSONRPCTestDispatcher(t, repo, admin)
		_, result, _ := d.handleBusinessAttachment(workflowJSONRPCAdminContext(), "list_document_product_previews", "invalid", mustJSONRPCStruct(t, map[string]any{"source_type": biz.DocumentProductPreviewSalesOrder, "document_ids": ids}))
		if result.Code == 0 || repo.listCalls != 0 {
			t.Fatalf("invalid IDs accepted: %v", ids)
		}
	}
	for _, disabled := range []bool{false, true} {
		repo := &stubAttachmentJSONRPCRepo{}
		admin := workflowJSONRPCAdmin(nil, biz.DocumentProductPreviewPermissions(biz.DocumentProductPreviewSalesOrder)...)
		admin.Disabled = disabled
		d := newAttachmentJSONRPCTestDispatcher(t, repo, admin)
		ctx := workflowJSONRPCAdminContext()
		if !disabled {
			ctx = context.Background()
		}
		_, result, _ := d.handleBusinessAttachment(ctx, "list_document_product_previews", "inactive", mustJSONRPCStruct(t, map[string]any{"source_type": biz.DocumentProductPreviewSalesOrder, "document_ids": []any{1}}))
		if result.Code == 0 || repo.listCalls != 0 {
			t.Fatalf("inactive session read previews: %#v", result)
		}
	}
}
