package main

import (
	"go/parser"
	"go/token"
	"os"
	"path/filepath"
	"reflect"
	"strings"
	"testing"

	"server/internal/biz"
)

func TestPublicPermissionCatalogMatchesRegisteredPermissions(t *testing.T) {
	got, err := collect("../../..")
	if err != nil {
		t.Fatal(err)
	}
	want := map[string]string{}
	for _, permission := range biz.AllPermissionDefinitions() {
		want[key(permission.Key)] = permission.Key
	}
	if !reflect.DeepEqual(got.Permissions, want) {
		t.Fatal("generated permission values differ from runtime RBAC registry")
	}
	for name, states := range map[string][]biz.WorkflowStateOption{"WorkflowTaskStatus": biz.WorkflowTaskStates(), "WorkflowBusinessStatus": biz.WorkflowBusinessStates()} {
		want := map[string]string{}
		for _, state := range states {
			want[key(state.Key)] = state.Key
		}
		if !reflect.DeepEqual(got.States[name], want) {
			t.Fatalf("%s differs from runtime registry", name)
		}
	}
	if got.Attachments["maxBytes"] != int64(biz.BusinessAttachmentMaxBytes) {
		t.Fatal("attachment limit differs")
	}
	for name, want := range map[string]map[string]string{
		"FinancePaymentStatus":    {"DRAFT": biz.FinancePaymentStatusDraft, "APPROVED": biz.FinancePaymentStatusApproved, "REJECTED": biz.FinancePaymentStatusRejected, "POSTED": biz.FinancePaymentStatusPosted, "REVERSED": biz.FinancePaymentStatusReversed, "CANCELLED": biz.FinancePaymentStatusCancelled},
		"FinanceAllocationStatus": {"POSTED": biz.FinanceAllocationStatusPosted, "REVERSED": biz.FinanceAllocationStatusReversed},
		"FinancePaymentDirection": {"RECEIPT": biz.FinancePaymentDirectionReceipt, "DISBURSEMENT": biz.FinancePaymentDirectionDisbursement},
		"ProcessStatus":           {"ACTIVE": biz.ProcessStatusActive, "BLOCKED": biz.ProcessStatusBlocked, "COMPLETED": biz.ProcessStatusCompleted},
		"ProcessNodeStatus":       {"WAITING": biz.ProcessNodeStatusWaiting, "ACTIVE": biz.ProcessNodeStatusActive, "COMPLETED": biz.ProcessNodeStatusCompleted, "BLOCKED": biz.ProcessNodeStatusBlocked, "WITHDRAWN": biz.ProcessNodeStatusWithdrawn},
		"ProcessNodeType":         {"HUMAN_TASK": biz.ProcessNodeTypeHumanTask, "APPROVAL": biz.ProcessNodeTypeApproval, "DOMAIN_COMMAND": biz.ProcessNodeTypeDomainCommand, "WAIT_EVENT": biz.ProcessNodeTypeWaitEvent, "END": biz.ProcessNodeTypeEnd},
	} {
		if !reflect.DeepEqual(got.States[name], want) {
			t.Fatalf("%s differs from domain declarations", name)
		}
	}
	if !reflect.DeepEqual(got.Policies["AdminPasswordPolicy"], map[string]int64{"minCharacters": int64(biz.AdminPasswordMinLength), "maxCharacters": int64(biz.AdminPasswordMaxLength), "maxBytes": int64(biz.AdminPasswordMaxBytes)}) {
		t.Fatal("password limits differ from domain validation")
	}
	if !reflect.DeepEqual(got.Policies["HelpContentPolicy"], map[string]int64{"markdownMaxCharacters": int64(biz.HelpMarkdownMaxCharacters), "summaryMaxCharacters": int64(biz.HelpSummaryMaxCharacters), "feedbackMinCharacters": int64(biz.HelpFeedbackMinCharacters), "feedbackMaxCharacters": int64(biz.HelpFeedbackMaxCharacters), "quoteMaxCharacters": int64(biz.HelpQuoteMaxCharacters), "responseMaxCharacters": int64(biz.HelpResponseMaxCharacters)}) {
		t.Fatal("help content policy differs from domain source")
	}
	if !reflect.DeepEqual(got.Policies["PrintPolicy"], map[string]int64{"imageCount": 32, "imageBytes": 5 << 20, "imageTotalBytes": 16 << 20, "htmlBytes": 24 << 20, "fontCount": 128, "fontBytes": 256 << 10, "fontTotalBytes": 2 << 20}) {
		t.Fatal("print limits differ from public PDF boundaries")
	}
}

func TestPublicLimitsRejectMissingOrUnsupportedDeclarations(t *testing.T) {
	for _, source := range []string{
		`package example; const Other = 8`,
		`package example; const Limit = external.Value`,
		`package example; const Limit = 0`,
	} {
		file, err := parser.ParseFile(token.NewFileSet(), "test.go", source, 0)
		if err != nil {
			t.Fatal(err)
		}
		if _, err := integerConstants(file, map[string]string{"Limit": "maximum"}); err == nil {
			t.Fatalf("accepted unsupported public limit: %s", source)
		}
	}
}

