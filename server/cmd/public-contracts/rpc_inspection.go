package main

import (
	"bytes"
	"fmt"
	"go/ast"
	"go/format"
	"go/parser"
	"go/token"
	"path/filepath"
	"sort"
	"strings"
)

// This is a source-reading index, not a schema or an authorization decision.
// Only the selected method branches and local calls receiving its params are
// followed. Unresolved constraints remain in the formal method contract.
type rpcSourceRef struct {
	Path string `json:"path"`
	Line int    `json:"line"`
}
type rpcSourceField struct {
	Name            string                  `json:"name"`
	Type            string                  `json:"type"`
	Source          rpcSourceRef            `json:"source"`
	Expression      string                  `json:"expression"`
	Required        string                  `json:"required,omitempty"`
	Description     string                  `json:"description,omitempty"`
	Nullable        bool                    `json:"nullable,omitempty"`
	RequiredWhen    []rpcParameterCondition `json:"requiredWhen,omitempty"`
	ruleDepth       int
	hasRule         bool
	absenceAccepted bool
	nullAccepted    bool
	optionalPeers   []rpcParameterCondition
}

type rpcParameterCondition struct {
	Field    string                  `json:"field"`
	Equals   string                  `json:"equals,omitempty"`
	Presence string                  `json:"presence,omitempty"`
	AnyOf    []rpcParameterCondition `json:"anyOf,omitempty"`
}
type rpcSourceInspection struct {
	Entry           rpcSourceRef     `json:"entry"`
	Parameters      []rpcSourceField `json:"parameters"`
	Response        []rpcSourceField `json:"response"`
	EmptyParameters bool             `json:"emptyParameters"`
	EmptyData       bool             `json:"emptyData"`
}
type rpcInspectionFunction struct {
	fn   *ast.FuncDecl
	path string
}
type rpcInspectionEnv struct {
	strings     map[string]string
	maps        map[string]string
	lists       map[string][]string
	origins     map[string]string
	types       map[string]string
	validations map[string]string
	presences   map[string]string
}
type rpcInspector struct {
	root                string
	positions           *token.FileSet
	functions           map[string]rpcInspectionFunction
	seen                map[string]bool
	parameters          map[string]rpcSourceField
	allowed             map[string]bool
	allowedByPrefix     map[string]map[string]bool
	constants           map[string]string
	conditional         int
	callDepth           int
	parameterConditions []rpcParameterCondition
	shapes              *rpcShapeReader
	rejected            map[string]bool
	hasAllowed          bool
	response            map[string]rpcSourceField
	result              rpcSourceInspection
}

