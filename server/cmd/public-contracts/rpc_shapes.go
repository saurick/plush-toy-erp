package main

import (
	"fmt"
	"go/ast"
	"go/parser"
	"go/token"
	"path/filepath"
	"reflect"
	"sort"
	"strconv"
	"strings"

	"server/internal/errcode"
)

// Wire shapes follow the response builders, rather than exposing repository
// structs. Go types are used only to resolve selectors consumed by those builders.
type rpcWireShape struct {
	Type     string                   `json:"type"`
	Nullable bool                     `json:"nullable,omitempty"`
	Fields   map[string]*rpcWireShape `json:"fields,omitempty"`
	Item     *rpcWireShape            `json:"item,omitempty"`
	Source   rpcSourceRef             `json:"source"`
	Go       string                   `json:"-"`
	Value    any                      `json:"literal,omitempty"`
	Results  []*rpcWireShape          `json:"-"`
	Function *rpcShapeFunction        `json:"-"`
	Encoded  *rpcWireShape            `json:"-"`
}

type rpcShapeFunction struct {
	fn  *ast.FuncDecl
	pkg string
}

type rpcShapeReader struct {
	root      string
	positions *token.FileSet
	types     map[string]ast.Expr
	functions map[string]rpcShapeFunction
	constants map[string]ast.Expr
	busy      map[string]int
}

type rpcShapeEnv map[string]*rpcWireShape

func newRPCShapeReader(root string) (*rpcShapeReader, error) {
	r := &rpcShapeReader{root: root, positions: token.NewFileSet(), types: map[string]ast.Expr{}, functions: map[string]rpcShapeFunction{}, constants: map[string]ast.Expr{}, busy: map[string]int{}}
	for _, directory := range []string{"service", "biz", "buildinfo", "projectmanuals", "core/qualitycheck"} {
		pkg := filepath.Base(directory)
		paths, err := filepath.Glob(filepath.Join(root, "server/internal", directory, "*.go"))
		if err != nil {
			return nil, err
		}
		for _, path := range paths {
			if strings.HasSuffix(path, "_test.go") {
				continue
			}
			file, err := parser.ParseFile(r.positions, path, nil, 0)
			if err != nil {
				return nil, err
			}
			for _, decl := range file.Decls {
				switch d := decl.(type) {
				case *ast.FuncDecl:
					name := pkg + "." + d.Name.Name
					if d.Recv != nil {
						name = strings.TrimPrefix(r.goType(d.Recv.List[0].Type, pkg), "*") + "." + d.Name.Name
					}
					r.functions[name] = rpcShapeFunction{fn: d, pkg: pkg}
				case *ast.GenDecl:
					for _, spec := range d.Specs {
						switch s := spec.(type) {
						case *ast.TypeSpec:
							r.types[pkg+"."+s.Name.Name] = s.Type
						case *ast.ValueSpec:
							for i, name := range s.Names {
								if i < len(s.Values) {
									r.constants[pkg+"."+name.Name] = s.Values[i]
								}
							}
						}
					}
				}
			}
		}
	}
	return r, nil
}

func (r *rpcShapeReader) ref(n ast.Node) rpcSourceRef {
	p := r.positions.Position(n.Pos())
	path, _ := filepath.Rel(r.root, p.Filename)
	return rpcSourceRef{Path: filepath.ToSlash(path), Line: p.Line}
}

func (r *rpcShapeReader) goType(e ast.Expr, pkg string) string {
	switch x := e.(type) {
	case *ast.Ident:
		switch x.Name {
		case "string", "bool", "int", "int64", "int32", "uint", "uint64", "uint32", "float64", "float32", "any", "error", "byte":
			return x.Name
		}
		return pkg + "." + x.Name
	case *ast.SelectorExpr:
		return rpcInspectionName(x.X) + "." + x.Sel.Name
	case *ast.StarExpr:
		return "*" + r.goType(x.X, pkg)
	case *ast.ArrayType:
		return "[]" + r.goType(x.Elt, pkg)
	case *ast.Ellipsis:
		return "[]" + r.goType(x.Elt, pkg)
	case *ast.MapType:
		return "map[" + r.goType(x.Key, pkg) + "]" + r.goType(x.Value, pkg)
	case *ast.InterfaceType:
		return "any"
	}
	return ""
}

