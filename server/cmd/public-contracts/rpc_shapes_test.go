package main

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestRPCWireShapesFollowReturnsEmbeddedDTOsAndJSONTags(t *testing.T) {
	root := t.TempDir()
	files := map[string]string{
		"biz/types.go": `package biz
type Order struct { ID int; Amount string; Label *string }
type OrderReader interface { Get() (*Order,error) }
type Usecase struct { OrderReader }
`,
		"service/jsonrpc.go": `package service
import ("encoding/json";"server/internal/biz")
type jsonrpcDispatcher struct { uc *biz.Usecase }
func(d *jsonrpcDispatcher) Handle(url,method,id string,pm map[string]any)(string,*v1.JsonrpcResult,error){switch url{case "orders":return d.handleOrders(method,id,pm)};return id,nil,nil}
func(d *jsonrpcDispatcher) handleOrders(method,id string,pm map[string]any)(string,*v1.JsonrpcResult,error){
 if method=="empty"{return id,&v1.JsonrpcResult{Code:0},nil}
 if method=="get"{order,_:=d.uc.Get();return id,okData(map[string]any{"order":orderMap(order)}),nil}
 if method=="encoded"{value:=DTO{ID:1,Child:&Child{Label:"demo"}};raw,_:=json.Marshal(value);var data map[string]any;json.Unmarshal(raw,&data);return id,okData(data),nil}
 return id,okData(map[string]any{"unrelated":true}),nil
}
func okData(data map[string]any)*v1.JsonrpcResult{return &v1.JsonrpcResult{Code:0,Data:newDataStruct(data)}}
func orderMap(order *biz.Order)map[string]any{if order==nil{return nil};return merge(map[string]any{"id":order.ID},map[string]any{"amount":order.Amount,"label":order.Label})}
func merge(base map[string]any,extras ...map[string]any)map[string]any{for _,extra:=range extras{for key,value:=range extra{base[key]=value}};return base}
type Child struct{Label string ` + "`json:\"label\"`" + `}
type DTO struct{ID int ` + "`json:\"id\"`" + `;Child *Child ` + "`json:\"child\"`" + `;Private string ` + "`json:\"-\"`" + `}
`,
	}
	for name, source := range files {
		p := filepath.Join(root, "server/internal", name)
		if err := os.MkdirAll(filepath.Dir(p), 0755); err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(p, []byte(source), 0600); err != nil {
			t.Fatal(err)
		}
	}
	r, err := newRPCShapeReader(root)
	if err != nil {
		t.Fatal(err)
	}
	empty := r.response("orders", "empty")
	if empty.Type != "null" {
		t.Fatalf("empty data: %#v", empty)
	}
	get := r.response("orders", "get")
	if len(get.Fields) != 1 || get.Fields["unrelated"] != nil {
		t.Fatal("later method return mixed into earlier return")
	}
	order := get.Fields["order"]
	if order == nil || !order.Nullable || order.Fields["id"] == nil || order.Fields["id"].Type != "integer" || order.Fields["amount"].Type != "string" || !order.Fields["label"].Nullable {
		t.Fatalf("embedded DTO/variadic maps: %#v", order)
	}
	encoded := r.response("orders", "encoded")
	if len(encoded.Fields) != 2 || encoded.Fields["Private"] != nil || encoded.Fields["child"] == nil || encoded.Fields["child"].Fields["label"] == nil || encoded.Fields["child"].Fields["label"].Type != "string" {
		t.Fatalf("JSON tags/nested object: %#v", encoded)
	}
	fields := rpcShapeFields(&rpcWireShape{Type: "object", Fields: map[string]*rpcWireShape{"keys": {Type: "array", Item: &rpcWireShape{Type: "string"}}}}, "result.data")
	if len(fields) != 2 || fields[1].Name != "result.data.keys[]" || fields[1].Type != "string" {
		t.Fatalf("primitive array element type missing: %#v", fields)
	}
}

func TestRPCResponseWireShapesCoverRegisteredMethods(t *testing.T) {
	r, err := newRPCShapeReader("../../..")
	if err != nil {
		t.Fatal(err)
	}
	methods, err := rpcMethods("../../..")
	if err != nil {
		t.Fatal(err)
	}
	var missing []string
	for domain, names := range methods {
		for _, method := range names {
			shape := r.response(domain, method)
			if shape.Type == "unresolved" {
				missing = append(missing, domain+"."+method)
				continue
			}
			for _, field := range rpcShapeFields(shape, "result.data") {
				if strings.HasPrefix(field.Type, "unresolved") {
					missing = append(missing, domain+"."+method+":"+field.Name+" ("+field.Expression+fmt.Sprintf(" %s:%d", field.Source.Path, field.Source.Line)+")")
				}
			}
		}
	}
	if len(missing) > 0 {
		t.Fatalf("unresolved response wire shapes (%d):\n%s", len(missing), strings.Join(missing, "\n"))
	}
}
