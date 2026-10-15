package service

import (
	"go/ast"
	"go/parser"
	"go/token"
	"path/filepath"
	"strconv"
	"strings"
	"testing"

	"server/internal/biz"
)

func TestEveryRegisteredSourceActionHandlerCallsSourceReadGuard(t *testing.T) {
	files, err := filepath.Glob("jsonrpc_*.go")
	if err != nil {
		t.Fatal(err)
	}
	functions := map[string]*ast.FuncDecl{}
	var clauses []*ast.CaseClause
	fset := token.NewFileSet()
	for _, path := range files {
		if strings.HasSuffix(path, "_test.go") {
			continue
		}
		parsed, parseErr := parser.ParseFile(fset, path, nil, 0)
		if parseErr != nil {
			t.Fatalf("parse %s: %v", path, parseErr)
		}
		for _, declaration := range parsed.Decls {
			function, ok := declaration.(*ast.FuncDecl)
			if !ok || function.Body == nil {
				continue
			}
			functions[function.Name.Name] = function
			ast.Inspect(function.Body, func(node ast.Node) bool {
				if clause, ok := node.(*ast.CaseClause); ok {
					clauses = append(clauses, clause)
				}
				return true
			})
		}
	}

	for _, contract := range biz.PublicSourceActionReadPermissionContracts() {
		contract := contract
		t.Run(contract.Domain+"/"+contract.Method, func(t *testing.T) {
			for _, clause := range clauses {
				if !sourceActionCaseMatches(clause, contract.Method) {
					continue
				}
				if sourceActionCaseGuarded(clause, functions) {
					return
				}
			}
			t.Fatalf("registered source action %s.%s has no handler branch that calls a source-read guard directly or through its action helper", contract.Domain, contract.Method)
		})
	}
}

func sourceActionCaseGuarded(clause *ast.CaseClause, functions map[string]*ast.FuncDecl) bool {
	if sourceActionGuardedNode(clause) {
		return true
	}
	for _, callName := range sourceActionCallNames(clause) {
		if helper := functions[callName]; helper != nil && sourceActionGuardedNode(helper.Body) {
			return true
		}
	}
	return false
}

func sourceActionCaseMatches(clause *ast.CaseClause, method string) bool {
	for _, expression := range clause.List {
		literal, ok := expression.(*ast.BasicLit)
		if !ok || literal.Kind != token.STRING {
			continue
		}
		value, err := strconv.Unquote(literal.Value)
		if err == nil && value == method {
			return true
		}
	}
	return false
}

func sourceActionGuardedNode(node ast.Node) bool {
	guarded := false
	ast.Inspect(node, func(candidate ast.Node) bool {
		// A guard in another dispatch branch or callback does not guard this action.
		switch candidate.(type) {
		case *ast.SwitchStmt, *ast.TypeSwitchStmt, *ast.FuncLit:
			return false
		}
		call, ok := candidate.(*ast.CallExpr)
		if !ok {
			return true
		}
		selector, ok := call.Fun.(*ast.SelectorExpr)
		if !ok {
			return true
		}
		switch selector.Sel.Name {
		case "requireSourceActionReadPermissions", "requireSourceActionRBACReadPermissions":
			guarded = true
			return false
		default:
			return true
		}
	})
	return guarded
}

func TestSourceActionHandlerGuardAnalysis(t *testing.T) {
	for _, tt := range []struct {
		name       string
		actionBody string
		helperBody string
		guarded    bool
	}{
		{
			name:       "direct guard",
			actionBody: `d.requireSourceActionReadPermissions(ctx, "customer_config", method)`,
			guarded:    true,
		},
		{
			name:       "delegated action handler",
			actionBody: `d.handleAction()`,
			helperBody: `d.requireSourceActionRBACReadPermissions(ctx, "customer_config", method)`,
			guarded:    true,
		},
		{
			name:       "missing guard",
			actionBody: `d.handleAction()`,
			helperBody: `d.writeFact()`,
		},
		{
			name:       "guard belongs to another dispatched action",
			actionBody: `d.handleAction()`,
			helperBody: `switch method { case "other": d.requireSourceActionReadPermissions(ctx, "customer_config", method) }`,
		},
		{
			name:       "guard only exists in callback",
			actionBody: `d.handleAction()`,
			helperBody: `callback := func() { d.requireSourceActionReadPermissions(ctx, "customer_config", method) }; _ = callback`,
		},
		{
			name:       "guarded handler only referenced by callback",
			actionBody: `callback := func() { d.handleAction() }; _ = callback`,
			helperBody: `d.requireSourceActionReadPermissions(ctx, "customer_config", method)`,
		},
		{
			name:       "guarded handler belongs to another dispatched action",
			actionBody: `switch otherMethod { case "other": d.handleAction() }`,
			helperBody: `d.requireSourceActionReadPermissions(ctx, "customer_config", method)`,
		},
		{
			name:       "common guard before dispatch",
			actionBody: `d.handleAction()`,
			helperBody: `d.requireSourceActionReadPermissions(ctx, "customer_config", method); switch method { case "submit": d.writeFact() }`,
			guarded:    true,
		},
	} {
		t.Run(tt.name, func(t *testing.T) {
			source := `package service
func route() { switch method { case "submit": ` + tt.actionBody + ` } }
func handleAction() { ` + tt.helperBody + ` }
`
			parsed, err := parser.ParseFile(token.NewFileSet(), "fixture.go", source, 0)
			if err != nil {
				t.Fatal(err)
			}
			functions := map[string]*ast.FuncDecl{}
			for _, declaration := range parsed.Decls {
				function := declaration.(*ast.FuncDecl)
				functions[function.Name.Name] = function
			}
			dispatch := functions["route"].Body.List[0].(*ast.SwitchStmt)
			clause := dispatch.Body.List[0].(*ast.CaseClause)
			if guarded := sourceActionCaseGuarded(clause, functions); guarded != tt.guarded {
				t.Fatalf("guarded = %v, want %v", guarded, tt.guarded)
			}
		})
	}
}

func sourceActionCallNames(node ast.Node) []string {
	seen := map[string]struct{}{}
	var names []string
	ast.Inspect(node, func(candidate ast.Node) bool {
		switch candidate.(type) {
		case *ast.SwitchStmt, *ast.TypeSwitchStmt, *ast.FuncLit:
			return false
		}
		call, ok := candidate.(*ast.CallExpr)
		if !ok {
			return true
		}
		name := ""
		switch function := call.Fun.(type) {
		case *ast.Ident:
			name = function.Name
		case *ast.SelectorExpr:
			name = function.Sel.Name
		}
		if name != "" {
			if _, duplicate := seen[name]; !duplicate {
				seen[name] = struct{}{}
				names = append(names, name)
			}
		}
		return true
	})
	return names
}