func (r *rpcShapeReader) typed(name string) *rpcWireShape {
	s := &rpcWireShape{Go: name, Type: "unresolved"}
	if strings.HasPrefix(name, "*") {
		s = r.typed(name[1:])
		c := *s
		c.Go = name
		c.Nullable = true
		return &c
	}
	if strings.HasPrefix(name, "[]") {
		s.Type = "array"
		s.Nullable = true
		s.Item = r.typed(name[2:])
		return s
	}
	if strings.HasPrefix(name, "map[") {
		s.Type = "object"
		s.Nullable = true
		return s
	}
	switch name {
	case "string":
		s.Type = "string"
	case "bool":
		s.Type = "boolean"
	case "int", "int32", "int64", "uint", "uint32", "uint64", "byte":
		s.Type = "integer"
	case "float64", "float32":
		s.Type = "number"
	case "any", "error":
		s.Type = "json"
	case "time.Time":
		s.Type = "string"
	case "decimal.Decimal":
		s.Type = "string"
	default:
		if decl, ok := r.types[name]; ok {
			pkg := strings.Split(name, ".")[0]
			switch decl.(type) {
			case *ast.StructType:
				s.Type = "object"
			default:
				base := r.goType(decl, pkg)
				if base != name && base != "" {
					s = r.typed(base)
					s.Go = name
				}
			}
		}
	}
	return s
}

func rpcShapeMerge(a, b *rpcWireShape) *rpcWireShape {
	if a == nil {
		return b
	}
	if b == nil {
		return a
	}
	if a.Type == "null" {
		c := *b
		c.Nullable = true
		return &c
	}
	if b.Type == "null" {
		c := *a
		c.Nullable = true
		return &c
	}
	if a.Type == "unresolved" || a.Type == "json" {
		if b.Type != "unresolved" && b.Type != "json" {
			return b
		}
		return a
	}
	if b.Type == "unresolved" || b.Type == "json" {
		return a
	}
	c := *a
	if fmt.Sprint(a.Value) != fmt.Sprint(b.Value) {
		c.Value = nil
	}
	c.Nullable = a.Nullable || b.Nullable
	if c.Go == "" {
		c.Go = b.Go
	}
	if c.Source.Path == "" {
		c.Source = b.Source
	}
	if a.Type == "tuple" && b.Type == "tuple" {
		c.Results = append([]*rpcWireShape{}, a.Results...)
		for i, s := range b.Results {
			if i < len(c.Results) {
				c.Results[i] = rpcShapeMerge(c.Results[i], s)
			}
		}
	}
	if a.Type == "array" {
		c.Item = rpcShapeMerge(a.Item, b.Item)
	}
	if len(a.Fields)+len(b.Fields) > 0 {
		c.Fields = map[string]*rpcWireShape{}
		for k, v := range a.Fields {
			c.Fields[k] = v
		}
		for k, v := range b.Fields {
			c.Fields[k] = rpcShapeMerge(c.Fields[k], v)
		}
	}
	return &c
}

func cloneRPCShapeEnv(env rpcShapeEnv) rpcShapeEnv {
	out := rpcShapeEnv{}
	for k, v := range env {
		out[k] = v
	}
	return out
}

func (r *rpcShapeReader) selector(base *rpcWireShape, field string) *rpcWireShape {
	if base == nil {
		return r.typed("")
	}
	if v := base.Fields[field]; v != nil {
		return v
	}
	name := strings.TrimPrefix(base.Go, "*")
	decl, ok := r.types[name]
	if !ok {
		return r.typed("")
	}
	obj, ok := decl.(*ast.StructType)
	if !ok {
		return r.typed("")
	}
	pkg := strings.Split(name, ".")[0]
	for _, f := range obj.Fields.List {
		for _, n := range f.Names {
			if n.Name == field {
				return r.typed(r.goType(f.Type, pkg))
			}
		}
		if len(f.Names) == 0 {
			if v := r.selector(r.typed(r.goType(f.Type, pkg)), field); v.Type != "unresolved" {
				return v
			}
		}
	}
	return r.typed("")
}

