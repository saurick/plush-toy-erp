package main

import (
	"encoding/json"
	"os"
	"path/filepath"
	"reflect"
	"strings"
	"testing"

	v1 "server/api/jsonrpc/v1"

	"google.golang.org/protobuf/proto"
	"google.golang.org/protobuf/reflect/protodesc"
	"google.golang.org/protobuf/reflect/protoregistry"
)

func TestPublicRPCTransportRejectsDocumentationAndBindingDrift(t *testing.T) {
	for _, scenario := range []string{"current", "generated-envelope", "http-route", "http-verb", "http-head", "swagger-route", "swagger-verb", "request-envelope", "response-envelope", "response-format", "extra-parameter", "closed-payload"} {
		t.Run(scenario, func(t *testing.T) {
			root := t.TempDir()
			for _, relative := range []string{"server/api/jsonrpc/v1/jsonrpc.pb.go", "server/api/jsonrpc/v1/jsonrpc_http.pb.go", rpcSwaggerPath} {
				raw, err := os.ReadFile(filepath.Join("../../..", relative))
				if err != nil {
					t.Fatal(err)
				}
				if scenario == "http-route" && strings.HasSuffix(relative, "/jsonrpc_http.pb.go") {
					raw = []byte(strings.ReplaceAll(string(raw), "/rpc/{url}", "/changed/{url}"))
				}
				if scenario == "generated-envelope" && strings.HasSuffix(relative, "/jsonrpc.pb.go") {
					raw = []byte(strings.ReplaceAll(string(raw), `\x05R\x04code`, `\x03R\x04code`))
				}
				if scenario == "http-verb" && strings.HasSuffix(relative, "/jsonrpc_http.pb.go") {
					raw = []byte(strings.ReplaceAll(string(raw), "r.POST(", "r.GET("))
				}
				if scenario == "http-head" && strings.HasSuffix(relative, "/jsonrpc_http.pb.go") {
					raw = []byte(strings.ReplaceAll(string(raw), "r.POST(", "r.HEAD("))
				}
				if relative == rpcSwaggerPath {
					var document map[string]any
					if err := json.Unmarshal(raw, &document); err != nil {
						t.Fatal(err)
					}
					switch scenario {
					case "swagger-route":
						jsonObject(document, "paths")["/unregistered"] = map[string]any{}
					case "swagger-verb":
						operation := jsonObject(document, "paths", "/rpc/{url}")
						operation["get"] = operation["post"]
					case "request-envelope":
						delete(jsonObject(document, "definitions", "JsonrpcPostJsonrpcBody", "properties"), "params")
					case "response-envelope":
						jsonObject(document, "definitions", "v1JsonrpcResult", "properties", "code")["type"] = "string"
					case "response-format":
						jsonObject(document, "definitions", "v1JsonrpcResult", "properties", "code")["format"] = "int64"
					case "extra-parameter":
						post := jsonObject(document, "paths", "/rpc/{url}", "post")
						post["parameters"] = append(post["parameters"].([]any), map[string]any{"name": "actor_id", "in": "query", "type": "integer"})
					case "closed-payload":
						jsonObject(document, "definitions", "JsonrpcPostJsonrpcBody", "properties", "params")["additionalProperties"] = false
					}
					raw, _ = json.Marshal(document)
				}
				destination := filepath.Join(root, relative)
				if err := os.MkdirAll(filepath.Dir(destination), 0755); err != nil {
					t.Fatal(err)
				}
				if err := os.WriteFile(destination, raw, 0644); err != nil {
					t.Fatal(err)
				}
			}
			got, err := rpcTransport(root)
			if scenario != "current" {
				if err == nil {
					t.Fatalf("accepted %s drift: %#v", scenario, got)
				}
				return
			}
			if err != nil || !reflect.DeepEqual(got, map[string]string{"method": "POST", "path": "/rpc/{url}", "documentation": rpcSwaggerPath}) {
				t.Fatalf("current transport=%#v err=%v", got, err)
			}
		})
	}
}

func TestPublicRPCEnvelopeFollowsGeneratedDescriptorFields(t *testing.T) {
	raw, err := os.ReadFile(filepath.Join("../../..", rpcSwaggerPath))
	if err != nil {
		t.Fatal(err)
	}
	var document map[string]any
	if err := json.Unmarshal(raw, &document); err != nil {
		t.Fatal(err)
	}
	descriptor := protodesc.ToFileDescriptorProto(v1.File_api_jsonrpc_v1_jsonrpc_proto)
	for _, message := range descriptor.MessageType {
		if message.GetName() == "JsonrpcResult" {
			message.Field[0].Name = proto.String("outcome")
			message.Field[0].JsonName = proto.String("outcome")
		}
	}
	updated, err := protodesc.NewFile(descriptor, protoregistry.GlobalFiles)
	if err != nil {
		t.Fatal(err)
	}
	schema := jsonObject(document, "paths", "/rpc/{url}", "post", "responses", "200", "schema")
	message := updated.Services().Get(0).Methods().Get(0).Output()
	if swaggerMessageMatches(document, schema, message, "") {
		t.Fatal("accepted documentation for a different generated descriptor")
	}
	properties := jsonObject(document, "definitions", "v1JsonrpcResult", "properties")
	properties["outcome"] = properties["code"]
	delete(properties, "code")
	if !swaggerMessageMatches(document, schema, message, "") {
		t.Fatal("matching documentation must follow the generated descriptor without another field catalogue")
	}
}
