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
				if sourceActionGuardedNode(clause) {
					return
				}
				for _, callName := range sourceActionCallNames(clause) {
					if strings.HasPrefix(callName, "handle") {
						continue
					}
					if helper := functions[callName]; helper != nil && sourceActionGuardedNode(helper.Body) {
						return
					}
				}
			}
			t.Fatalf("registered source action %s.%s has no handler branch that calls a source-read guard directly or through its action helper", contract.Domain, contract.Method)
		})
	}
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

func sourceActionCallNames(node ast.Node) []string {
	seen := map[string]struct{}{}
	var names []string
	ast.Inspect(node, func(candidate ast.Node) bool {
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
