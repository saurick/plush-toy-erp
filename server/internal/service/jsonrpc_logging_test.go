package service

import (
	"bytes"
	"context"
	"strings"
	"testing"

	"github.com/go-kratos/kratos/v2/log"
	"google.golang.org/protobuf/types/known/structpb"
	v1 "server/api/jsonrpc/v1"
)

func TestJSONRPCInternalLogsExcludeParamsEvenInDebug(t *testing.T) {
	var output bytes.Buffer
	helper := log.NewHelper(log.NewStdLogger(&output))
	s := &JsonrpcService{log: helper, dispatcher: &jsonrpcDispatcher{log: helper}}
	params, _ := structpb.NewStruct(map[string]any{"password": "private-password", "note": "private-note", "arbitrary_field": "private-business-value"})
	reply, err := s.PostJsonrpc(context.Background(), &v1.PostJsonrpcRequest{Url: "system", Method: "ping", Id: "log-test", Params: params})
	if err != nil || reply.GetResult().GetCode() != 0 {
		t.Fatalf("ping failed: %v %v", reply, err)
	}
	text := output.String()
	if strings.Contains(text, "private-") || strings.Contains(text, "INFO") || strings.Contains(text, "params=") {
		t.Fatalf("unsafe or redundant request logging: %s", text)
	}
	if !strings.Contains(text, "DEBUG") || !strings.Contains(text, "id=log-test") {
		t.Fatalf("missing debug context: %s", text)
	}
}
