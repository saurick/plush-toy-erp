package server

import (
	"bytes"
	"errors"
	"fmt"
	"io"
	stdhttp "net/http"
	"strings"

	"server/internal/biz"
	"server/internal/errcode"

	kratoserrors "github.com/go-kratos/kratos/v2/errors"
	httpx "github.com/go-kratos/kratos/v2/transport/http"
)

const maxJSONRPCRequestBodyBytes int64 = 2 << 20

// JSONRPCBodyLimitFilter bounds request allocation before protobuf/JSON
// decoding. The attachment route keeps its larger, business-defined budget.
func JSONRPCBodyLimitFilter() httpx.FilterFunc {
	return func(next stdhttp.Handler) stdhttp.Handler {
		return stdhttp.HandlerFunc(func(w stdhttp.ResponseWriter, r *stdhttp.Request) {
			if !strings.HasPrefix(r.URL.Path, "/rpc/") {
				next.ServeHTTP(w, r)
				return
			}

			limit := maxJSONRPCRequestBodyBytes
			if r.URL.Path == "/rpc/attachment" {
				limit = biz.BusinessAttachmentMaxJSONRPCBodyBytes
			}
			if r.ContentLength > limit {
				stdhttp.Error(w, "request body too large", stdhttp.StatusRequestEntityTooLarge)
				return
			}
			r.Body = stdhttp.MaxBytesReader(w, r.Body, limit)
			next.ServeHTTP(w, r)
		})
	}
}

// BoundedRequestDecoder keeps Kratos' default body decoding behavior, while
// preserving the HTTP 413 contract when MaxBytesReader rejects a chunked body.
func BoundedRequestDecoder(r *stdhttp.Request, v interface{}) error {
	codec, ok := httpx.CodecForRequest(r, "Content-Type")
	if !ok {
		return kratoserrors.BadRequest("CODEC", fmt.Sprintf("unregister Content-Type: %s", r.Header.Get("Content-Type")))
	}

	data, err := io.ReadAll(r.Body)
	r.Body = io.NopCloser(bytes.NewBuffer(data))
	if err != nil {
		var maxBytesErr *stdhttp.MaxBytesError
		if errors.As(err, &maxBytesErr) {
			return kratoserrors.New(
				stdhttp.StatusRequestEntityTooLarge,
				errcode.PayloadTooLarge.Name,
				errcode.PayloadTooLarge.Message,
			)
		}
		return kratoserrors.BadRequest("CODEC", err.Error())
	}
	if len(data) == 0 {
		return nil
	}
	if err := codec.Unmarshal(data, v); err != nil {
		return kratoserrors.BadRequest("CODEC", fmt.Sprintf("body unmarshal %s", err.Error()))
	}
	return nil
}
