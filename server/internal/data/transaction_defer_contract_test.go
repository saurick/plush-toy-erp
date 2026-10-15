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
			if !isManagedEntTransactionRollback(deferred.Call.Fun) {
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

func TestEntTransactionRollbackDefersInvalidateCommittedTx(t *testing.T) {
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
			function, ok := node.(*ast.FuncDecl)
			if !ok || function.Body == nil || !defersEntTransactionRollback(function.Body) {
				return true
			}
			ast.Inspect(function.Body, func(node ast.Node) bool {
				block, ok := node.(*ast.BlockStmt)
				if !ok {
					return true
				}
				for index, statement := range block.List {
					if !statementCommitsEntTransaction(statement) {
						continue
					}
					if index+1 < len(block.List) && statementInvalidatesEntTransaction(block.List[index+1]) {
						continue
					}
					position := fset.Position(statement.Pos())
					t.Errorf(
						"%s:%d commits tx without an immediate tx = nil; the deferred rollback would run after commit",
						position.Filename,
						position.Line,
					)
				}
				return true
			})
			return false
		})
	}
}

func defersEntTransactionRollback(body *ast.BlockStmt) bool {
	found := false
	ast.Inspect(body, func(node ast.Node) bool {
		if found {
			return false
		}
		deferred, ok := node.(*ast.DeferStmt)
		if !ok {
			return true
		}
		ast.Inspect(deferred.Call, func(node ast.Node) bool {
			call, ok := node.(*ast.CallExpr)
			if !ok {
				return true
			}
			if isManagedEntTransactionRollback(call.Fun) {
				found = true
				return false
			}
			return true
		})
		return !found
	})
	return found
}

func isManagedEntTransactionRollback(callee ast.Expr) bool {
	switch expression := callee.(type) {
	case *ast.Ident:
		return expression.Name == "rollbackEntTx" || expression.Name == "rollbackMasterDataEntTx"
	case *ast.SelectorExpr:
		return expression.Sel.Name == "rollbackAdminManageTx"
	default:
		return false
	}
}

func statementCommitsEntTransaction(statement ast.Stmt) bool {
	found := false
	ast.Inspect(statement, func(node ast.Node) bool {
		if found {
			return false
		}
		if _, nestedBlock := node.(*ast.BlockStmt); nestedBlock {
			return false
		}
		call, ok := node.(*ast.CallExpr)
		if !ok {
			return true
		}
		selector, ok := call.Fun.(*ast.SelectorExpr)
		if !ok || selector.Sel.Name != "Commit" {
			return true
		}
		receiver, ok := selector.X.(*ast.Ident)
		if ok && receiver.Name == "tx" {
			found = true
			return false
		}
		return true
	})
	return found
}

func statementInvalidatesEntTransaction(statement ast.Stmt) bool {
	assignment, ok := statement.(*ast.AssignStmt)
	if !ok || assignment.Tok != token.ASSIGN || len(assignment.Lhs) != 1 || len(assignment.Rhs) != 1 {
		return false
	}
	left, leftOK := assignment.Lhs[0].(*ast.Ident)
	right, rightOK := assignment.Rhs[0].(*ast.Ident)
	return leftOK && rightOK && left.Name == "tx" && right.Name == "nil"
}