func (r *rpcShapeReader) method(goType, name string) (rpcShapeFunction, bool) {
	goType = strings.TrimPrefix(goType, "*")
	if fn, ok := r.functions[goType+"."+name]; ok {
		return fn, true
	}
	pkg := strings.Split(goType, ".")[0]
	switch decl := r.types[goType].(type) {
	case *ast.StructType:
		for _, field := range decl.Fields.List {
			if len(field.Names) == 0 {
				if fn, ok := r.method(r.goType(field.Type, pkg), name); ok {
					return fn, true
				}
			}
		}
	case *ast.InterfaceType:
		for _, field := range decl.Methods.List {
			for _, n := range field.Names {
				if n.Name == name {
					if typ, ok := field.Type.(*ast.FuncType); ok {
						return rpcShapeFunction{fn: &ast.FuncDecl{Name: n, Type: typ}, pkg: pkg}, true
					}
				}
			}
		}
	}
	return rpcShapeFunction{}, false
}

func rpcQualifiedName(e ast.Expr) string {
	if s, ok := e.(*ast.SelectorExpr); ok {
		return rpcQualifiedName(s.X) + "." + s.Sel.Name
	}
	return rpcInspectionName(e)
}

func (r *rpcShapeReader) jsonShape(shape *rpcWireShape, depth int) *rpcWireShape {
	if shape == nil || depth > 18 {
		return shape
	}
	c := *shape
	if c.Type == "array" {
		c.Item = r.jsonShape(c.Item, depth+1)
		return &c
	}
	if c.Type != "object" {
		return &c
	}
	name := strings.TrimPrefix(c.Go, "*")
	decl, ok := r.types[name].(*ast.StructType)
	if !ok {
		if len(c.Fields) > 0 {
			c.Fields = map[string]*rpcWireShape{}
			for key, value := range shape.Fields {
				c.Fields[key] = r.jsonShape(value, depth+1)
			}
		}
		return &c
	}
	c.Fields = map[string]*rpcWireShape{}
	pkg := strings.Split(name, ".")[0]
	for _, field := range decl.Fields.List {
		tag := ""
		if field.Tag != nil {
			raw, _ := strconv.Unquote(field.Tag.Value)
			tag = reflect.StructTag(raw).Get("json")
		}
		if tag == "-" {
			continue
		}
		child := r.jsonShape(r.typed(r.goType(field.Type, pkg)), depth+1)
		if child == nil {
			continue
		}
		copy := *child
		copy.Source = r.ref(field)
		if len(field.Names) == 0 && tag == "" {
			for k, v := range copy.Fields {
				c.Fields[k] = v
			}
			continue
		}
		for _, n := range field.Names {
			if !n.IsExported() {
				continue
			}
			key := strings.Split(tag, ",")[0]
			if key == "" {
				key = n.Name
			}
			if value := shape.Fields[n.Name]; value != nil {
				c.Fields[key] = r.jsonShape(value, depth+1)
			} else if value := shape.Fields[key]; value != nil {
				c.Fields[key] = r.jsonShape(value, depth+1)
			} else {
				c.Fields[key] = &copy
			}
		}
	}
	return &c
}

