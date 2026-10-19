package main

import (
	"go/ast"
	"go/token"
	"strings"
)

func rpcParameterRequirement(conditions []rpcParameterCondition) string {
	if len(conditions) == 0 {
		return "条件必填"
	}
	parts := make([]string, 0, len(conditions))
	for _, condition := range conditions {
		if len(condition.AnyOf) > 0 {
			values := []string{}
			for _, alternative := range condition.AnyOf {
				values = append(values, alternative.Field+" 有值")
			}
			parts = append(parts, "任一 "+strings.Join(values, " / "))
		} else if condition.Presence == "nonnull" || condition.Presence == "present" {
			parts = append(parts, condition.Field+" 有值")
		} else if condition.Presence == "absent" {
			parts = append(parts, condition.Field+" 未提供")
		} else {
			parts = append(parts, condition.Field+"="+condition.Equals)
		}
	}
	return "条件必填（" + strings.Join(parts, " 且 ") + "）"
}

// Some parsers accept an entirely omitted pair, then reject partial input.
// Keep that successful absence path when later scalar guards require a value.
func (s *rpcInspector) parameterOptionalBranch(branch *ast.IfStmt, env rpcInspectionEnv) {
	if len(branch.Body.List) == 0 {
		return
	}
	if assignment, ok := branch.Body.List[0].(*ast.AssignStmt); ok && len(branch.Body.List) == 1 && len(assignment.Lhs) == 1 && len(assignment.Rhs) == 1 {
		flag, isFlag := assignment.Lhs[0].(*ast.Ident)
		value, isFalse := assignment.Rhs[0].(*ast.Ident)
		if !isFlag || !isFalse || value.Name != "false" || env.presences[flag.Name] == "" {
			return
		}
		name := env.presences[flag.Name]
		ast.Inspect(branch.Cond, func(node ast.Node) bool {
			if comparison, ok := node.(*ast.BinaryExpr); ok && comparison.Op == token.EQL {
				if nilValue, ok := comparison.Y.(*ast.Ident); ok && nilValue.Name == "nil" {
					if field, known := s.field(comparison.X, env); known && field == name {
						f := s.parameters[name]
						f.Name, f.nullAccepted, f.Nullable = name, true, true
						s.parameters[name] = f
					}
				}
			}
			return true
		})
		return
	}
	if !s.successfulParameterReturn(branch.Body) {
		return
	}
	var missing func(ast.Expr) ([]string, bool)
	missing = func(expr ast.Expr) ([]string, bool) {
		switch x := expr.(type) {
		case *ast.ParenExpr:
			return missing(x.X)
		case *ast.UnaryExpr:
			if x.Op == token.NOT {
				if id, ok := x.X.(*ast.Ident); ok && env.presences[id.Name] != "" {
					return []string{env.presences[id.Name]}, true
				}
			}
		case *ast.BinaryExpr:
			if x.Op == token.LAND {
				left, l := missing(x.X)
				right, r := missing(x.Y)
				return append(left, right...), l && r
			}
			if x.Op == token.LOR {
				left, l := missing(x.X)
				right, r := missing(x.Y)
				if l && r && len(left) == 1 && len(right) == 1 && left[0] == right[0] {
					return left, true
				}
			}
			if x.Op == token.EQL {
				if nilValue, ok := x.Y.(*ast.Ident); ok && nilValue.Name == "nil" {
					if name, known := s.field(x.X, env); known {
						field := s.parameters[name]
						field.Name, field.nullAccepted, field.Nullable = name, true, true
						s.parameters[name] = field
						return []string{name}, true
					}
				}
			}
		}
		return nil, false
	}
	names, ok := missing(branch.Cond)
	if !ok {
		return
	}
	for _, name := range names {
		field := s.parameters[name]
		field.Name, field.absenceAccepted = name, true
		field.Required, field.RequiredWhen = "可选", nil
		alternatives := []rpcParameterCondition{}
		for _, other := range names {
			if other != name {
				alternatives = append(alternatives, rpcParameterCondition{Field: other, Presence: "nonnull"})
			}
		}
		if len(alternatives) == 1 {
			field.optionalPeers = alternatives
		} else if len(alternatives) > 1 {
			field.optionalPeers = []rpcParameterCondition{{AnyOf: alternatives}}
		}
		s.parameters[name] = field
	}
}

func (s *rpcInspector) parameterField(call *ast.CallExpr, env rpcInspectionEnv) (string, bool) {
	name := strings.ToLower(rpcInspectionName(call.Fun))
	if strings.Contains(name, "allow") || strings.Contains(name, "rejectunknown") {
		return "", false
	}
	if len(call.Args) == 1 {
		return s.field(call.Args[0], env)
	}
	if len(call.Args) > 1 {
		if m, ok := call.Args[0].(*ast.Ident); ok {
			if prefix, known := env.maps[m.Name]; known {
				if key, known := s.value(call.Args[1], env); known {
					return prefix + key, true
				}
			}
		}
	}
	return "", false
}

