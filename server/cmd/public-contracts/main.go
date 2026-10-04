// public-contracts reads the declarations used by the application without
// starting it or importing runtime services. Unsupported declarations fail
// closed so a source refactor cannot silently remove a public value.
package main

import (
	"encoding/json"
	"flag"
	"fmt"
	"go/ast"
	"go/constant"
	"go/parser"
	"go/token"
	"go/types"
	"os"
	"path/filepath"
	"regexp"
	"strings"
)

type catalog struct {
	Permissions map[string]string            `json:"permissions"`
	States      map[string]map[string]string `json:"states"`
	Attachments map[string]any               `json:"attachments"`
	Numeric     map[string]int64             `json:"numeric"`
	RPC         map[string]map[string]string `json:"rpc"`
}

var wordBoundary = regexp.MustCompile(`([a-z0-9])([A-Z])`)

func key(value string) string {
	return strings.ToUpper(strings.ReplaceAll(wordBoundary.ReplaceAllString(value, "${1}_${2}"), ".", "_"))
}

func parse(root, path string) (*ast.File, error) {
	return parser.ParseFile(token.NewFileSet(), filepath.Join(root, path), nil, 0)
}

func text(expr ast.Expr) (string, error) {
	v, ok := expr.(*ast.BasicLit)
	if !ok || v.Kind != token.STRING {
		return "", fmt.Errorf("expected string literal, got %T", expr)
	}
	return constant.StringVal(constant.MakeFromLiteral(v.Value, token.STRING, 0)), nil
}

func declarations(file *ast.File, kind token.Token, visit func(string, ast.Expr) error) error {
	for _, decl := range file.Decls {
		gen, ok := decl.(*ast.GenDecl)
		if !ok || gen.Tok != kind {
			continue
		}
		for _, spec := range gen.Specs {
			v := spec.(*ast.ValueSpec)
			for i, name := range v.Names {
				var expr ast.Expr
				if len(v.Values) == len(v.Names) {
					expr = v.Values[i]
				}
				if err := visit(name.Name, expr); err != nil {
					return fmt.Errorf("%s: %w", name.Name, err)
				}
			}
		}
	}
	return nil
}

func add(target map[string]string, name, value string) error {
	if name == "" || value == "" {
		return fmt.Errorf("empty contract key/value")
	}
	if _, exists := target[name]; exists {
		return fmt.Errorf("duplicate contract key %s", name)
	}
	for _, existing := range target {
		if existing == value {
			return fmt.Errorf("duplicate contract value %s", value)
		}
	}
	target[name] = value
	return nil
}

func stringConstants(file *ast.File, prefix string) (map[string]string, error) {
	out := map[string]string{}
	err := declarations(file, token.CONST, func(name string, expr ast.Expr) error {
		if !strings.HasPrefix(name, prefix) {
			return nil
		}
		if prefix == "PurchaseReceipt" && strings.HasPrefix(name, "PurchaseReceiptAdjustment") {
			return nil
		}
		if (prefix == "SalesOrder" || prefix == "PurchaseOrder") && strings.HasPrefix(name, prefix+"Item") {
			return nil
		}
		value, err := text(expr)
		if err != nil {
			return err
		}
		return add(out, key(strings.TrimPrefix(name, prefix)), value)
	})
	if err == nil && len(out) == 0 {
		err = fmt.Errorf("missing constants %s", prefix)
	}
	return out, err
}

func stateOptions(file *ast.File, name string) (map[string]string, error) {
	out := map[string]string{}
	err := declarations(file, token.VAR, func(ident string, expr ast.Expr) error {
		if ident != name {
			return nil
		}
		list, ok := expr.(*ast.CompositeLit)
		if !ok {
			return fmt.Errorf("expected state option literal")
		}
		for _, item := range list.Elts {
			option, ok := item.(*ast.CompositeLit)
			if !ok {
				return fmt.Errorf("expected keyed state option")
			}
			found := false
			for _, field := range option.Elts {
				pair, ok := field.(*ast.KeyValueExpr)
				if !ok {
					return fmt.Errorf("expected keyed state option field")
				}
				fieldName, ok := pair.Key.(*ast.Ident)
				if ok && fieldName.Name == "Key" {
					value, err := text(pair.Value)
					if err != nil {
						return err
					}
					if err := add(out, key(value), value); err != nil {
						return err
					}
					found = true
				}
			}
			if !found {
				return fmt.Errorf("state option has no Key")
			}
		}
		return nil
	})
	if err == nil && len(out) == 0 {
		err = fmt.Errorf("missing registry %s", name)
	}
	return out, err
}

