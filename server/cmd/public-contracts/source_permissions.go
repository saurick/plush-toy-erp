package main

import (
	"fmt"
	"go/ast"
	"go/token"
	"strings"
)

type sourcePermissionRule struct {
	Permission string `json:"permission"`
	Condition  string `json:"condition,omitempty"`
}

// Permission names come from the same registry used by RBAC at runtime.
func permissionLabels(rbac *ast.File) (map[string]string, error) {
	constants := map[string]string{}
	if err := declarations(rbac, token.CONST, func(name string, expr ast.Expr) error {
		if !strings.HasPrefix(name, "Permission") || strings.HasPrefix(name, "PermissionClass") {
			return nil
		}
		value, err := text(expr)
		constants[name] = value
		return err
	}); err != nil {
		return nil, err
	}
	resolve := func(expr ast.Expr, prefix string) (string, error) {
		name, ok := expr.(*ast.Ident)
		if !ok || !strings.HasPrefix(name.Name, prefix) || constants[name.Name] == "" {
			return "", fmt.Errorf("unresolved %s declaration: %v", prefix, expr)
		}
		return constants[name.Name], nil
	}
	labels := map[string]string{}
	err := declarations(rbac, token.VAR, func(name string, expr ast.Expr) error {
		if name != "builtinPermissions" {
			return nil
		}
		call, ok := expr.(*ast.CallExpr)
		if !ok || len(call.Args) != 1 {
			return fmt.Errorf("unsupported permission registry")
		}
		wrapper, ok := call.Fun.(*ast.Ident)
		if !ok || wrapper.Name != "withBuiltinPermissionMetadata" {
			return fmt.Errorf("unsupported permission metadata wrapper")
		}
		list, ok := call.Args[0].(*ast.CompositeLit)
		if !ok {
			return fmt.Errorf("expected permission registry literal")
		}
		for _, item := range list.Elts {
			fields, err := sourcePermissionFields(item)
			if err != nil {
				return err
			}
			permission, err := resolve(fields["Key"], "Permission")
			if err != nil {
				return err
			}
			label, err := text(fields["Name"])
			if err != nil || label == "" || labels[permission] != "" {
				return fmt.Errorf("invalid or duplicate permission label: %s", permission)
			}
			labels[permission] = label
		}
		return nil
	})
	if err != nil || len(labels) == 0 {
		return nil, fmt.Errorf("permission labels: %v", err)
	}
	return labels, nil
}

