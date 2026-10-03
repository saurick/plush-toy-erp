package service

import (
	"context"
	"encoding/base64"
	"fmt"
	"testing"
	"time"

	"server/internal/biz"
	"server/internal/errcode"
)

type attachmentFinanceAccessRepo struct {
	stubBusinessDashboardOperationalFactRepo
	factType string
}

func (r *attachmentFinanceAccessRepo) GetFinanceFact(_ context.Context, id int) (*biz.FinanceFact, error) {
	return &biz.FinanceFact{ID: id, FactType: r.factType}, nil
}

func (r *attachmentFinanceAccessRepo) ListFinanceFactsForAccess(context.Context, biz.OperationalFactFilter, biz.FinanceFactAccessScope) ([]*biz.FinanceFact, int, error) {
	return nil, 0, nil
}

func TestFinanceAttachmentFactTypeAccess(t *testing.T) {
	families := []struct{ factType, read, write string }{
		{biz.FinanceFactReceivable, biz.PermissionFinanceReceivableRead, biz.PermissionFinanceReceivableConfirm},
		{biz.FinanceFactPayable, biz.PermissionFinancePayableRead, biz.PermissionFinancePayableConfirm},
		{biz.FinanceFactInvoice, biz.PermissionFinanceInvoiceRead, biz.PermissionFinanceInvoiceConfirm},
		{biz.FinanceFactReconciliation, biz.PermissionFinanceReconciliationRead, biz.PermissionFinanceReconciliationConfirm},
	}
	for _, grant := range families {
		for _, target := range families {
			for _, method := range []string{"list_attachments", "download_attachment", "upload_attachment", "withdraw_attachment", "withdraw_replay"} {
				t.Run(fmt.Sprintf("%s/%s/%s", grant.factType, target.factType, method), func(t *testing.T) {
					actorID := 7
					reason := "凭证提交有误"
					attachment := &biz.BusinessAttachment{ID: 101, OwnerType: biz.BusinessAttachmentOwnerFinanceFact, OwnerID: 9,
						AttachmentType: "evidence", FileName: "proof.pdf", MimeType: "application/pdf", FileSize: 5,
						SHA256: testAttachmentProofSHA256}
					repo := &stubAttachmentJSONRPCRepo{current: attachment}
					d := newAttachmentJSONRPCTestDispatcher(t, repo, workflowJSONRPCAdmin([]string{biz.FinanceRoleKey}, grant.read, grant.write))
					d.operationalFactUC = biz.NewOperationalFactUsecase(&attachmentFinanceAccessRepo{factType: target.factType})
					params := map[string]any{"owner_type": "finance_fact", "owner_id": float64(9), "id": float64(101),
						"attachment_type": "evidence", "file_name": "proof.pdf", "mime_type": "application/pdf",
						"content_base64": base64.StdEncoding.EncodeToString([]byte("proof")), "reason": reason}
					if method == "withdraw_replay" {
						now := time.Now()
						attachment.WithdrawnAt, attachment.WithdrawnBy, attachment.WithdrawalReason = &now, &actorID, &reason
						method = "withdraw_attachment"
					}
					_, res, err := d.handleBusinessAttachment(workflowJSONRPCAdminContext(), method, "1", mustAuthStruct(t, params))
					want := errcode.PermissionDenied.Code
					if grant.factType == target.factType {
						want = errcode.OK.Code
					}
					if err != nil || res.Code != want {
						t.Fatalf("result=%#v err=%v want code=%d", res, err, want)
					}
					if want != errcode.OK.Code && (repo.contentCalls != 0 || repo.listCalls != 0 || repo.createCalls != 0 || repo.withdrawCalls != 0 || res.Data != nil) {
						t.Fatalf("denied request reached attachment sink: %#v result=%#v", repo, res)
					}
				})
			}
		}
	}
}

func TestFinanceAttachmentReportReadAndReadOnlyCannotMutate(t *testing.T) {
	for _, permissions := range [][]string{{biz.PermissionFinanceReportRead}, {biz.PermissionFinanceReceivableRead}} {
		for _, method := range []string{"list_attachments", "download_attachment", "upload_attachment", "withdraw_attachment"} {
			repo := &stubAttachmentJSONRPCRepo{current: &biz.BusinessAttachment{ID: 101, OwnerType: "finance_fact", OwnerID: 9}}
			d := newAttachmentJSONRPCTestDispatcher(t, repo, workflowJSONRPCAdmin([]string{biz.FinanceRoleKey}, permissions...))
			d.operationalFactUC = biz.NewOperationalFactUsecase(&attachmentFinanceAccessRepo{factType: biz.FinanceFactPayable})
			_, res, err := d.handleBusinessAttachment(workflowJSONRPCAdminContext(), method, "1", mustAuthStruct(t, map[string]any{
				"id": float64(101), "owner_type": "finance_fact", "owner_id": float64(9), "reason": "凭证提交有误",
			}))
			if err != nil || res.Code != errcode.PermissionDenied.Code || res.Data != nil || repo.contentCalls+repo.listCalls+repo.createCalls+repo.withdrawCalls != 0 {
				t.Fatalf("permissions=%v method=%s result=%#v err=%v repo=%#v", permissions, method, res, err, repo)
			}
		}
	}
}

func TestFinanceAttachmentSameFamilyReadCannotMutate(t *testing.T) {
	for _, method := range []string{"upload_attachment", "withdraw_attachment"} {
		repo := &stubAttachmentJSONRPCRepo{current: &biz.BusinessAttachment{ID: 101, OwnerType: "finance_fact", OwnerID: 9}}
		d := newAttachmentJSONRPCTestDispatcher(t, repo, workflowJSONRPCAdmin([]string{biz.FinanceRoleKey}, biz.PermissionFinanceReceivableRead))
		d.operationalFactUC = biz.NewOperationalFactUsecase(&attachmentFinanceAccessRepo{factType: biz.FinanceFactReceivable})
		_, res, err := d.handleBusinessAttachment(workflowJSONRPCAdminContext(), method, "1", mustAuthStruct(t, map[string]any{
			"id": float64(101), "owner_type": "finance_fact", "owner_id": float64(9), "reason": "凭证提交有误",
			"attachment_type": "evidence", "file_name": "proof.pdf", "mime_type": "application/pdf", "content_base64": base64.StdEncoding.EncodeToString([]byte("proof")),
		}))
		if err != nil || res.Code != errcode.PermissionDenied.Code || res.Data != nil || repo.createCalls+repo.withdrawCalls != 0 {
			t.Fatalf("read-only method=%s result=%#v err=%v repo=%#v", method, res, err, repo)
		}
	}
}
