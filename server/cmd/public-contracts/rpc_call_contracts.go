package main

import (
	"encoding/json"
	"fmt"
	"go/ast"
	"go/parser"
	"math"
	"os"
	"path/filepath"
	"strings"
)

type rpcExample struct {
	Params  map[string]any `json:"params"`
	Data    any            `json:"data"`
	Basis   string         `json:"basis"`
	Test    string         `json:"test,omitempty"`
	Source  *rpcSourceRef  `json:"source,omitempty"`
	Message *string        `json:"message,omitempty"`
}

type rpcCallContract struct {
	Parameters []rpcSourceField `json:"parameters"`
	Response   []rpcSourceField `json:"response"`
	DataType   string           `json:"dataType"`
	Example    rpcExample       `json:"example"`
}

func rpcCallContracts(root string, methods map[string]map[string]string, index map[string]map[string]rpcSourceInspection) (map[string]map[string]rpcCallContract, error) {
	r, err := newRPCShapeReader(root)
	if err != nil {
		return nil, err
	}
	raw, err := os.ReadFile(filepath.Join(root, "server/cmd/public-contracts/testdata/rpc_examples.json"))
	if err != nil {
		return nil, err
	}
	var examples map[string]rpcExample
	if err = json.Unmarshal(raw, &examples); err != nil {
		return nil, err
	}
	tests := map[string]rpcSourceRef{}
	paths, _ := filepath.Glob(filepath.Join(root, "server/internal/service/*_test.go"))
	for _, path := range paths {
		file, err := parser.ParseFile(r.positions, path, nil, 0)
		if err != nil {
			return nil, err
		}
		for _, decl := range file.Decls {
			if fn, ok := decl.(*ast.FuncDecl); ok && strings.HasPrefix(fn.Name.Name, "Test") {
				tests[fn.Name.Name] = r.ref(fn)
			}
		}
	}
	out := map[string]map[string]rpcCallContract{}
	count := 0
	for domain, names := range methods {
		out[domain] = map[string]rpcCallContract{}
		for _, method := range names {
			key := domain + "." + method
			sample, ok := examples[key]
			if !ok || sample.Params == nil || sample.Basis == "" {
				return nil, fmt.Errorf("missing RPC example %s", key)
			}
			if sample.Basis == "handler-fixture" {
				ref, ok := tests[sample.Test]
				if !ok {
					return nil, fmt.Errorf("%s: fixture test no longer exists: %s", key, sample.Test)
				}
				sample.Source = &ref
			} else if sample.Basis != "backend-wire-shape" {
				return nil, fmt.Errorf("%s: unsupported example basis", key)
			}
			result := r.result(domain, method)
			shape := result.Fields["data"]
			if shape == nil {
				return nil, fmt.Errorf("unresolved RPC result %s", key)
			}
			if message := result.Fields["message"]; message != nil {
				if value, known := message.Value.(string); known {
					if sample.Message != nil && *sample.Message != value {
						return nil, fmt.Errorf("%s: example message differs from success response", key)
					}
					sample.Message = &value
				}
			}
			if shape.Type == "unresolved" {
				return nil, fmt.Errorf("unresolved RPC response %s", key)
			}
			if err := validateRPCWireExample(shape, sample.Data, key+".result.data"); err != nil {
				return nil, err
			}
			fields := rpcShapeFields(shape, "result.data")
			for _, field := range fields {
				if strings.HasPrefix(field.Type, "unresolved") {
					return nil, fmt.Errorf("unresolved RPC response field %s.%s", key, field.Name)
				}
			}
			parameters := index[domain][method].Parameters
			if err := validateRPCParameterExample(parameters, sample.Params, key); err != nil {
				return nil, err
			}
			out[domain][method] = rpcCallContract{Parameters: parameters, Response: fields, DataType: shape.Type, Example: sample}
			count++
		}
	}
	if count != len(examples) {
		return nil, fmt.Errorf("RPC examples contain unregistered methods: %d examples / %d methods", len(examples), count)
	}
	return out, nil
}

func validateRPCWireExample(shape *rpcWireShape, value any, path string) error {
	if shape == nil {
		return fmt.Errorf("%s: missing wire shape", path)
	}
	if value == nil {
		if shape.Nullable || shape.Type == "null" || shape.Type == "json" {
			return nil
		}
		return fmt.Errorf("%s: null does not match %s", path, shape.Type)
	}
	switch shape.Type {
	case "json":
		return nil
	case "null":
		return fmt.Errorf("%s: expected null", path)
	case "string":
		if _, ok := value.(string); !ok {
			return fmt.Errorf("%s: expected string, got %T", path, value)
		}
	case "boolean":
		if _, ok := value.(bool); !ok {
			return fmt.Errorf("%s: expected boolean, got %T", path, value)
		}
	case "integer", "number":
		v, ok := value.(float64)
		if !ok || math.IsNaN(v) || math.IsInf(v, 0) || (shape.Type == "integer" && math.Trunc(v) != v) {
			return fmt.Errorf("%s: expected %s, got %#v", path, shape.Type, value)
		}
	case "array":
		items, ok := value.([]any)
		if !ok {
			return fmt.Errorf("%s: expected array, got %T", path, value)
		}
		for i, v := range items {
			if err := validateRPCWireExample(shape.Item, v, fmt.Sprintf("%s[%d]", path, i)); err != nil {
				return err
			}
		}
	case "object":
		object, ok := value.(map[string]any)
		if !ok {
			return fmt.Errorf("%s: expected object, got %T", path, value)
		}
		if len(shape.Fields) == 0 {
			return nil
		}
		for key, v := range object {
			child, ok := shape.Fields[key]
			if !ok {
				return fmt.Errorf("%s.%s: example field not in response builder", path, key)
			}
			if err := validateRPCWireExample(child, v, path+"."+key); err != nil {
				return err
			}
		}
	default:
		return fmt.Errorf("%s: unsupported wire type %s", path, shape.Type)
	}
	return nil
}