func fileTypes(expr ast.Expr) (map[string][]string, error) {
	literal, ok := expr.(*ast.CompositeLit)
	if !ok {
		return nil, fmt.Errorf("expected extension/MIME map")
	}
	out := map[string][]string{}
	for _, entry := range literal.Elts {
		pair, ok := entry.(*ast.KeyValueExpr)
		if !ok {
			return nil, fmt.Errorf("expected extension/MIME entry")
		}
		ext, err := text(pair.Key)
		if err != nil {
			return nil, err
		}
		if _, exists := out[ext]; exists {
			return nil, fmt.Errorf("duplicate extension %s", ext)
		}
		mimes, ok := pair.Value.(*ast.CompositeLit)
		if !ok {
			return nil, fmt.Errorf("expected MIME set")
		}
		values := []string{}
		seen := map[string]bool{}
		for _, entry := range mimes.Elts {
			pair, ok := entry.(*ast.KeyValueExpr)
			if !ok {
				return nil, fmt.Errorf("expected MIME entry")
			}
			mime, err := text(pair.Key)
			if err != nil {
				return nil, err
			}
			if seen[mime] {
				return nil, fmt.Errorf("duplicate MIME %s", mime)
			}
			seen[mime] = true
			values = append(values, mime)
		}
		if len(values) == 0 {
			return nil, fmt.Errorf("empty MIME set %s", ext)
		}
		out[ext] = values
	}
	if len(out) == 0 {
		return nil, fmt.Errorf("empty extension/MIME map")
	}
	return out, nil
}

func integer(expr ast.Expr) (int64, error) {
	// Eval handles literal arithmetic (e.g. 100 * 1024 * 1024), without
	// executing code or accepting unresolved names from another scope.
	value, err := types.Eval(token.NewFileSet(), nil, token.NoPos, types.ExprString(expr))
	if err != nil {
		return 0, err
	}
	if value.Value == nil {
		return 0, fmt.Errorf("not a constant")
	}
	n, ok := constant.Int64Val(value.Value)
	if !ok || n <= 0 {
		return 0, fmt.Errorf("expected positive integer constant")
	}
	return n, nil
}

func switches(function *ast.FuncDecl, tag string) []*ast.SwitchStmt {
	out := []*ast.SwitchStmt{}
	ast.Inspect(function.Body, func(node ast.Node) bool {
		switchNode, ok := node.(*ast.SwitchStmt)
		if ok {
			ident, ok := switchNode.Tag.(*ast.Ident)
			if ok && ident.Name == tag {
				out = append(out, switchNode)
			}
		}
		return true
	})
	return out
}

