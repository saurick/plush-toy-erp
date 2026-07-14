package service

import (
	"go/ast"
	"go/parser"
	"go/token"
	"os"
	"regexp"
	"strconv"
	"strings"
	"testing"
)

var camelCaseJSONRPCMethodPattern = regexp.MustCompile(`^[a-z][A-Za-z0-9]*[A-Z][A-Za-z0-9]*$`)

func TestJSONRPCHandlersRegisterSnakeCaseMethodsOnly(t *testing.T) {
	entries, err := os.ReadDir(".")
	if err != nil {
		t.Fatalf("read service package: %v", err)
	}

	for _, entry := range entries {
		name := entry.Name()
		if entry.IsDir() || !strings.HasPrefix(name, "jsonrpc") || !strings.HasSuffix(name, ".go") || strings.HasSuffix(name, "_test.go") {
			continue
		}
		parsed, err := parser.ParseFile(token.NewFileSet(), name, nil, 0)
		if err != nil {
			t.Fatalf("parse %s: %v", name, err)
		}
		for _, declaration := range parsed.Decls {
			function, ok := declaration.(*ast.FuncDecl)
			if !ok || function.Body == nil || !strings.HasPrefix(function.Name.Name, "handle") {
				continue
			}
			ast.Inspect(function.Body, func(node ast.Node) bool {
				clause, ok := node.(*ast.CaseClause)
				if !ok {
					return true
				}
				for _, expression := range clause.List {
					literal, ok := expression.(*ast.BasicLit)
					if !ok || literal.Kind != token.STRING {
						continue
					}
					value, err := strconv.Unquote(literal.Value)
					if err != nil {
						t.Fatalf("unquote %s in %s: %v", literal.Value, name, err)
					}
					if camelCaseJSONRPCMethodPattern.MatchString(value) {
						t.Errorf("%s registers non-canonical JSON-RPC method %q", name, value)
					}
				}
				return true
			})
		}
	}
}
