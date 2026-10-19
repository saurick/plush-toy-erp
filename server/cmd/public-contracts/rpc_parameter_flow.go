package main

import (
	"go/ast"
	"go/token"
)

// Dispatch returns stop the source walk. Successful optional branches constrain
// the remaining parser statements; error guards do not make required input optional.
func (s *rpcInspector) walkStatements(statements []ast.Stmt, env rpcInspectionEnv) {
	oldConditions, oldConditional := s.parameterConditions, s.conditional
	defer func() { s.parameterConditions, s.conditional = oldConditions, oldConditional }()
	for _, statement := range statements {
		s.walk(statement, env)
		if s.parameterTerminates(statement, env) {
			return
		}
		if branch, ok := statement.(*ast.IfStmt); ok && branch.Else == nil && s.successfulParameterReturn(branch.Body) {
			if _, known := s.condition(branch.Cond, env); !known {
				s.conditional++
				s.parameterConditions = append(append([]rpcParameterCondition{}, s.parameterConditions...), s.continuationConditions(branch.Cond, false, env)...)
			}
		}
	}
}

func (s *rpcInspector) parameterTerminates(node ast.Node, env rpcInspectionEnv) bool {
	switch x := node.(type) {
	case *ast.ReturnStmt:
		return true
	case *ast.BlockStmt:
		for _, statement := range x.List {
			if s.parameterTerminates(statement, env) {
				return true
			}
		}
	case *ast.IfStmt:
		if value, known := s.condition(x.Cond, env); known {
			if value {
				return s.parameterTerminates(x.Body, env)
			}
			return s.parameterTerminates(x.Else, env)
		}
		return x.Else != nil && s.parameterTerminates(x.Body, env) && s.parameterTerminates(x.Else, env)
	case *ast.SwitchStmt:
		if value, known := s.value(x.Tag, env); known {
			var fallback *ast.CaseClause
			for _, item := range x.Body.List {
				clause := item.(*ast.CaseClause)
				if len(clause.List) == 0 {
					fallback = clause
				}
				for _, label := range clause.List {
					if text, known := s.value(label, env); known && text == value {
						return s.parameterTerminates(&ast.BlockStmt{List: clause.Body}, env)
					}
				}
			}
			if fallback != nil {
				return s.parameterTerminates(&ast.BlockStmt{List: fallback.Body}, env)
			}
		}
	}
	return false
}

func (s *rpcInspector) successfulParameterReturn(block *ast.BlockStmt) bool {
	if block == nil || len(block.List) == 0 {
		return false
	}
	ret, ok := block.List[len(block.List)-1].(*ast.ReturnStmt)
	if !ok || len(ret.Results) == 0 {
		return false
	}
	last, ok := ret.Results[len(ret.Results)-1].(*ast.Ident)
	if !ok {
		return false
	}
	return last.Name == "true" || (last.Name == "nil" && len(ret.Results) == 2)
}

func (s *rpcInspector) continuationConditions(expr ast.Expr, truth bool, env rpcInspectionEnv) []rpcParameterCondition {
	switch x := expr.(type) {
	case *ast.ParenExpr:
		return s.continuationConditions(x.X, truth, env)
	case *ast.UnaryExpr:
		if x.Op == token.NOT {
			return s.continuationConditions(x.X, !truth, env)
		}
	case *ast.Ident:
		if name := env.presences[x.Name]; name != "" {
			presence := "present"
			if !truth {
				presence = "absent"
			}
			return []rpcParameterCondition{{Field: name, Presence: presence}}
		}
		if name := env.origins[x.Name]; name != "" {
			value := "true"
			if !truth {
				value = "false"
			}
			return []rpcParameterCondition{{Field: name, Equals: value}}
		}
	case *ast.BinaryExpr:
		if (x.Op == token.LAND && truth) || (x.Op == token.LOR && !truth) {
			return append(s.continuationConditions(x.X, truth, env), s.continuationConditions(x.Y, truth, env)...)
		}
		if x.Op == token.EQL && truth || x.Op == token.NEQ && !truth {
			if name, known := s.field(x.X, env); known {
				if value, known := s.value(x.Y, env); known {
					return []rpcParameterCondition{{Field: name, Equals: value}}
				}
			}
		}
	}
	return nil
}
