package service

import (
	"testing"
	"time"

	"server/internal/biz"
	"server/internal/errcode"
)

func TestFinancePaymentAttachmentPermissions(t *testing.T) {
	for _, tc := range []struct {
		name                   string
		permissions            []string
		read, upload, withdraw bool
	}{
		{"none", nil, false, false, false},
		{"read", []string{biz.PermissionFinancePaymentRead}, true, false, false},
		{"create", []string{biz.PermissionFinancePaymentCreate}, false, true, false},
		{"post", []string{biz.PermissionFinancePaymentPost}, false, true, true},
		{"approve", []string{biz.PermissionFinancePaymentApprove}, false, false, false},
		{"fact-only", []string{biz.PermissionFinancePayableRead, biz.PermissionFinancePayableConfirm}, false, false, false},
	} {
		t.Run(tc.name, func(t *testing.T) {
			repo := &stubAttachmentJSONRPCRepo{current: &biz.BusinessAttachment{ID: 101, OwnerType: biz.BusinessAttachmentOwnerFinancePayment, OwnerID: 7, AttachmentType: "evidence", FileName: "proof.pdf", MimeType: "application/pdf", FileSize: 5, SHA256: testAttachmentProofSHA256, CreatedAt: time.Unix(1, 0)}}
			d := newAttachmentJSONRPCTestDispatcher(t, repo, workflowJSONRPCAdmin([]string{biz.FinanceRoleKey}, tc.permissions...))
			calls := []struct {
				method  string
				params  map[string]any
				allowed bool
			}{
				{"list_attachments", map[string]any{"owner_type": "finance_payment", "owner_id": 7}, tc.read},
				{"upload_attachment", map[string]any{"owner_type": "finance_payment", "owner_id": 7, "attachment_type": "evidence", "file_name": "proof.pdf", "mime_type": "application/pdf", "content_base64": "cHJvb2Y="}, tc.upload},
				{"withdraw_attachment", map[string]any{"id": 101, "reason": "模拟错误附件"}, tc.withdraw},
			}
			for _, call := range calls {
				_, result, err := d.handleBusinessAttachment(workflowJSONRPCAdminContext(), call.method, call.method, mustJSONRPCStruct(t, call.params))
				want := errcode.PermissionDenied.Code
				if call.allowed {
					want = errcode.OK.Code
				}
				if err != nil || result.Code != want {
					t.Fatalf("%s result=%+v err=%v want=%d", call.method, result, err, want)
				}
			}
			if (repo.listCalls > 0) != tc.read || (repo.createCalls > 0) != tc.upload || (repo.withdrawCalls > 0) != tc.withdraw {
				t.Fatalf("unauthorized attachment repository access: %+v", repo)
			}
		})
	}
}
