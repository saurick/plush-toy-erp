package main

import (
	"go/ast"
	"strings"
)

func (s *rpcInspector) parameterRule(name string, call *ast.CallExpr, env rpcInspectionEnv) {
	if len(call.Args) < 1 {
		return
	}
	fieldName, scalar := s.field(call.Args[0], env)
	if m, ok := call.Args[0].(*ast.Ident); ok {
		if _, container := env.maps[m.Name]; container {
			scalar = false
		}
	}
	if !scalar {
		if len(call.Args) < 2 {
			return
		}
		m, ok := call.Args[0].(*ast.Ident)
		if !ok {
			return
		}
		prefix, ok := env.maps[m.Name]
		if !ok {
			return
		}
		key, ok := s.value(call.Args[1], env)
		if !ok || key == "" {
			return
		}
		fieldName = prefix + key
	}
	lower := strings.ToLower(name)
	if strings.Contains(lower, "allow") || strings.Contains(lower, "rejectunknown") {
		return
	}
	fn, ok := s.functions[name]
	if !ok || fn.fn.Type.Results == nil || len(fn.fn.Type.Results.List) == 0 {
		return
	}
	kind := ""
	var resultType func(ast.Expr) string
	resultType = func(e ast.Expr) string {
		switch t := e.(type) {
		case *ast.StarExpr:
			return resultType(t.X)
		case *ast.SelectorExpr:
			if t.Sel.Name == "Decimal" {
				return "string"
			}
			if t.Sel.Name == "Time" {
				return "integer | string"
			}
		case *ast.Ident:
			switch t.Name {
			case "string":
				return "string"
			case "int", "int64", "int32", "int16", "int8":
				return "integer"
			case "bool":
				return "boolean"
			}
		case *ast.MapType:
			return "object"
		case *ast.ArrayType:
			return "array"
		}
		return ""
	}
	kind = resultType(fn.fn.Type.Results.List[0].Type)
	if kind == "integer | string" && strings.Contains(lower, "unix") {
		kind = "integer"
	}
	if kind == "" {
		return
	}
	if scalar && kind == "boolean" {
		return
	}
	field := s.parameters[fieldName]
	if field.hasRule && field.ruleDepth < s.callDepth {
		return
	}
	acceptedConditions := append([]rpcParameterCondition{}, field.RequiredWhen...)
	field.Name, field.Type = fieldName, kind
	field.Source, field.Expression = s.ref(call), s.expression(call)
	field.Required = "按业务条件"
	field.ruleDepth, field.hasRule = s.callDepth, true
	field.Nullable = field.nullAccepted || name == "getString" || name == "getInt" || name == "getBool" || name == "getMap" || name == "getStringSlice" || name == "getWorkflowStringPtr" || name == "getWorkflowPayload"
	ast.Inspect(fn.fn.Body, func(node ast.Node) bool {
		if branch, ok := node.(*ast.IfStmt); ok && strings.Contains(s.expression(branch.Cond), "== nil") {
			for _, statement := range branch.Body.List {
				if ret, ok := statement.(*ast.ReturnStmt); ok && len(ret.Results) > 0 {
					if value, ok := ret.Results[len(ret.Results)-1].(*ast.Ident); ok && (value.Name == "true" || (value.Name == "nil" && len(ret.Results) == 1)) {
						field.Nullable = true
					}
				}
			}
		}
		return true
	})
	if strings.Contains(lower, "required") {
		field.Required = "必填"
		if s.conditional > 0 {
			field.RequiredWhen = append([]rpcParameterCondition{}, s.parameterConditions...)
			field.Required = rpcParameterRequirement(field.RequiredWhen)
		}
	} else if strings.Contains(lower, "optional") || name == "getBool" || name == "getStringSlice" || name == "getWorkflowStringPtr" {
		field.Required = "可选"
	}
	if name == "getStrictStringSlice" && len(call.Args) > 2 {
		if required, known := s.value(call.Args[2], env); known {
			if required == "true" {
				field.Required = "必填"
			} else {
				field.Required = "可选"
			}
		}
	}
	if field.absenceAccepted {
		field.Required, field.RequiredWhen = "可选", acceptedConditions
		if len(acceptedConditions) > 0 {
			field.Required = rpcParameterRequirement(acceptedConditions)
		}
	}
	description := "解析器 `" + name + "`；调用 `" + s.expression(call) + "`。"
	if strings.Contains(lower, "positiveint") || name == "positiveSafeIntegerParam" {
		description += " 正 JSON 安全整数；对象存在性和可操作状态由所属业务校验。"
	}
	if strings.Contains(lower, "numeric20scale6") || strings.Contains(lower, "decimalstring") {
		description += " 十进制字符串，保留精度；不以 JSON 浮点数代替。"
	}
	if name == "getString" {
		description += " 缺失或 null 读取为空字符串；非字符串沿当前解析器转换，业务必填与枚举在调用链校验。"
	}
	if name == "getInt" {
		description += " 缺失、null 或非数值使用调用处默认值；JSON 数值沿当前整数读取规则处理。"
	}
	field.Description = description
	s.parameters[fieldName] = field
}