func rpcMethods(root string) (map[string]map[string]string, error) {
	paths, err := filepath.Glob(filepath.Join(root, "server/internal/service/jsonrpc*.go"))
	if err != nil {
		return nil, err
	}
	functions := map[string]*ast.FuncDecl{}
	guards := map[string]*ast.FuncDecl{}
	for _, path := range paths {
		if strings.HasSuffix(path, "_test.go") {
			continue
		}
		file, err := parser.ParseFile(token.NewFileSet(), path, nil, 0)
		if err != nil {
			return nil, err
		}
		for _, decl := range file.Decls {
			fn, ok := decl.(*ast.FuncDecl)
			if !ok {
				continue
			}
			if fn.Recv == nil {
				guards[fn.Name.Name] = fn
				continue
			}
			recv, ok := fn.Recv.List[0].Type.(*ast.StarExpr)
			if !ok {
				continue
			}
			ident, ok := recv.X.(*ast.Ident)
			if ok && ident.Name == "jsonrpcDispatcher" {
				functions[fn.Name.Name] = fn
			}
		}
	}
	entry := functions["Handle"]
	if entry == nil {
		return nil, fmt.Errorf("missing JSON-RPC Handle")
	}
	domains := switches(entry, "url")
	if len(domains) != 1 {
		return nil, fmt.Errorf("expected one URL dispatch switch")
	}
	out := map[string]map[string]string{}
	for _, clause := range domains[0].Body.List {
		c := clause.(*ast.CaseClause)
		if c.List == nil {
			continue
		}
		if len(c.List) != 1 || len(c.Body) != 1 {
			return nil, fmt.Errorf("unsupported domain dispatch")
		}
		domain, err := text(c.List[0])
		if err != nil {
			return nil, err
		}
		ret, ok := c.Body[0].(*ast.ReturnStmt)
		if !ok || len(ret.Results) != 1 {
			return nil, fmt.Errorf("domain %s must return its handler", domain)
		}
		call, ok := ret.Results[0].(*ast.CallExpr)
		if !ok {
			return nil, fmt.Errorf("domain %s must call its handler", domain)
		}
		selector, ok := call.Fun.(*ast.SelectorExpr)
		if !ok || functions[selector.Sel.Name] == nil {
			return nil, fmt.Errorf("unknown domain handler %s", domain)
		}
		methodSwitches := switches(functions[selector.Sel.Name], "method")
		if len(methodSwitches) != 1 {
			return nil, fmt.Errorf("domain %s must have one method switch", domain)
		}
		methods := map[string]string{}
		for _, clause := range methodSwitches[0].Body.List {
			for _, expr := range clause.(*ast.CaseClause).List {
				method, err := text(expr)
				if err != nil {
					return nil, err
				}
				if err := add(methods, key(method), method); err != nil {
					return nil, err
				}
			}
		}
		// Some domains route a named subset before their main switch. Read
		// the actual predicate and require exact agreement with its handler.
		for _, statement := range functions[selector.Sel.Name].Body.List {
			branch, ok := statement.(*ast.IfStmt)
			if !ok || len(branch.Body.List) != 1 {
				continue
			}
			ret, ok := branch.Body.List[0].(*ast.ReturnStmt)
			if !ok || len(ret.Results) != 1 {
				continue
			}
			call, ok := ret.Results[0].(*ast.CallExpr)
			if !ok {
				continue
			}
			target, ok := call.Fun.(*ast.SelectorExpr)
			if !ok || !strings.HasPrefix(target.Sel.Name, "handle") {
				continue
			}
			condition, ok := branch.Cond.(*ast.CallExpr)
			if !ok || len(condition.Args) != 1 {
				return nil, fmt.Errorf("unsupported conditional dispatch in %s", domain)
			}
			guard, ok := condition.Fun.(*ast.Ident)
			arg, argOK := condition.Args[0].(*ast.Ident)
			if !ok || !argOK || arg.Name != "method" || guards[guard.Name] == nil || functions[target.Sel.Name] == nil {
				return nil, fmt.Errorf("unresolved conditional dispatch in %s", domain)
			}
			guardSwitches := switches(guards[guard.Name], "method")
			targetSwitches := switches(functions[target.Sel.Name], "method")
			if len(guardSwitches) != 1 || len(targetSwitches) != 1 {
				return nil, fmt.Errorf("unsupported conditional method switch in %s", domain)
			}
			selected := map[string]bool{}
			for _, clause := range guardSwitches[0].Body.List {
				c := clause.(*ast.CaseClause)
				if c.List == nil {
					continue
				}
				if len(c.Body) != 1 {
					return nil, fmt.Errorf("method predicate must return true")
				}
				result, ok := c.Body[0].(*ast.ReturnStmt)
				if !ok || len(result.Results) != 1 {
					return nil, fmt.Errorf("method predicate must return true")
				}
				value, ok := result.Results[0].(*ast.Ident)
				if !ok || value.Name != "true" {
					return nil, fmt.Errorf("method predicate must return true")
				}
				for _, expr := range c.List {
					name, err := text(expr)
					if err != nil {
						return nil, err
					}
					selected[name] = true
				}
			}
			for _, clause := range targetSwitches[0].Body.List {
				for _, expr := range clause.(*ast.CaseClause).List {
					name, err := text(expr)
					if err != nil {
						return nil, err
					}
					if !selected[name] {
						return nil, fmt.Errorf("unreachable conditional method %s.%s", domain, name)
					}
					if err := add(methods, key(name), name); err != nil {
						return nil, err
					}
					delete(selected, name)
				}
			}
			if len(selected) != 0 {
				return nil, fmt.Errorf("predicate routes missing methods in %s", domain)
			}
		}
		if len(methods) == 0 {
			return nil, fmt.Errorf("empty methods for %s", domain)
		}
		if _, exists := out[domain]; exists {
			return nil, fmt.Errorf("duplicate domain %s", domain)
		}
		out[domain] = methods
	}
	if len(out) == 0 {
		return nil, fmt.Errorf("empty RPC catalog")
	}
	return out, nil
}

