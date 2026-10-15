package service

import (
	"context"
	"io"
	"testing"

	"server/internal/buildinfo"

	"github.com/go-kratos/kratos/v2/log"
)

func TestHandleSystemVersionReturnsBuildIdentity(t *testing.T) {
	dispatcher := &jsonrpcDispatcher{
		log: log.NewHelper(log.NewStdLogger(io.Discard)),
		buildIdentity: buildinfo.Resolve(
			"yoyoosun-20260810.1",
			"20c96d3819429361a35d2551b63b211f055de37e",
		),
	}

	id, result, err := dispatcher.handleSystem(context.Background(), "request-1", "version", nil)
	if err != nil {
		t.Fatalf("handleSystem returned error: %v", err)
	}
	if id != "request-1" || result.GetCode() != 0 {
		t.Fatalf("unexpected response identity: id=%q result=%#v", id, result)
	}
	data := result.GetData().AsMap()
	if data["version"] != "yoyoosun-20260810.1" || data["release_version"] != "yoyoosun-20260810.1" {
		t.Fatalf("unexpected release version payload: %#v", data)
	}
	if data["git_sha"] != "20c96d3819429361a35d2551b63b211f055de37e" || data["git_sha_short"] != "20c96d38" {
		t.Fatalf("unexpected git payload: %#v", data)
	}
	if data["formal"] != true {
		t.Fatalf("formal release flag is missing: %#v", data)
	}
}