func (r *rpcShapeReader) expr(e ast.Expr, env rpcShapeEnv, pkg string, depth int) *rpcWireShape {
	if e == nil || depth > 60 {
		return r.typed("")
	}
	var s *rpcWireShape
	switch x := e.(type) {
	case *ast.ParenExpr:
		return r.expr(x.X, env, pkg, depth+1)
	case *ast.Ident:
		if v := env[x.Name]; v != nil {
			return v
		}
		if x.Name == "nil" {
			return &rpcWireShape{Type: "null"}
		}
		if x.Name == "true" || x.Name == "false" {
			return &rpcWireShape{Type: "boolean", Value: x.Name == "true"}
		}
		if c, ok := r.constants[pkg+"."+x.Name]; ok {
			return r.expr(c, env, pkg, depth+1)
		}
		return r.typed("")
	case *ast.BasicLit:
		if x.Kind == token.STRING {
			v, _ := strconv.Unquote(x.Value)
			s = &rpcWireShape{Type: "string", Value: v}
		} else {
			v, _ := strconv.ParseFloat(x.Value, 64)
			s = &rpcWireShape{Type: "number", Value: v}
		}
	case *ast.UnaryExpr:
		return r.expr(x.X, env, pkg, depth+1)
	case *ast.StarExpr:
		s = r.expr(x.X, env, pkg, depth+1)
		c := *s
		c.Go = strings.TrimPrefix(c.Go, "*")
		c.Nullable = false
		return &c
	case *ast.SelectorExpr:
		key := rpcInspectionName(x.X) + "." + x.Sel.Name
		if key == "errcode.OK" {
			return &rpcWireShape{Type: "object", Fields: map[string]*rpcWireShape{"Code": {Type: "integer", Value: float64(errcode.OK.Code)}, "Message": {Type: "string", Value: errcode.OK.Message}}}
		}
		if c, ok := r.constants[key]; ok {
			return r.expr(c, env, strings.Split(key, ".")[0], depth+1)
		}
		return r.selector(r.expr(x.X, env, pkg, depth+1), x.Sel.Name)
	case *ast.IndexExpr:
		v := r.expr(x.X, env, pkg, depth+1)
		if v.Item != nil {
			return v.Item
		}
		if key, ok := r.expr(x.Index, env, pkg, depth+1).Value.(string); ok && v.Fields[key] != nil {
			return v.Fields[key]
		}
		if strings.HasPrefix(v.Go, "map[") {
			p := strings.Index(v.Go, "]")
			return r.typed(v.Go[p+1:])
		}
		return r.typed("any")
	case *ast.SliceExpr:
		return r.expr(x.X, env, pkg, depth+1)
	case *ast.TypeAssertExpr:
		value := r.expr(x.X, env, pkg, depth+1)
		typed := r.typed(r.goType(x.Type, pkg))
		if value.Type == typed.Type {
			copy := *value
			copy.Go = typed.Go
			return &copy
		}
		return typed
	case *ast.BinaryExpr:
		if x.Op == token.ADD {
			a := r.expr(x.X, env, pkg, depth+1)
			if a.Type == "string" {
				return a
			}
			return r.typed("float64")
		}
		return r.typed("bool")
	case *ast.CompositeLit:
		name := r.goType(x.Type, pkg)
		s = r.typed(name)
		s.Source = r.ref(x)
		if _, ok := x.Type.(*ast.MapType); ok {
			s.Type = "object"
			s.Nullable = false
			s.Fields = map[string]*rpcWireShape{}
			for _, e := range x.Elts {
				if pair, ok := e.(*ast.KeyValueExpr); ok {
					key, known := r.expr(pair.Key, env, pkg, depth+1).Value.(string)
					if known {
						v := r.expr(pair.Value, env, pkg, depth+1)
						c := *v
						c.Source = r.ref(pair)
						s.Fields[key] = &c
					}
				}
			}
			return s
		}
		if strings.HasSuffix(name, "JsonrpcResult") {
			code := float64(0)
			var data *rpcWireShape
			var message *rpcWireShape
			for _, elt := range x.Elts {
				if pair, ok := elt.(*ast.KeyValueExpr); ok {
					switch rpcInspectionName(pair.Key) {
					case "Code":
						v := r.expr(pair.Value, env, pkg, depth+1)
						if n, ok := v.Value.(float64); ok {
							code = n
						} else {
							code = -1
						}
					case "Data":
						data = r.expr(pair.Value, env, pkg, depth+1)
					case "Message":
						message = r.expr(pair.Value, env, pkg, depth+1)
					}
				}
			}
			if code == 0 {
				if data == nil {
					data = &rpcWireShape{Type: "null"}
				}
				return &rpcWireShape{Type: "rpcResult", Fields: map[string]*rpcWireShape{"data": data, "message": message}}
			}
			return r.typed("")
		}
		if s.Type == "array" {
			for _, elt := range x.Elts {
				s.Item = rpcShapeMerge(s.Item, r.expr(elt, env, pkg, depth+1))
			}
			return s
		}
		for _, elt := range x.Elts {
			if pair, ok := elt.(*ast.KeyValueExpr); ok {
				if s.Fields == nil {
					s.Fields = map[string]*rpcWireShape{}
				}
				s.Fields[rpcInspectionName(pair.Key)] = r.expr(pair.Value, env, pkg, depth+1)
			}
		}
	case *ast.CallExpr:
		name := rpcInspectionName(x.Fun)
		args := make([]*rpcWireShape, len(x.Args))
		for i, a := range x.Args {
			args[i] = r.expr(a, env, pkg, depth+1)
		}
		if name == "newDataStruct" && len(args) > 0 {
			shape := *args[0]
			shape.Nullable = true
			return &shape
		}
		if rpcQualifiedName(x.Fun) == "json.Marshal" && len(args) == 1 {
			return &rpcWireShape{Type: "tuple", Results: []*rpcWireShape{{Type: "string", Encoded: r.jsonShape(args[0], 0)}, r.typed("error")}}
		}
		if rpcQualifiedName(x.Fun) == "json.Unmarshal" && len(args) == 2 {
			if address, ok := x.Args[1].(*ast.UnaryExpr); ok {
				if id, ok := address.X.(*ast.Ident); ok && args[0].Encoded != nil {
					env[id.Name] = args[0].Encoded
				}
			}
			return r.typed("error")
		}
		if name == "make" && len(x.Args) > 0 {
			v := r.typed(r.goType(x.Args[0], pkg))
			v.Nullable = false
			return v
		}
		if name == "append" && len(args) > 0 {
			s = &rpcWireShape{Type: "array", Go: args[0].Go, Item: args[0].Item}
			for _, v := range args[1:] {
				if x.Ellipsis.IsValid() && v.Type == "array" {
					v = v.Item
				}
				s.Item = rpcShapeMerge(s.Item, v)
			}
			return s
		}
		if name == "len" || name == "cap" {
			return r.typed("int")
		}
		if name == "string" || name == "bool" || name == "float64" || name == "int" || name == "int64" {
			return r.typed(name)
		}
		key := pkg + "." + name
		if local := env[name]; local != nil && local.Function != nil {
			return r.call(fmt.Sprintf("closure:%d", local.Function.fn.Pos()), *local.Function, args, depth+1)
		}
		if sel, ok := x.Fun.(*ast.SelectorExpr); ok {
			base := r.expr(sel.X, env, pkg, depth+1)
			key = strings.TrimPrefix(base.Go, "*") + "." + name
			if key == "."+name {
				key = rpcInspectionName(sel.X) + "." + name
			}
			switch name {
			case "String", "Format", "Error":
				return r.typed("string")
			case "Unix", "UnixMilli", "UnixNano":
				return r.typed("int64")
			case "AsMap":
				if base.Type == "object" {
					return base
				}
				return r.typed("map[string]any")
			}
			if r.functions[key].fn == nil && r.functions["service."+name].fn != nil {
				key = "service." + name
			}
			if fn, ok := r.method(base.Go, name); ok {
				return r.call(key, fn, args, depth+1)
			}
		}
		switch rpcQualifiedName(x.Fun) {
		case "base64.StdEncoding.EncodeToString":
			return r.typed("string")
		case "strings.HasPrefix", "strings.HasSuffix", "strings.Contains", "strings.EqualFold":
			v := r.typed("bool")
			if len(args) == 2 {
				a, aok := args[0].Value.(string)
				b, bok := args[1].Value.(string)
				if aok && bok {
					switch name {
					case "HasPrefix":
						v.Value = strings.HasPrefix(a, b)
					case "HasSuffix":
						v.Value = strings.HasSuffix(a, b)
					case "Contains":
						v.Value = strings.Contains(a, b)
					case "EqualFold":
						v.Value = strings.EqualFold(a, b)
					}
				}
			}
			return v
		}
		if key == "fmt.Sprintf" || key == "strings.TrimSpace" || key == "strings.ToLower" || key == "strings.ToUpper" || key == "strconv.Itoa" {
			return r.typed("string")
		}
		if key == "time.Now" {
			return r.typed("time.Time")
		}
		if fn, ok := r.functions[key]; ok {
			return r.call(key, fn, args, depth+1)
		}
		return r.typed("")
	case *ast.FuncLit:
		return &rpcWireShape{Type: "function", Function: &rpcShapeFunction{fn: &ast.FuncDecl{Type: x.Type, Body: x.Body}, pkg: pkg}}
	}
	if s == nil {
		s = r.typed("")
	}
	if s.Source.Path == "" {
		s.Source = r.ref(e)
	}
	return s
}