func TestPublicContractRejectsDuplicateAndNonLiteralStates(t *testing.T) {
	for _, source := range []string{
		`package example; const (StateOne = "one"; StateTwo = "one")`,
		`package example; const StateOne = external.One`,
		`package example; const (StateOne = "one"; StateTwo)`,
		`package example; const Other = "one"`,
	} {
		parsed, err := parser.ParseFile(token.NewFileSet(), "test.go", source, 0)
		if err != nil {
			t.Fatal(err)
		}
		if _, err := stringConstants(parsed, "State"); err == nil {
			t.Fatalf("accepted unsupported declaration: %s", source)
		}
	}
}

func TestPublicRPCReadsReachableConditionalDispatchAndRejectsDrift(t *testing.T) {
	root := t.TempDir()
	directory := filepath.Join(root, "server/internal/service")
	if err := os.MkdirAll(directory, 0755); err != nil {
		t.Fatal(err)
	}
	prefix := `package example
func (d *jsonrpcDispatcher) Handle(url, method string) { switch url { case "orders": return d.handleOrders(method) } }
func (d *jsonrpcDispatcher) handleOrders(method string) { if isWrite(method) { return d.handleWrite(method) }; switch method { case "list": return nil } }
func isWrite(method string) bool { switch method { case "save": return true; default: return false } }
`
	for _, item := range []struct {
		name, target string
		valid        bool
	}{
		{"reachable", `func (d *jsonrpcDispatcher) handleWrite(method string) { switch method { case "save": return nil } }`, true},
		{"unreachable", `func (d *jsonrpcDispatcher) handleWrite(method string) { switch method { case "save", "delete": return nil } }`, false},
		{"missing", `func (d *jsonrpcDispatcher) handleWrite(method string) { switch method { case "update": return nil } }`, false},
	} {
		t.Run(item.name, func(t *testing.T) {
			if err := os.WriteFile(filepath.Join(directory, "jsonrpc.go"), []byte(prefix+item.target), 0600); err != nil {
				t.Fatal(err)
			}
			got, err := rpcMethods(root)
			if (err == nil) != item.valid {
				t.Fatalf("valid=%v, err=%v", item.valid, err)
			}
			if item.valid && !reflect.DeepEqual(got["orders"], map[string]string{"LIST": "list", "SAVE": "save"}) {
				t.Fatalf("unexpected methods: %v", got)
			}
		})
	}
}

func TestPublicAttachmentRejectsDuplicateTypes(t *testing.T) {
	for _, source := range []string{
		`map[string]map[string]struct{}{ ".pdf": {"application/pdf": {}}, ".pdf": {"text/plain": {}} }`,
		`map[string]map[string]struct{}{ ".pdf": {"application/pdf": {}, "application/pdf": {}} }`,
		`map[string]map[string]struct{}{ ".pdf": {} }`,
	} {
		expr, err := parser.ParseExpr(source)
		if err != nil {
			t.Fatal(err)
		}
		if _, err := fileTypes(expr); err == nil {
			t.Fatalf("accepted invalid file types: %s", source)
		}
	}
}

func TestPublicRPCRejectsUnrecognizedMethodDelegation(t *testing.T) {
	for _, branch := range []string{
		`if isWrite(method) { println(method); return d.handleWrite(method) }`,
		`if isWrite(method) { if ready { return d.handleWrite(method) } }`,
		`if isWrite(method) { return d.handleWrite(method) } else { return nil }`,
		`if ready { return wrap(d.handleWrite(method)) }`,
		`return d.handleWrite(method)`,
	} {
		t.Run(branch, func(t *testing.T) {
			root := t.TempDir()
			directory := filepath.Join(root, "server/internal/service")
			if err := os.MkdirAll(directory, 0755); err != nil {
				t.Fatal(err)
			}
			source := `package example
func (d *jsonrpcDispatcher) Handle(url, method string) { switch url { case "orders": return d.handleOrders(method) } }
func (d *jsonrpcDispatcher) handleOrders(method string) { ` + branch + `; switch method { case "list": return nil } }
func isWrite(method string) bool { switch method { case "save": return true; default: return false } }
func (d *jsonrpcDispatcher) handleWrite(method string) { switch method { case "save": return nil } }
`
			if err := os.WriteFile(filepath.Join(directory, "jsonrpc.go"), []byte(source), 0600); err != nil {
				t.Fatal(err)
			}
			if _, err := rpcMethods(root); err == nil || !strings.Contains(err.Error(), "unsupported conditional dispatch") {
				t.Fatalf("unsupported forwarding must fail instead of dropping methods: %v", err)
			}
		})
	}
}
