package main

import (
	"encoding/json"
	"fmt"
	"go/ast"
	"go/constant"
	"go/token"
	"go/types"
	"os"
	"path/filepath"
	"strings"

	"google.golang.org/genproto/googleapis/api/annotations"
	"google.golang.org/protobuf/proto"
	"google.golang.org/protobuf/reflect/protodesc"
	"google.golang.org/protobuf/reflect/protoreflect"
	"google.golang.org/protobuf/reflect/protoregistry"
	"google.golang.org/protobuf/types/descriptorpb"
	_ "google.golang.org/protobuf/types/known/structpb"
)

const rpcSwaggerPath = "server/api/jsonrpc/v1/jsonrpc.swagger.json"

// Check the published runtime envelope against Swagger. Proto changes still
// use make api; this extractor does not replace protoc or its freshness check.
func rpcTransport(root string) (map[string]string, error) {
	file, err := parse(root, "server/api/jsonrpc/v1/jsonrpc.pb.go")
	if err != nil {
		return nil, err
	}
	var rawDescriptor string
	if err := declarations(file, token.CONST, func(name string, expr ast.Expr) error {
		if !strings.HasSuffix(name, "_rawDesc") {
			return nil
		}
		value, err := types.Eval(token.NewFileSet(), nil, token.NoPos, types.ExprString(expr))
		if err != nil || value.Value == nil || value.Value.Kind() != constant.String || rawDescriptor != "" {
			return fmt.Errorf("unsupported generated Protobuf descriptor")
		}
		rawDescriptor = constant.StringVal(value.Value)
		return nil
	}); err != nil {
		return nil, err
	}
	descriptor := new(descriptorpb.FileDescriptorProto)
	if rawDescriptor == "" {
		return nil, fmt.Errorf("missing generated Protobuf descriptor; run make api")
	}
	if err := proto.Unmarshal([]byte(rawDescriptor), descriptor); err != nil {
		return nil, err
	}
	generated, err := protodesc.NewFile(descriptor, protoregistry.GlobalFiles)
	if err != nil {
		return nil, err
	}
	services := generated.Services()
	if services.Len() != 1 || services.Get(0).Methods().Len() != 1 {
		return nil, fmt.Errorf("unsupported JSON-RPC service; review the transport contract")
	}
	method := services.Get(0).Methods().Get(0)
	binding, ok := proto.GetExtension(method.Options(), annotations.E_Http).(*annotations.HttpRule)
	if !ok || binding.GetPost() == "" || binding.GetBody() != "*" || len(binding.GetAdditionalBindings()) != 0 {
		return nil, fmt.Errorf("unsupported JSON-RPC HTTP binding; review the transport contract")
	}
	route := binding.GetPost()
	handler, err := parse(root, "server/api/jsonrpc/v1/jsonrpc_http.pb.go")
	if err != nil {
		return nil, err
	}
	var routes []string
	ast.Inspect(handler, func(node ast.Node) bool {
		call, ok := node.(*ast.CallExpr)
		if !ok || len(call.Args) == 0 {
			return true
		}
		selector, ok := call.Fun.(*ast.SelectorExpr)
		if !ok {
			return true
		}
		switch selector.Sel.Name {
		case "GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS", "TRACE":
		default:
			return true
		}
		value, _ := text(call.Args[0])
		routes = append(routes, selector.Sel.Name+" "+value)
		return true
	})
	if len(routes) != 1 || routes[0] != "POST "+route {
		return nil, fmt.Errorf("JSON-RPC HTTP handler differs from the generated descriptor; run make api")
	}
	raw, err := os.ReadFile(filepath.Join(root, rpcSwaggerPath))
	if err != nil {
		return nil, err
	}
	var document map[string]any
	if err := json.Unmarshal(raw, &document); err != nil {
		return nil, err
	}
	paths := jsonObject(document, "paths")
	operation := jsonObject(paths, route)
	post := jsonObject(operation, "post")
	if document["swagger"] != "2.0" || len(paths) != 1 || len(operation) != 1 || post == nil {
		return nil, fmt.Errorf("JSON-RPC Swagger routes differ from the generated descriptor; run make api")
	}
	var body map[string]any
	pathParameter := false
	parameters, _ := post["parameters"].([]any)
	for _, parameter := range parameters {
		item, _ := parameter.(map[string]any)
		if item["in"] == "body" && item["required"] == true {
			body = jsonObject(item, "schema")
		}
		if item["in"] == "path" && item["name"] == "url" && item["required"] == true && item["type"] == "string" {
			pathParameter = true
		}
	}
	if !pathParameter || len(parameters) != 2 || !strings.Contains(route, "{url}") ||
		!swaggerMessageMatches(document, body, method.Input(), "url") ||
		!swaggerMessageMatches(document, jsonObject(post, "responses", "200", "schema"), method.Output(), "") {
		return nil, fmt.Errorf("JSON-RPC Swagger envelope differs from the generated descriptor; run make api")
	}
	return map[string]string{"method": "POST", "path": route, "documentation": rpcSwaggerPath}, nil
}

func jsonObject(value map[string]any, keys ...string) map[string]any {
	for _, key := range keys {
		value, _ = value[key].(map[string]any)
	}
	return value
}

func swaggerMessageMatches(document, schema map[string]any, message protoreflect.MessageDescriptor, omittedField string) bool {
	ref, _ := schema["$ref"].(string)
	if !strings.HasPrefix(ref, "#/definitions/") {
		return false
	}
	definition := jsonObject(document, "definitions", strings.TrimPrefix(ref, "#/definitions/"))
	if definition["type"] != "object" {
		return false
	}
	properties := jsonObject(definition, "properties")
	fields, count := message.Fields(), 0
	for index := 0; index < fields.Len(); index++ {
		field := fields.Get(index)
		if string(field.Name()) == omittedField {
			continue
		}
		count++
		property := jsonObject(properties, field.JSONName())
		if field.IsList() || field.IsMap() {
			return false
		}
		switch field.Kind() {
		case protoreflect.StringKind:
			if property["type"] != "string" {
				return false
			}
		case protoreflect.Int32Kind:
			if property["type"] != "integer" || property["format"] != "int32" {
				return false
			}
		case protoreflect.MessageKind:
			if field.Message().FullName() == "google.protobuf.Struct" {
				if property["type"] != "object" || property["additionalProperties"] == false {
					return false
				}
			} else if !swaggerMessageMatches(document, property, field.Message(), "") {
				return false
			}
		default:
			return false
		}
	}
	return count == len(properties)
}