func (r *rpcShapeReader) call(key string, fn rpcShapeFunction, args []*rpcWireShape, depth int) *rpcWireShape {
	if depth > 60 || r.busy[key] > 2 {
		return r.typed("")
	}
	// Domain methods supply DTO types; only service-side serializers define wire keys.
	if fn.pkg != "service" {
		return r.returnTypes(fn)
	}
	r.busy[key]++
	defer func() { r.busy[key]-- }()
	env := rpcShapeEnv{}
	i := 0
	for _, f := range fn.fn.Type.Params.List {
		for _, n := range f.Names {
			v := r.typed(r.goType(f.Type, fn.pkg))
			if _, variadic := f.Type.(*ast.Ellipsis); variadic {
				for _, arg := range args[i:] {
					v.Item = rpcShapeMerge(v.Item, arg)
				}
				env[n.Name] = v
				i = len(args)
				continue
			}
			if i < len(args) {
				c := *args[i]
				if c.Go == "" || ((c.Type == "unresolved" || c.Type == "json") && v.Type != "json" && v.Type != "unresolved") {
					c.Go = v.Go
					if c.Type == "unresolved" || c.Type == "json" {
						c.Type, c.Item = v.Type, v.Item
					}
				}
				v = &c
			}
			env[n.Name] = v
			i++
		}
	}
	if fn.fn.Recv != nil {
		for _, n := range fn.fn.Recv.List[0].Names {
			env[n.Name] = r.typed(r.goType(fn.fn.Recv.List[0].Type, fn.pkg))
		}
	}
	var result *rpcWireShape
	r.block(fn.fn.Body.List, env, fn.pkg, depth+1, &result)
	if result == nil {
		return r.returnTypes(fn)
	}
	return result
}