type rpcParameterNode struct {
	field    *rpcSourceField
	children map[string]*rpcParameterNode
	item     *rpcParameterNode
}

func validateRPCParameterExample(fields []rpcSourceField, params map[string]any, key string) error {
	root := &rpcParameterNode{children: map[string]*rpcParameterNode{}}
	for i := range fields {
		field := &fields[i]
		node := root
		for _, segment := range strings.Split(field.Name, ".") {
			array := strings.HasSuffix(segment, "[]")
			name := strings.TrimSuffix(segment, "[]")
			if node.children == nil {
				node.children = map[string]*rpcParameterNode{}
			}
			if node.children[name] == nil {
				node.children[name] = &rpcParameterNode{}
			}
			node = node.children[name]
			if array {
				if node.item == nil {
					node.item = &rpcParameterNode{}
				}
				node = node.item
			}
		}
		node.field = field
	}
	scopes := map[string]map[string]any{"": params}
	var matches func([]rpcParameterCondition) bool
	matches = func(conditions []rpcParameterCondition) bool {
		if len(conditions) == 0 {
			return false
		}
		for _, condition := range conditions {
			if len(condition.AnyOf) > 0 {
				matched := false
				for _, alternative := range condition.AnyOf {
					if matches([]rpcParameterCondition{alternative}) {
						matched = true
						break
					}
				}
				if !matched {
					return false
				}
				continue
			}
			base := ""
			object := params
			for prefix, scope := range scopes {
				if prefix != "" && strings.HasPrefix(condition.Field, prefix+".") && len(prefix) > len(base) {
					base, object = prefix, scope
				}
			}
			remaining := strings.TrimPrefix(strings.TrimPrefix(condition.Field, base), ".")
			var value any = object
			exists := true
			for _, part := range strings.Split(remaining, ".") {
				next, ok := value.(map[string]any)
				if !ok {
					return false
				}
				value, exists = next[part]
			}
			if condition.Presence == "present" {
				if !exists {
					return false
				}
				continue
			}
			if condition.Presence == "absent" {
				if exists {
					return false
				}
				continue
			}
			if condition.Presence == "nonnull" {
				if value == nil {
					return false
				}
				continue
			}
			if !exists || strings.TrimSpace(fmt.Sprint(value)) != condition.Equals {
				return false
			}
		}
		return true
	}
	var walk func(*rpcParameterNode, any, string) error
	walk = func(node *rpcParameterNode, value any, path string) error {
		if field := node.field; field != nil {
			if value == nil {
				if field.Nullable || field.Type == "json" || strings.Contains(field.Type, "null") {
					return nil
				}
				return fmt.Errorf("%s.%s: null is not accepted by the parameter contract", key, path)
			}
			valid := false
			for _, kind := range strings.Split(field.Type, " | ") {
				switch kind {
				case "array":
					_, valid = value.([]any)
				case "object":
					_, valid = value.(map[string]any)
				default:
					valid = validateRPCWireExample(&rpcWireShape{Type: kind}, value, key+"."+path) == nil
				}
				if valid {
					break
				}
			}
			if !valid {
				return fmt.Errorf("%s.%s: value does not match %s", key, path, field.Type)
			}
		}
		switch object := value.(type) {
		case map[string]any:
			if len(node.children) == 0 && node.field != nil && (node.field.Type == "object" || node.field.Type == "json") {
				return nil
			}
			previous, hadScope := scopes[path]
			scopes[path] = object
			defer func() {
				if hadScope {
					scopes[path] = previous
				} else {
					delete(scopes, path)
				}
			}()
			for name, child := range node.children {
				if child.field != nil && (child.field.Required == "必填" || matches(child.field.RequiredWhen)) {
					if v, exists := object[name]; !exists || (v == nil && matches(child.field.RequiredWhen)) {
						return fmt.Errorf("%s.%s%s: required parameter missing", key, func() string {
							if path != "" {
								return path + "."
							}
							return ""
						}(), name)
					}
				}
			}
			for name, v := range object {
				child, ok := node.children[name]
				if !ok {
					return fmt.Errorf("%s.%s: example field not read by backend", key, path+"."+name)
				}
				next := name
				if path != "" {
					next = path + "." + name
				}
				if err := walk(child, v, next); err != nil {
					return err
				}
			}
		case []any:
			if node.item != nil {
				for _, v := range object {
					if err := walk(node.item, v, path+"[]"); err != nil {
						return err
					}
				}
			}
		default:
			if len(node.children) > 0 || node.item != nil {
				return fmt.Errorf("%s.%s: nested parameter must be an object or array", key, path)
			}
		}
		return nil
	}
	return walk(root, params, "")
}