// Read the same declarations used by the service guards, without executing
// runtime initialization. Unsupported shapes must stop contract generation.
func sourcePermissions(rbac, source *ast.File) (map[string][]sourcePermissionRule, map[string]string, error) {
	constants := map[string]string{}
	for _, file := range []*ast.File{rbac, source} {
		if err := declarations(file, token.CONST, func(name string, expr ast.Expr) error {
			if (!strings.HasPrefix(name, "Permission") || strings.HasPrefix(name, "PermissionClass")) && !strings.HasPrefix(name, "SourceReadCondition") {
				return nil
			}
			value, err := text(expr)
			constants[name] = value
			return err
		}); err != nil {
			return nil, nil, err
		}
	}
	resolve := func(expr ast.Expr, prefix string) (string, error) {
		name, ok := expr.(*ast.Ident)
		if !ok || !strings.HasPrefix(name.Name, prefix) || constants[name.Name] == "" {
			return "", fmt.Errorf("unresolved %s declaration: %v", prefix, expr)
		}
		return constants[name.Name], nil
	}
	labels, err := permissionLabels(rbac)
	if err != nil {
		return nil, nil, err
	}
	functions := map[string]*ast.FuncDecl{}
	for _, decl := range source.Decls {
		if fn, ok := decl.(*ast.FuncDecl); ok {
			functions[fn.Name.Name] = fn
		}
	}
	var rules func(ast.Expr, int) ([]sourcePermissionRule, error)
	rules = func(expr ast.Expr, depth int) ([]sourcePermissionRule, error) {
		if depth > 2 {
			return nil, fmt.Errorf("recursive source rule helper")
		}
		out := []sourcePermissionRule{}
		if call, ok := expr.(*ast.CallExpr); ok {
			name, ok := call.Fun.(*ast.Ident)
			if !ok {
				return nil, fmt.Errorf("unsupported source rule call")
			}
			if name.Name == "sourceReadRules" {
				for _, arg := range call.Args {
					permission, err := resolve(arg, "Permission")
					if err != nil {
						return nil, err
					}
					out = append(out, sourcePermissionRule{Permission: permission})
				}
				return out, nil
			}
			fn := functions[name.Name]
			if len(call.Args) != 0 || fn == nil || fn.Body == nil || len(fn.Body.List) != 1 {
				return nil, fmt.Errorf("unsupported source rule helper %s", name.Name)
			}
			ret, ok := fn.Body.List[0].(*ast.ReturnStmt)
			if !ok || len(ret.Results) != 1 {
				return nil, fmt.Errorf("source rule helper must return a literal")
			}
			return rules(ret.Results[0], depth+1)
		}
		list, ok := expr.(*ast.CompositeLit)
		if !ok {
			return nil, fmt.Errorf("expected source rule literal, got %T", expr)
		}
		for _, item := range list.Elts {
			fields, err := sourcePermissionFields(item)
			if err != nil {
				return nil, err
			}
			permission, err := resolve(fields["PermissionKey"], "Permission")
			if err != nil {
				return nil, err
			}
			rule := sourcePermissionRule{Permission: permission}
			if condition, exists := fields["Condition"]; exists {
				rule.Condition, err = resolve(condition, "SourceReadCondition")
				if err != nil {
					return nil, err
				}
			}
			out = append(out, rule)
		}
		return out, nil
	}
	contracts := map[string][]sourcePermissionRule{}
	err = declarations(source, token.VAR, func(name string, expr ast.Expr) error {
		if name != "publicSourceActionReadPermissionContracts" {
			return nil
		}
		list, ok := expr.(*ast.CompositeLit)
		if !ok {
			return fmt.Errorf("expected source permission registry literal")
		}
		for _, item := range list.Elts {
			fields, err := sourcePermissionFields(item)
			if err != nil {
				return err
			}
			domain, err := text(fields["Domain"])
			if err != nil {
				return err
			}
			method, err := text(fields["Method"])
			if err != nil {
				return err
			}
			key := domain + "." + method
			if domain == "" || method == "" || contracts[key] != nil {
				return fmt.Errorf("invalid or duplicate source action: %s", key)
			}
			contracts[key], err = rules(fields["Rules"], 0)
			if err != nil || len(contracts[key]) == 0 {
				return fmt.Errorf("source action %s: %v", key, err)
			}
			for _, rule := range contracts[key] {
				if labels[rule.Permission] == "" {
					return fmt.Errorf("unregistered source permission: %s", rule.Permission)
				}
			}
		}
		return nil
	})
	if err != nil || len(contracts) == 0 {
		return nil, nil, fmt.Errorf("source permissions: %v", err)
	}
	return contracts, labels, nil
}

func sourcePermissionFields(expr ast.Expr) (map[string]ast.Expr, error) {
	literal, ok := expr.(*ast.CompositeLit)
	if !ok {
		return nil, fmt.Errorf("expected keyed permission literal")
	}
	fields := map[string]ast.Expr{}
	for _, field := range literal.Elts {
		pair, ok := field.(*ast.KeyValueExpr)
		if !ok {
			return nil, fmt.Errorf("expected keyed permission field")
		}
		name, ok := pair.Key.(*ast.Ident)
		if !ok || fields[name.Name] != nil {
			return nil, fmt.Errorf("invalid or duplicate permission field")
		}
		fields[name.Name] = pair.Value
	}
	return fields, nil
}