func (r *rpcShapeReader) returnTypes(fn rpcShapeFunction) *rpcWireShape {
	if fn.fn.Type.Results == nil {
		return r.typed("")
	}
	var out []*rpcWireShape
	for _, f := range fn.fn.Type.Results.List {
		n := len(f.Names)
		if n == 0 {
			n = 1
		}
		for i := 0; i < n; i++ {
			out = append(out, r.typed(r.goType(f.Type, fn.pkg)))
		}
	}
	if len(out) == 1 {
		return out[0]
	}
	return &rpcWireShape{Type: "tuple", Results: out}
}

func (r *rpcShapeReader) block(statements []ast.Stmt, env rpcShapeEnv, pkg string, depth int, result **rpcWireShape) bool {
	for _, statement := range statements {
		switch x := statement.(type) {
		case *ast.ExprStmt:
			r.expr(x.X, env, pkg, depth+1)
		case *ast.AssignStmt:
			values := make([]*rpcWireShape, len(x.Rhs))
			for i, e := range x.Rhs {
				values[i] = r.expr(e, env, pkg, depth+1)
			}
			if len(values) == 1 && values[0].Type == "tuple" {
				values = values[0].Results
			}
			if len(values) == 1 && len(x.Lhs) == 2 {
				switch x.Rhs[0].(type) {
				case *ast.IndexExpr, *ast.TypeAssertExpr:
					values = append(values, r.typed("bool"))
				}
			}
			for i, lhs := range x.Lhs {
				if i >= len(values) {
					break
				}
				v := values[i]
				switch left := lhs.(type) {
				case *ast.Ident:
					env[left.Name] = v
				case *ast.IndexExpr:
					{
						base := r.expr(left.X, env, pkg, depth+1)
						if base != nil {
							key, known := r.expr(left.Index, env, pkg, depth+1).Value.(string)
							if known {
								if base.Fields == nil {
									base.Fields = map[string]*rpcWireShape{}
								}
								base.Fields[key] = rpcShapeMerge(base.Fields[key], v)
							}
						}
					}
				}
			}
		case *ast.DeclStmt:
			if gen, ok := x.Decl.(*ast.GenDecl); ok {
				for _, spec := range gen.Specs {
					if v, ok := spec.(*ast.ValueSpec); ok {
						for i, n := range v.Names {
							s := r.typed(r.goType(v.Type, pkg))
							if i < len(v.Values) {
								s = r.expr(v.Values[i], env, pkg, depth+1)
							}
							env[n.Name] = s
						}
					}
				}
			}
		case *ast.ReturnStmt:
			values := make([]*rpcWireShape, len(x.Results))
			for i, e := range x.Results {
				values[i] = r.expr(e, env, pkg, depth+1)
			}
			var v *rpcWireShape
			if len(values) == 1 {
				v = values[0]
			} else {
				v = &rpcWireShape{Type: "tuple", Results: values}
			}
			*result = rpcShapeMerge(*result, v)
			return true
		case *ast.IfStmt:
			if x.Init != nil {
				r.block([]ast.Stmt{x.Init}, env, pkg, depth+1, result)
			}
			known, val := r.condition(x.Cond, env, pkg, depth+1)
			if known {
				if val {
					if r.block(x.Body.List, env, pkg, depth+1, result) {
						return true
					}
				} else if x.Else != nil {
					if r.block([]ast.Stmt{x.Else}, env, pkg, depth+1, result) {
						return true
					}
				}
			} else {
				a, b := cloneRPCShapeEnv(env), cloneRPCShapeEnv(env)
				leftReturned := r.block(x.Body.List, a, pkg, depth+1, result)
				rightReturned := false
				if x.Else != nil {
					rightReturned = r.block([]ast.Stmt{x.Else}, b, pkg, depth+1, result)
				}
				for k, v := range a {
					env[k] = rpcShapeMerge(v, b[k])
				}
				for k, v := range b {
					if env[k] == nil {
						env[k] = v
					}
				}
				if leftReturned && rightReturned {
					return true
				}
			}
		case *ast.BlockStmt:
			if r.block(x.List, env, pkg, depth+1, result) {
				return true
			}
		case *ast.SwitchStmt:
			if x.Init != nil {
				r.block([]ast.Stmt{x.Init}, env, pkg, depth+1, result)
			}
			value := r.expr(x.Tag, env, pkg, depth+1).Value
			matched := false
			var fallback *ast.CaseClause
			for _, cl := range x.Body.List {
				c := cl.(*ast.CaseClause)
				if c.List == nil {
					fallback = c
					continue
				}
				for _, e := range c.List {
					v := r.expr(e, env, pkg, depth+1).Value
					if value != nil && v != nil && fmt.Sprint(value) == fmt.Sprint(v) {
						if r.block(c.Body, env, pkg, depth+1, result) {
							return true
						}
						matched = true
						break
					}
				}
				if value == nil {
					branch := cloneRPCShapeEnv(env)
					r.block(c.Body, branch, pkg, depth+1, result)
					for k, v := range branch {
						env[k] = rpcShapeMerge(env[k], v)
					}
				}
			}
			if !matched && fallback != nil {
				if r.block(fallback.Body, env, pkg, depth+1, result) && value != nil {
					return true
				}
			}
		case *ast.RangeStmt:
			array := r.expr(x.X, env, pkg, depth+1)
			if array.Type == "object" && len(array.Fields) > 0 {
				keys := make([]string, 0, len(array.Fields))
				for key := range array.Fields {
					keys = append(keys, key)
				}
				sort.Strings(keys)
				for _, key := range keys {
					child := cloneRPCShapeEnv(env)
					if name, ok := x.Key.(*ast.Ident); ok {
						child[name.Name] = &rpcWireShape{Type: "string", Go: "string", Value: key}
					}
					if name, ok := x.Value.(*ast.Ident); ok {
						child[name.Name] = array.Fields[key]
					}
					r.block(x.Body.List, child, pkg, depth+1, result)
					for k, v := range child {
						if env[k] != nil {
							env[k] = rpcShapeMerge(env[k], v)
						}
					}
				}
				continue
			}
			child := cloneRPCShapeEnv(env)
			if name, ok := x.Key.(*ast.Ident); ok {
				keyType := "int"
				if strings.HasPrefix(array.Go, "map[") {
					keyType = strings.SplitN(strings.TrimPrefix(array.Go, "map["), "]", 2)[0]
				}
				child[name.Name] = r.typed(keyType)
			}
			if name, ok := x.Value.(*ast.Ident); ok {
				v := array.Item
				if strings.HasPrefix(array.Go, "map[") {
					v = r.typed(strings.SplitN(array.Go, "]", 2)[1])
				}
				if v == nil {
					v = r.typed("any")
				}
				child[name.Name] = v
			}
			r.block(x.Body.List, child, pkg, depth+1, result)
			for k, v := range child {
				if env[k] != nil {
					env[k] = rpcShapeMerge(env[k], v)
				}
			}
		case *ast.ForStmt:
			r.block(x.Body.List, env, pkg, depth+1, result)
		case *ast.TypeSwitchStmt:
			for _, cl := range x.Body.List {
				c := cl.(*ast.CaseClause)
				branch := cloneRPCShapeEnv(env)
				if a, ok := x.Assign.(*ast.AssignStmt); ok && len(a.Lhs) > 0 && len(c.List) == 1 {
					if id, ok := a.Lhs[0].(*ast.Ident); ok {
						branch[id.Name] = r.typed(r.goType(c.List[0], pkg))
					}
				}
				r.block(c.Body, branch, pkg, depth+1, result)
			}
		}
	}
	return false
}

