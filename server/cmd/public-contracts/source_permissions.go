package main

import (
	"fmt"
	"go/ast"
	"go/token"
	"strings"
)

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