func collect(root string) (catalog, error) {
	out := catalog{States: map[string]map[string]string{}, Attachments: map[string]any{}, Numeric: map[string]int64{}}
	rbac, err := parse(root, "server/internal/biz/rbac.go")
	if err != nil {
		return out, err
	}
	out.Permissions = map[string]string{}
	err = declarations(rbac, token.CONST, func(name string, expr ast.Expr) error {
		if !strings.HasPrefix(name, "Permission") || strings.HasPrefix(name, "PermissionClass") {
			return nil
		}
		value, err := text(expr)
		if err != nil {
			return err
		}
		if !strings.Contains(value, ".") {
			return fmt.Errorf("permission key must be dotted: %s", name)
		}
		return add(out.Permissions, key(value), value)
	})
	if err != nil || len(out.Permissions) == 0 {
		return out, fmt.Errorf("permissions: %v", err)
	}
	workflow, err := parse(root, "server/internal/biz/workflow_metadata.go")
	if err != nil {
		return out, err
	}
	for export, registry := range map[string]string{"WorkflowTaskStatus": "workflowTaskStates", "WorkflowBusinessStatus": "workflowBusinessStates"} {
		out.States[export], err = stateOptions(workflow, registry)
		if err != nil {
			return out, err
		}
	}
	for _, source := range []struct{ path, prefix, export string }{
		{"core/status/sales_order.go", "SalesOrder", "SalesOrderStatus"},
		{"core/status/purchase_order.go", "PurchaseOrder", "PurchaseOrderStatus"},
		{"core/status/shipment.go", "Shipment", "ShipmentStatus"},
		{"core/status/inventory_lot.go", "InventoryLot", "InventoryLotStatus"},
		{"core/status/quality_inspection.go", "QualityInspection", "QualityInspectionStatus"},
		{"core/status/posting_document.go", "PurchaseReceiptAdjustment", "PurchaseReceiptAdjustmentStatus"},
		{"core/status/posting_document.go", "PurchaseReceipt", "PurchaseReceiptStatus"},
		{"core/status/posting_document.go", "PurchaseReturn", "PurchaseReturnStatus"},
		{"biz/operational_fact.go", "OperationalFactStatus", "OperationalFactStatus"},
		{"biz/operational_fact.go", "StockReservationStatus", "StockReservationStatus"},
		{"biz/outsourcing_order.go", "OutsourcingOrderStatus", "OutsourcingOrderStatus"},
		{"biz/production_order.go", "ProductionOrderStatus", "ProductionOrderStatus"},
	} {
		file, err := parse(root, "server/internal/"+source.path)
		if err != nil {
			return out, err
		}
		out.States[source.export], err = stringConstants(file, source.prefix)
		if err != nil {
			return out, err
		}
	}
	attachment, err := parse(root, "server/internal/biz/business_attachment.go")
	if err != nil {
		return out, err
	}
	limits := map[string]string{"BusinessAttachmentMaxBytes": "maxBytes", "BusinessAttachmentProductImageMaxBytes": "productImageMaxBytes", "BusinessAttachmentProductImageMaxWidth": "productImageMaxWidth", "BusinessAttachmentProductImageMaxHeight": "productImageMaxHeight"}
	err = declarations(attachment, token.CONST, func(name string, expr ast.Expr) error {
		label, ok := limits[name]
		if !ok {
			return nil
		}
		n, err := integer(expr)
		if err == nil {
			out.Attachments[label] = n
		}
		return err
	})
	if err != nil {
		return out, err
	}
	maps := map[string]string{"allowedBusinessAttachmentFileTypes": "fileTypes", "allowedBusinessAttachmentProductImageFileTypes": "productImageFileTypes", "allowedBusinessAttachmentPrintAppendixFileTypes": "printAppendixFileTypes"}
	err = declarations(attachment, token.VAR, func(name string, expr ast.Expr) error {
		label, ok := maps[name]
		if !ok {
			return nil
		}
		values, err := fileTypes(expr)
		if err == nil {
			out.Attachments[label] = values
		}
		return err
	})
	if err != nil {
		return out, err
	}
	if len(out.Attachments) != len(limits)+len(maps) {
		return out, fmt.Errorf("missing attachment declaration")
	}
	numeric, err := parse(root, "server/internal/core/value/numeric.go")
	if err != nil {
		return out, err
	}
	err = declarations(numeric, token.CONST, func(name string, expr ast.Expr) error {
		if name != "NumericPrecision" && name != "NumericScale" {
			return nil
		}
		value, err := integer(expr)
		if err == nil {
			out.Numeric[strings.TrimPrefix(name, "Numeric")] = value
		}
		return err
	})
	if err != nil {
		return out, err
	}
	if len(out.Numeric) != 2 || out.Numeric["Precision"] <= out.Numeric["Scale"] {
		return out, fmt.Errorf("invalid numeric contract")
	}
	out.RPC, err = rpcMethods(root)
	return out, err
}

func main() {
	root := flag.String("root", "..", "repository root")
	flag.Parse()
	result, err := collect(*root)
	if err == nil {
		err = json.NewEncoder(os.Stdout).Encode(result)
	}
	if err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}