func (r *rpcShapeReader) condition(e ast.Expr, env rpcShapeEnv, pkg string, depth int) (bool, bool) {
	if u, ok := e.(*ast.UnaryExpr); ok && u.Op == token.NOT {
		k, v := r.condition(u.X, env, pkg, depth+1)
		return k, !v
	}
	if b, ok := e.(*ast.BinaryExpr); ok {
		if b.Op == token.EQL || b.Op == token.NEQ {
			a, c := r.expr(b.X, env, pkg, depth+1), r.expr(b.Y, env, pkg, depth+1)
			if a.Value != nil && c.Value != nil {
				same := fmt.Sprint(a.Value) == fmt.Sprint(c.Value)
				return true, same == (b.Op == token.EQL)
			}
		}
	}
	if v, ok := r.expr(e, env, pkg, depth+1).Value.(bool); ok {
		return true, v
	}
	return false, false
}

func (r *rpcShapeReader) result(domain, method string) *rpcWireShape {
	entry := r.functions["service.jsonrpcDispatcher.Handle"]
	if entry.fn == nil {
		return r.typed("")
	}
	var handler string
	for _, sw := range switches(entry.fn, "url") {
		for _, cl := range sw.Body.List {
			c := cl.(*ast.CaseClause)
			for _, label := range c.List {
				if value, err := text(label); err == nil && value == domain {
					ast.Inspect(c, func(n ast.Node) bool {
						if call, ok := n.(*ast.CallExpr); ok {
							key := "service.jsonrpcDispatcher." + rpcInspectionName(call.Fun)
							if r.functions[key].fn != nil {
								handler = key
							}
						}
						return true
					})
				}
			}
		}
	}
	fn := r.functions[handler]
	if fn.fn == nil {
		return r.typed("")
	}
	args := []*rpcWireShape{}
	for _, f := range fn.fn.Type.Params.List {
		for _, n := range f.Names {
			v := r.typed(r.goType(f.Type, fn.pkg))
			if n.Name == "method" {
				v.Value = method
				v.Type = "string"
			}
			args = append(args, v)
		}
	}
	shape := r.call(handler, fn, args, 0)
	if shape.Type == "tuple" && len(shape.Results) > 1 {
		shape = shape.Results[1]
	}
	return shape
}