func rpcInspectionName(expr ast.Expr) string {
	switch x := expr.(type) {
	case *ast.Ident:
		return x.Name
	case *ast.SelectorExpr:
		return x.Sel.Name
	}
	return ""
}
func rpcInspectionParams(fn *ast.FuncDecl) []string {
	var names []string
	if fn.Type.Params != nil {
		for _, field := range fn.Type.Params.List {
			for _, name := range field.Names {
				names = append(names, name.Name)
			}
		}
	}
	return names
}
func rpcInspectionType(expr ast.Expr) string {
	switch x := expr.(type) {
	case *ast.Ident:
		switch x.Name {
		case "string":
			return "string"
		case "bool":
			return "boolean"
		case "float64", "float32", "int", "int64", "int32":
			return "number"
		}
	case *ast.ArrayType:
		return "array"
	case *ast.MapType:
		return "object"
	}
	return "待核对"
}
func (s *rpcInspector) ref(node ast.Node) rpcSourceRef {
	p := s.positions.Position(node.Pos())
	path, _ := filepath.Rel(s.root, p.Filename)
	return rpcSourceRef{Path: filepath.ToSlash(path), Line: p.Line}
}
func (s *rpcInspector) expression(node ast.Node) string {
	var b bytes.Buffer
	_ = format.Node(&b, s.positions, node)
	return b.String()
}
func (s *rpcInspector) value(expr ast.Expr, env rpcInspectionEnv) (string, bool) {
	if v, err := text(expr); err == nil {
		return v, true
	}
	if id, ok := expr.(*ast.Ident); ok {
		if id.Name == "true" || id.Name == "false" {
			return id.Name, true
		}
		if env.presences[id.Name] != "" || env.validations[id.Name] != "" {
			return "", false
		}
		v, found := env.strings[id.Name]
		if !found {
			v, found = s.constants["service."+id.Name]
		}
		return v, found
	}
	if v, found := s.constants[rpcQualifiedName(expr)]; found {
		return v, true
	}
	if v, found := env.strings[rpcQualifiedName(expr)]; found {
		return v, true
	}
	if _, ok := expr.(*ast.BinaryExpr); ok {
		if v, known := s.condition(expr, env); known {
			if v {
				return "true", true
			}
			return "false", true
		}
	}
	return "", false
}
func (s *rpcInspector) condition(expr ast.Expr, env rpcInspectionEnv) (bool, bool) {
	if id, ok := expr.(*ast.Ident); ok {
		if id.Name == "true" || id.Name == "false" {
			return id.Name == "true", true
		}
		if env.presences[id.Name] != "" || env.validations[id.Name] != "" {
			return false, false
		}
		if v := env.strings[id.Name]; v == "true" || v == "false" {
			return v == "true", true
		}
	}
	if unary, ok := expr.(*ast.UnaryExpr); ok && unary.Op == token.NOT {
		v, known := s.condition(unary.X, env)
		return !v, known
	}
	if binary, ok := expr.(*ast.BinaryExpr); ok {
		if binary.Op == token.EQL || binary.Op == token.NEQ {
			left, l := s.value(binary.X, env)
			right, r := s.value(binary.Y, env)
			if l && r {
				same := left == right
				return same == (binary.Op == token.EQL), true
			}
		}
		if binary.Op == token.LAND || binary.Op == token.LOR {
			left, l := s.condition(binary.X, env)
			right, r := s.condition(binary.Y, env)
			if l && r {
				if binary.Op == token.LAND {
					return left && right, true
				}
				return left || right, true
			}
		}
	}
	if call, ok := expr.(*ast.CallExpr); ok && len(call.Args) == 1 {
		target, found := s.functions[rpcInspectionName(call.Fun)]
		names := []string{}
		if found {
			names = rpcInspectionParams(target.fn)
		}
		if len(names) == 1 {
			if value, known := s.value(call.Args[0], env); known {
				for _, sw := range switches(target.fn, names[0]) {
					var fallback *ast.CaseClause
					for _, item := range sw.Body.List {
						clause := item.(*ast.CaseClause)
						if clause.List == nil {
							fallback = clause
						}
						for _, label := range clause.List {
							if literal, err := text(label); err == nil && literal == value {
								if len(clause.Body) == 1 {
									if ret, ok := clause.Body[0].(*ast.ReturnStmt); ok && len(ret.Results) == 1 {
										return s.condition(ret.Results[0], env)
									}
								}
							}
						}
					}
					if fallback != nil && len(fallback.Body) == 1 {
						if ret, ok := fallback.Body[0].(*ast.ReturnStmt); ok && len(ret.Results) == 1 {
							return s.condition(ret.Results[0], env)
						}
					}
				}
			}
		}
	}
	return false, false
}
func (s *rpcInspector) field(expr ast.Expr, env rpcInspectionEnv) (string, bool) {
	if call, ok := expr.(*ast.CallExpr); ok {
		return s.parameterField(call, env)
	}
	if id, ok := expr.(*ast.Ident); ok {
		v, found := env.origins[id.Name]
		return v, found
	}
	index, ok := expr.(*ast.IndexExpr)
	if !ok {
		return "", false
	}
	id, ok := index.X.(*ast.Ident)
	if !ok {
		return "", false
	}
	prefix, root := env.maps[id.Name]
	if !root {
		if origin, known := env.origins[id.Name]; known {
			if _, stringKey := s.value(index.Index, env); !stringKey {
				kind := s.parameters[origin].Type
				if env.types[id.Name] == "string" || (kind != "" && kind != "待核对" && kind != "json" && kind != "array") {
					return "", false
				}
				return origin + "[]", true
			}
		}
		return "", false
	}
	name, known := s.value(index.Index, env)
	return prefix + name, known && name != ""
}
func (s *rpcInspector) record(target map[string]rpcSourceField, name, kind string, node ast.Node) {
	field, ok := target[name]
	if ok && field.Type != "待核对" && field.Type != "" {
		return
	}
	field.Name, field.Type, field.Source, field.Expression = name, kind, s.ref(node), s.expression(node)
	target[name] = field
}
func (s *rpcInspector) walk(node ast.Node, env rpcInspectionEnv) {
	if node == nil {
		return
	}
	ast.Inspect(node, func(n ast.Node) bool {
		if n == nil {
			return false
		}
		switch x := n.(type) {
		case *ast.BlockStmt:
			s.walkStatements(x.List, env)
			return false
		case *ast.SwitchStmt:
			if tag, known := s.value(x.Tag, env); known {
				var fallback *ast.CaseClause
				for _, item := range x.Body.List {
					clause := item.(*ast.CaseClause)
					if clause.List == nil {
						fallback = clause
					}
					for _, label := range clause.List {
						if v, ok := s.value(label, env); ok && v == tag {
							if s.result.Entry.Path == "" {
								s.result.Entry = s.ref(clause)
							}
							s.walkStatements(clause.Body, env)
							return false
						}
					}
				}
				if fallback != nil {
					s.walkStatements(fallback.Body, env)
				}
				return false
			}
			if x.Tag != nil {
				field, hasField := s.field(x.Tag, env)
				for _, item := range x.Body.List {
					clause := item.(*ast.CaseClause)
					old := s.parameterConditions
					if hasField && len(clause.List) == 1 {
						if value, known := s.value(clause.List[0], env); known {
							s.parameterConditions = append(append([]rpcParameterCondition{}, old...), rpcParameterCondition{Field: field, Equals: value})
						}
					}
					s.conditional++
					s.walkStatements(clause.Body, env)
					s.conditional--
					s.parameterConditions = old
				}
				return false
			}
		case *ast.IfStmt:
			if init, ok := x.Init.(*ast.AssignStmt); ok && len(init.Lhs) == 2 && len(init.Rhs) == 1 {
				if condition, ok := x.Cond.(*ast.Ident); ok {
					if flag, ok := init.Lhs[1].(*ast.Ident); ok && condition.Name == flag.Name {
						if field, ok := s.field(init.Rhs[0], env); ok {
							body := s.expression(x.Body)
							directReturn := false
							if len(x.Body.List) == 1 {
								_, directReturn = x.Body.List[0].(*ast.ReturnStmt)
							}
							if s.conditional == 0 && len(x.Body.List) == 1 && directReturn && (strings.Contains(body, "invalidParamResult()") || strings.Contains(body, "invalidAdminParamResult()") || strings.Contains(body, ", false")) {
								s.rejected[field] = true
							}
						}
					}
				}
			}
			s.walk(x.Init, env)
			s.parameterOptionalBranch(x, env)
			if value, known := s.condition(x.Cond, env); known {
				if value {
					s.walk(x.Body, env)
				} else {
					s.walk(x.Else, env)
				}
				return false
			}
			s.parameterGuard(x, env)
			s.walk(x.Cond, env)
			oldConditions := s.parameterConditions
			s.conditional++
			s.parameterConditions = append(append([]rpcParameterCondition{}, oldConditions...), s.continuationConditions(x.Cond, true, env)...)
			s.walk(x.Body, env)
			s.parameterConditions = append(append([]rpcParameterCondition{}, oldConditions...), s.continuationConditions(x.Cond, false, env)...)
			s.walk(x.Else, env)
			s.parameterConditions = oldConditions
			s.conditional--
			return false
		case *ast.RangeStmt:
			if literal, ok := x.X.(*ast.CompositeLit); ok {
				var keyName string
				if _, isMap := literal.Type.(*ast.MapType); isMap {
					if id, ok := x.Key.(*ast.Ident); ok {
						keyName = id.Name
					}
				} else if id, ok := x.Value.(*ast.Ident); ok {
					keyName = id.Name
				}
				if keyName != "" {
					for _, item := range literal.Elts {
						value := item
						if pair, ok := item.(*ast.KeyValueExpr); ok {
							value = pair.Key
						}
						if text, known := s.value(value, env); known {
							env.strings[keyName] = text
							s.walk(x.Body, env)
						}
					}
					return false
				}
			}
			if origin, ok := s.field(x.X, env); ok {
				if id, ok := x.Value.(*ast.Ident); ok {
					isMap := false
					if name, ok := x.X.(*ast.Ident); ok {
						isMap = strings.HasPrefix(env.types[name.Name], "map[")
					}
					kind := s.parameters[origin].Type
					if !isMap && (kind == "" || kind == "待核对" || kind == "json" || kind == "array") {
						env.origins[id.Name] = origin + "[]"
					}
				}
			}
		case *ast.AssignStmt:
			if len(x.Rhs) == 1 && len(x.Lhs) == 2 {
				if flag, ok := x.Lhs[1].(*ast.Ident); ok {
					delete(env.validations, flag.Name)
					delete(env.presences, flag.Name)
					switch right := x.Rhs[0].(type) {
					case *ast.CallExpr:
						if field, known := s.parameterField(right, env); known {
							env.validations[flag.Name] = field
						}
					case *ast.TypeAssertExpr:
						if field, known := s.field(right.X, env); known {
							env.validations[flag.Name] = field
						}
					case *ast.IndexExpr:
						if field, known := s.field(right, env); known {
							env.presences[flag.Name] = field
						}
					}
				}
			}
			for i, left := range x.Lhs {
				id, ok := left.(*ast.Ident)
				if !ok || i >= len(x.Rhs) {
					continue
				}
				right := x.Rhs[i]
				if source, ok := right.(*ast.Ident); ok {
					if prefix, ok := env.maps[source.Name]; ok {
						env.maps[id.Name] = prefix
					}
					if typ := env.types[source.Name]; typ != "" {
						env.types[id.Name] = typ
					}
				}
				if origin, ok := s.field(right, env); ok {
					env.origins[id.Name] = origin
				}
				if value, known := s.value(right, env); known {
					env.strings[id.Name] = value
				}
				if lit, ok := right.(*ast.CompositeLit); ok {
					env.types[id.Name] = s.shapes.goType(lit.Type, "service")
					for _, elt := range lit.Elts {
						if pair, ok := elt.(*ast.KeyValueExpr); ok {
							if field, ok := pair.Key.(*ast.Ident); ok {
								if value, ok := s.value(pair.Value, env); ok {
									env.strings[id.Name+"."+field.Name] = value
								}
							}
						}
					}
					if arr, ok := lit.Type.(*ast.ArrayType); ok {
						if t, ok := arr.Elt.(*ast.Ident); ok && t.Name == "string" {
							var values []string
							for _, elt := range lit.Elts {
								if v, ok := s.value(elt, env); ok {
									values = append(values, v)
								}
							}
							env.lists[id.Name] = values
						}
					}
				}
				if assertion, ok := right.(*ast.TypeAssertExpr); ok {
					env.types[id.Name] = s.shapes.goType(assertion.Type, "service")
					if field, ok := s.field(assertion.X, env); ok {
						env.origins[id.Name] = field
						if _, object := assertion.Type.(*ast.MapType); object {
							env.maps[id.Name] = field + "."
						}
					}
				}
				if call, ok := right.(*ast.CallExpr); ok {
					if target, ok := s.functions[rpcInspectionName(call.Fun)]; ok && target.fn.Type.Results != nil && len(target.fn.Type.Results.List) > 0 {
						env.types[id.Name] = s.shapes.goType(target.fn.Type.Results.List[0].Type, "service")
					}
					if len(call.Args) == 1 {
						if origin, ok := s.field(call.Args[0], env); ok {
							env.origins[id.Name] = origin
						}
					}
					if len(call.Args) > 1 {
						if m, ok := call.Args[0].(*ast.Ident); ok {
							if prefix, ok := env.maps[m.Name]; ok {
								if key, ok := s.value(call.Args[1], env); ok {
									env.origins[id.Name] = prefix + key
									if fn, ok := s.functions[rpcInspectionName(call.Fun)]; ok && fn.fn.Type.Results != nil && len(fn.fn.Type.Results.List) > 0 {
										if _, ok := fn.fn.Type.Results.List[0].Type.(*ast.MapType); ok {
											env.maps[id.Name] = prefix + key + "."
										}
									}
								}
							}
						}
					}
					if rpcInspectionName(call.Fun) == "append" && len(call.Args) > 1 {
						if source, ok := call.Args[0].(*ast.Ident); ok {
							if values, ok := env.lists[source.Name]; ok {
								next := append([]string{}, values...)
								for _, a := range call.Args[1:] {
									if v, ok := s.value(a, env); ok {
										next = append(next, v)
									}
								}
								env.lists[id.Name] = next
							}
						}
					}
					if selector, ok := call.Fun.(*ast.SelectorExpr); ok && selector.Sel.Name == "AsMap" {
						if from, ok := selector.X.(*ast.Ident); ok {
							if prefix, root := env.maps[from.Name]; root {
								env.maps[id.Name] = prefix
							}
						}
					}
				}
			}
		case *ast.TypeAssertExpr:
			if field, ok := s.field(x.X, env); ok {
				s.record(s.parameters, field, rpcInspectionType(x.Type), x)
			}
		case *ast.ValueSpec:
			for _, name := range x.Names {
				if x.Type != nil {
					env.types[name.Name] = s.shapes.goType(x.Type, "service")
				}
			}
		case *ast.TypeSwitchStmt:
			if assign, ok := x.Assign.(*ast.AssignStmt); ok && len(assign.Rhs) == 1 {
				if assertion, ok := assign.Rhs[0].(*ast.TypeAssertExpr); ok {
					if field, ok := s.field(assertion.X, env); ok {
						for _, c := range x.Body.List {
							clause := c.(*ast.CaseClause)
							for _, typ := range clause.List {
								kind := rpcInspectionType(typ)
								if kind != "待核对" {
									if kind == "number" {
										kind = "integer"
									}
									s.record(s.parameters, field, kind, typ)
								}
							}
						}
					}
				}
			}
		case *ast.IndexExpr:
			if field, ok := s.field(x, env); ok {
				s.record(s.parameters, field, "待核对", x)
			}
		case *ast.CallExpr:
			name := rpcInspectionName(x.Fun)
			s.parameterRule(name, x, env)
			if name == "decodeIQCEvidence" && len(x.Args) == 2 {
				if field, ok := s.field(x.Args[0], env); ok {
					if address, ok := x.Args[1].(*ast.UnaryExpr); ok {
						if id, ok := address.X.(*ast.Ident); ok {
							if typ := env.types[id.Name]; typ != "" {
								shape := s.shapes.jsonShape(s.shapes.typed(typ), 0)
								s.record(s.parameters, field, shape.Type, x)
								for _, f := range rpcShapeFields(shape, field) {
									s.record(s.parameters, f.Name, f.Type, x)
								}
								if shape.Type == "array" {
									for _, f := range rpcShapeFields(shape.Item, field+"[]") {
										s.record(s.parameters, f.Name, f.Type, x)
									}
								}
								env.origins[id.Name] = field
							}
						}
					}
				}
			}
			if name == "newDataStruct" && len(x.Args) == 1 {
				if data, ok := x.Args[0].(*ast.CompositeLit); ok {
					if _, ok := data.Type.(*ast.MapType); ok {
						for _, elt := range data.Elts {
							if pair, ok := elt.(*ast.KeyValueExpr); ok {
								if field, err := text(pair.Key); err == nil {
									s.record(s.response, "result.data."+field, "待核对", pair)
								}
							}
						}
					}
				}
			}
			target, known := s.functions[name]
			if !known {
				return true
			}
			names := rpcInspectionParams(target.fn)
			child := rpcInspectionEnv{strings: map[string]string{}, maps: map[string]string{}, lists: map[string][]string{}, origins: map[string]string{}, types: map[string]string{}, validations: map[string]string{}, presences: map[string]string{}}
			hasParams := false
			hasMethod := false
			for i, arg := range x.Args {
				if i >= len(names) {
					break
				}
				if value, known := s.value(arg, env); known {
					child.strings[names[i]] = value
					if names[i] == "method" {
						hasMethod = true
					}
				}
				if origin, known := s.field(arg, env); known {
					child.origins[names[i]] = origin
					hasParams = true
				}
				if literal, ok := arg.(*ast.CompositeLit); ok {
					for _, elt := range literal.Elts {
						if pair, ok := elt.(*ast.KeyValueExpr); ok {
							if field, ok := pair.Key.(*ast.Ident); ok {
								if value, known := s.value(pair.Value, env); known {
									child.strings[names[i]+"."+field.Name] = value
								}
							}
						}
					}
				}
				if id, ok := arg.(*ast.Ident); ok {
					for key, value := range env.strings {
						if strings.HasPrefix(key, id.Name+".") {
							child.strings[names[i]+strings.TrimPrefix(key, id.Name)] = value
						}
					}
					if origin, known := env.origins[id.Name]; known {
						child.origins[names[i]] = origin
					}
					if prefix, root := env.maps[id.Name]; root {
						child.maps[names[i]] = prefix
						hasParams = true
					}
					if list, ok := env.lists[id.Name]; ok {
						child.lists[names[i]] = list
					}
				}
			}
			lower := strings.ToLower(name)
			if hasParams && (strings.Contains(lower, "rejectunknown") || strings.Contains(lower, "allowsonly") || strings.HasSuffix(lower, "paramsallowed")) {
				start := len(names) - 1
				keys := []string{}
				resolved := true
				for i := start; i < len(x.Args); i++ {
					if id, ok := x.Args[i].(*ast.Ident); ok && x.Ellipsis.IsValid() {
						values, known := env.lists[id.Name]
						resolved = resolved && known
						keys = append(keys, values...)
					} else if v, ok := s.value(x.Args[i], env); ok {
						keys = append(keys, v)
					} else {
						resolved = false
					}
				}
				for _, prefix := range child.maps {
					for _, key := range keys {
						s.record(s.parameters, prefix+key, "待核对", x)
					}
				}
				if len(keys) == 0 && !x.Ellipsis.IsValid() {
					s.result.EmptyParameters = true
				}
				if resolved {
					for _, prefix := range child.maps {
						if s.allowedByPrefix[prefix] == nil {
							s.allowedByPrefix[prefix] = map[string]bool{}
						}
						for _, key := range keys {
							s.allowedByPrefix[prefix][key] = true
						}
						if prefix == "" {
							s.hasAllowed = true
							for _, key := range keys {
								s.allowed[key] = true
							}
						}
					}
				}
			}
			if hasParams || hasMethod || strings.HasSuffix(name, "Result") || strings.HasSuffix(name, "ToMap") {
				s.follow(name, child)
			}
		case *ast.CompositeLit:
			if selector, ok := x.Type.(*ast.SelectorExpr); ok && selector.Sel.Name == "JsonrpcResult" {
				success, data := false, false
				for _, elt := range x.Elts {
					if pair, ok := elt.(*ast.KeyValueExpr); ok {
						if id, ok := pair.Key.(*ast.Ident); ok {
							if id.Name == "Data" {
								data = true
							}
							if id.Name == "Code" && s.expression(pair.Value) == "errcode.OK.Code" {
								success = true
							}
						}
					}
				}
				if success && !data {
					s.result.EmptyData = true
				}
			}
		}
		return true
	})
}
func (s *rpcInspector) follow(name string, env rpcInspectionEnv) {
	target, ok := s.functions[name]
	if !ok {
		return
	}
	for _, field := range target.fn.Type.Params.List {
		for _, n := range field.Names {
			if env.types[n.Name] == "" {
				env.types[n.Name] = s.shapes.goType(field.Type, "service")
			}
		}
	}
	signature := name
	keys := []string{}
	for key := range env.strings {
		keys = append(keys, key)
	}
	sort.Strings(keys)
	for _, key := range keys {
		signature += "|" + key + "=" + env.strings[key]
	}
	keys = nil
	for key := range env.maps {
		keys = append(keys, key)
	}
	sort.Strings(keys)
	for _, key := range keys {
		signature += "|" + key + "=" + env.maps[key]
	}
	keys = nil
	for key := range env.origins {
		keys = append(keys, key)
	}
	sort.Strings(keys)
	for _, key := range keys {
		signature += "|origin:" + key + "=" + env.origins[key]
	}
	if s.seen[signature] {
		return
	}
	s.seen[signature] = true
	s.callDepth++
	defer func() { s.callDepth-- }()
	s.walk(target.fn.Body, env)
}
func rpcInspection(root string, methods map[string]map[string]string) (map[string]map[string]rpcSourceInspection, error) {
	shapeReader, err := newRPCShapeReader(root)
	if err != nil {
		return nil, err
	}
	constants := map[string]string{}
	for key, expr := range shapeReader.constants {
		if value, ok := shapeReader.expr(expr, rpcShapeEnv{}, strings.Split(key, ".")[0], 0).Value.(string); ok {
			constants[key] = value
		}
	}
	positions := shapeReader.positions
	functions := map[string]rpcInspectionFunction{}
	paths, err := filepath.Glob(filepath.Join(root, "server/internal/service/*.go"))
	if err != nil {
		return nil, err
	}
	for _, path := range paths {
		if strings.HasSuffix(path, "_test.go") {
			continue
		}
		file, err := parser.ParseFile(positions, path, nil, 0)
		if err != nil {
			return nil, err
		}
		for _, decl := range file.Decls {
			fn, ok := decl.(*ast.FuncDecl)
			if !ok {
				continue
			}
			if fn.Recv != nil {
				if len(fn.Recv.List) != 1 {
					continue
				}
				star, ok := fn.Recv.List[0].Type.(*ast.StarExpr)
				if !ok {
					continue
				}
				id, ok := star.X.(*ast.Ident)
				if !ok || id.Name != "jsonrpcDispatcher" {
					continue
				}
			}
			functions[fn.Name.Name] = rpcInspectionFunction{fn: fn, path: path}
		}
	}
	for qualified, fn := range shapeReader.functions {
		if strings.HasPrefix(qualified, "biz.") && fn.fn.Recv == nil {
			name := strings.TrimPrefix(qualified, "biz.")
			if _, exists := functions[name]; !exists {
				functions[name] = rpcInspectionFunction{fn: fn.fn}
			}
		}
	}
	entry, ok := functions["Handle"]
	if !ok {
		return nil, fmt.Errorf("missing RPC dispatch source")
	}
	domainHandlers := map[string]string{}
	for _, sw := range switches(entry.fn, "url") {
		for _, item := range sw.Body.List {
			clause := item.(*ast.CaseClause)
			for _, label := range clause.List {
				domain, err := text(label)
				if err != nil {
					return nil, err
				}
				ast.Inspect(clause, func(node ast.Node) bool {
					if call, ok := node.(*ast.CallExpr); ok {
						if _, found := functions[rpcInspectionName(call.Fun)]; found {
							domainHandlers[domain] = rpcInspectionName(call.Fun)
						}
					}
					return true
				})
			}
		}
	}
	result := map[string]map[string]rpcSourceInspection{}
	for domain, names := range methods {
		handler, ok := functions[domainHandlers[domain]]
		if !ok {
			return nil, fmt.Errorf("missing RPC source %s", domain)
		}
		result[domain] = map[string]rpcSourceInspection{}
		for _, method := range names {
			s := rpcInspector{root: root, positions: positions, functions: functions, seen: map[string]bool{}, parameters: map[string]rpcSourceField{}, response: map[string]rpcSourceField{}, allowed: map[string]bool{}, allowedByPrefix: map[string]map[string]bool{}, constants: constants, shapes: shapeReader, rejected: map[string]bool{}}
			env := rpcInspectionEnv{strings: map[string]string{"method": method, "url": domain}, maps: map[string]string{}, lists: map[string][]string{}, origins: map[string]string{}, types: map[string]string{}, validations: map[string]string{}, presences: map[string]string{}}
			for _, field := range handler.fn.Type.Params.List {
				for _, name := range field.Names {
					if name.Name == "params" || name.Name == "pm" {
						env.maps[name.Name] = ""
					}
				}
			}
			s.follow(handler.fn.Name.Name, env)
			if s.result.Entry.Path == "" {
				s.result.Entry = s.ref(handler.fn)
			}
			s.result.Parameters = []rpcSourceField{}
			for _, field := range s.parameters {
				if s.rejected[field.Name] {
					continue
				}
				if s.hasAllowed && !s.allowed[strings.TrimSuffix(strings.Split(field.Name, ".")[0], "[]")] {
					continue
				}
				valid := true
				for prefix, allowed := range s.allowedByPrefix {
					if strings.HasPrefix(field.Name, prefix) {
						rest := strings.TrimPrefix(field.Name, prefix)
						key := strings.TrimSuffix(strings.Split(rest, ".")[0], "[]")
						if !allowed[key] {
							valid = false
						}
					}
				}
				if !valid {
					continue
				}
				if field.Type == "待核对" {
					if call, ok := s.parameters[field.Name]; ok && (strings.Contains(strings.ToLower(call.Expression), "allow") || strings.Contains(strings.ToLower(call.Expression), "rejectunknown")) {
						field.Type = "json"
						field.Required = "不参与业务赋值"
						field.Description = "当前参数白名单接受此键，但该方法未读取其值；不能据此改变业务对象或版本。"
					} else if strings.Contains(field.Expression, "[") {
						field.Type = "json"
						field.Description = "读取 JSON 原值；具体值域由所属业务校验器决定。"
					} else {
						return nil, fmt.Errorf("unresolved RPC parameter %s.%s.%s", domain, method, field.Name)
					}
				}
				if field.Required == "" {
					field.Required = "按业务条件"
				}
				if field.Description == "" {
					field.Description = "由后端实际解析读取；嵌套字段和数组按所属解析器校验。"
				}
				s.result.Parameters = append(s.result.Parameters, field)
			}
			sort.Slice(s.result.Parameters, func(i, j int) bool { return s.result.Parameters[i].Name < s.result.Parameters[j].Name })
			s.result.Response = []rpcSourceField{}
			for _, field := range s.response {
				s.result.Response = append(s.result.Response, field)
			}
			sort.Slice(s.result.Response, func(i, j int) bool { return s.result.Response[i].Name < s.result.Response[j].Name })
			s.result.EmptyParameters = s.result.EmptyParameters && len(s.result.Parameters) == 0
			s.result.EmptyData = s.result.EmptyData && len(s.result.Response) == 0
			result[domain][method] = s.result
		}
	}
	return result, nil
}
