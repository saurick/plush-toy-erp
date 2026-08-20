package data

import (
	"go/ast"
	"go/parser"
	"go/token"
	"path/filepath"
	"strings"
	"testing"
)

func TestEntTransactionRollbackDefersReadFinalTxState(t *testing.T) {
	files, err := filepath.Glob("*.go")
	if err != nil {
		t.Fatalf("list data package files: %v", err)
	}
	fset := token.NewFileSet()
	for _, filename := range files {
		if strings.HasSuffix(filename, "_test.go") {
			continue
		}
		file, err := parser.ParseFile(fset, filename, nil, 0)
		if err != nil {
			t.Fatalf("parse %s: %v", filename, err)
		}
		ast.Inspect(file, func(node ast.Node) bool {
			deferred, ok := node.(*ast.DeferStmt)
			if !ok {
				return true
			}
			callee, ok := deferred.Call.Fun.(*ast.Ident)
			if !ok || (callee.Name != "rollbackEntTx" && callee.Name != "rollbackMasterDataEntTx") {
				return true
			}
			position := fset.Position(deferred.Pos())
			t.Errorf(
				"%s:%d directly captures tx in defer; use a closure so tx = nil after commit is observed",
				position.Filename,
				position.Line,
			)
			return true
		})
	}
}
