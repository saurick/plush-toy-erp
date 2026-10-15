package main

import (
	"go/parser"
	"go/token"
	"os"
	"path/filepath"
	"reflect"
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
