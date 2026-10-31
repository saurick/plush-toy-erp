package main

import (
	"os"
	"path/filepath"
	"testing"
)

func TestRPCInspectionDoesNotTreatDerivedPermissionsAsArrayInput(t *testing.T) {
	root := t.TempDir()
	dir := filepath.Join(root, "server/internal/service")
	if err := os.MkdirAll(dir, 0755); err != nil {
		t.Fatal(err)
	}
	source := `package service
type jsonrpcDispatcher struct{}
func(d *jsonrpcDispatcher) Handle(url,method string,pm map[string]any)any{switch url{case "media":return d.handleMedia(method,pm)};return nil}
func(d *jsonrpcDispatcher) handleMedia(method string,pm map[string]any)any{switch method{case "list":source:=getString(pm,"source_type");permissions:=permissionsForSource(source);_ = permissions;return nil};return nil}
func getString(pm map[string]any,key string)string{v,_:=pm[key].(string);return v}
func permissionsForSource(source string)[]string{return []string{"product.read"}}
`
	if err := os.WriteFile(filepath.Join(dir, "jsonrpc.go"), []byte(source), 0600); err != nil {
		t.Fatal(err)
	}
	index, err := rpcInspection(root, map[string]map[string]string{"media": {"LIST": "list"}})
	if err != nil {
		t.Fatal(err)
	}
	fields := index["media"]["list"].Parameters
	if len(fields) != 1 || fields[0].Name != "source_type" || fields[0].Type != "string" {
		t.Fatalf("derived output replaced input contract: %#v", fields)
	}
}