func (r *rpcShapeReader) response(domain, method string) *rpcWireShape {
	shape := r.result(domain, method)
	if shape.Type == "rpcResult" && shape.Fields["data"] != nil {
		return shape.Fields["data"]
	}
	return r.typed("")
}

func rpcShapeFields(shape *rpcWireShape, prefix string) []rpcSourceField {
	var out []rpcSourceField
	if shape == nil {
		return out
	}
	keys := make([]string, 0, len(shape.Fields))
	for k := range shape.Fields {
		keys = append(keys, k)
	}
	sort.Strings(keys)
	for _, key := range keys {
		child := shape.Fields[key]
		name := prefix + "." + key
		kind := child.Type
		if child.Nullable {
			kind += " | null"
		}
		out = append(out, rpcSourceField{Name: name, Type: kind, Source: child.Source, Expression: child.Go})
		out = append(out, rpcShapeFields(child, name)...)
		if child.Type == "array" && child.Item != nil {
			itemType := child.Item.Type
			if child.Item.Nullable {
				itemType += " | null"
			}
			ref := child.Item.Source
			if ref.Path == "" {
				ref = child.Source
			}
			out = append(out, rpcSourceField{Name: name + "[]", Type: itemType, Source: ref, Expression: child.Item.Go})
			out = append(out, rpcShapeFields(child.Item, name+"[]")...)
		}
	}
	return out
}