// A parser's valid flag can be required only for one owner/action. The rejecting
// caller guard determines that condition; the inner parser name cannot do so.
func (s *rpcInspector) parameterGuard(branch *ast.IfStmt, env rpcInspectionEnv) {
	if len(branch.Body.List) != 1 {
		return
	}
	ret, ok := branch.Body.List[0].(*ast.ReturnStmt)
	if !ok {
		return
	}
	reject := strings.Contains(strings.ToLower(s.expression(ret)), "invalid")
	if len(ret.Results) > 0 {
		if value, ok := ret.Results[len(ret.Results)-1].(*ast.Ident); ok && value.Name == "false" {
			reject = true
		}
	}
	if !reject {
		return
	}
	ast.Inspect(branch.Cond, func(node ast.Node) bool {
		if call, ok := node.(*ast.CallExpr); ok && rpcQualifiedName(call.Fun) == "math.Trunc" && len(call.Args) == 1 {
			if name, known := s.field(call.Args[0], env); known {
				field := s.parameters[name]
				if field.Type == "number" {
					field.Type = "integer"
					s.parameters[name] = field
				}
			}
		}
		return true
	})
	type requirement struct {
		field       string
		boolean     bool
		conditional bool
		conditions  []rpcParameterCondition
	}
	var requirements []requirement
	predicate := func(expr ast.Expr) (rpcParameterCondition, bool) {
		if id, ok := expr.(*ast.Ident); ok {
			if field := env.presences[id.Name]; field != "" {
				return rpcParameterCondition{Field: field, Presence: "present"}, true
			}
		}
		if binary, ok := expr.(*ast.BinaryExpr); ok && binary.Op == token.EQL {
			if field, known := s.field(binary.X, env); known {
				if value, known := s.value(binary.Y, env); known && value != "" {
					return rpcParameterCondition{Field: field, Equals: value}, true
				}
			}
		}
		return rpcParameterCondition{}, false
	}
	var inspect func(ast.Expr, []rpcParameterCondition, bool)
	inspect = func(expr ast.Expr, conditions []rpcParameterCondition, conditional bool) {
		if _, known := s.condition(expr, env); known {
			return
		}
		if paren, ok := expr.(*ast.ParenExpr); ok {
			inspect(paren.X, conditions, conditional)
			return
		}
		if not, ok := expr.(*ast.UnaryExpr); ok && not.Op == token.NOT {
			if id, ok := not.X.(*ast.Ident); ok {
				field := env.validations[id.Name]
				if field == "" {
					field = env.presences[id.Name]
				}
				if field != "" {
					requirements = append(requirements, requirement{field: field, boolean: true, conditional: conditional, conditions: conditions})
					return
				}
			}
		}
		if binary, ok := expr.(*ast.BinaryExpr); ok {
			if binary.Op == token.LOR {
				inspect(binary.X, conditions, conditional)
				inspect(binary.Y, conditions, conditional)
				return
			}
			if binary.Op == token.LAND {
				if value, known := s.condition(binary.X, env); known {
					if value {
						inspect(binary.Y, conditions, conditional)
					}
					return
				}
				if value, known := s.condition(binary.Y, env); known {
					if value {
						inspect(binary.X, conditions, conditional)
					}
					return
				}
				left, right := append([]rpcParameterCondition{}, conditions...), append([]rpcParameterCondition{}, conditions...)
				if c, ok := predicate(binary.Y); ok {
					left = append(left, c)
				}
				if c, ok := predicate(binary.X); ok {
					right = append(right, c)
				}
				inspect(binary.X, left, true)
				inspect(binary.Y, right, true)
				return
			}
			if binary.Op == token.EQL {
				field, known := s.field(binary.X, env)
				value, valueKnown := s.value(binary.Y, env)
				if known && valueKnown && value == "" {
					requirements = append(requirements, requirement{field: field, conditional: conditional, conditions: conditions})
					return
				}
				if known {
					if id, ok := binary.Y.(*ast.Ident); ok && id.Name == "nil" {
						requirements = append(requirements, requirement{field: field, conditional: conditional, conditions: conditions})
					}
				}
			}
		}
	}
	inspect(branch.Cond, append([]rpcParameterCondition{}, s.parameterConditions...), s.conditional > 0)
	for _, requirement := range requirements {
		field, ok := s.parameters[requirement.field]
		if !ok {
			continue
		}
		if field.hasRule && s.callDepth > field.ruleDepth {
			continue
		}
		if field.absenceAccepted {
			if len(field.optionalPeers) == 0 || requirement.boolean && field.hasRule && field.Required == "可选" {
				continue
			}
			selfPresence := false
			for _, condition := range requirement.conditions {
				if condition.Field == requirement.field && condition.Presence == "present" {
					selfPresence = true
				}
			}
			if selfPresence {
				continue
			}
			requirement.conditions = append(append([]rpcParameterCondition{}, requirement.conditions...), field.optionalPeers...)
			requirement.conditional = true
		}
		if requirement.boolean && field.Required == "可选" && (!field.absenceAccepted || len(field.optionalPeers) == 0 || field.hasRule) {
			continue
		}
		field.Required = "必填"
		field.RequiredWhen = nil
		if requirement.conditional || len(requirement.conditions) > 0 {
			field.RequiredWhen = requirement.conditions
			field.Required = rpcParameterRequirement(requirement.conditions)
		}
		if !requirement.boolean && !requirement.conditional {
			field.Nullable = false
		}
		text := " 拒绝条件：“" + s.expression(branch.Cond) + "”。"
		if !strings.Contains(field.Description, text) {
			field.Description += text
		}
		s.parameters[requirement.field] = field
	}
}
