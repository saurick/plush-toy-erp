package data

import (
	"encoding/json"
	"errors"
	"reflect"
	"strings"
	"testing"

	"server/internal/biz"
)

func TestCustomerConfigJSONAllowsEmptyOptionalValues(t *testing.T) {
	for _, raw := range [][]byte{nil, {}, []byte("null")} {
		decodedMap, err := decodeMapJSON(raw)
		if err != nil || decodedMap == nil || len(decodedMap) != 0 {
			t.Fatalf("optional map %q: got %v, %v", raw, decodedMap, err)
		}
		decodedList, err := decodeStringListJSON(raw)
		if err != nil || decodedList == nil || len(decodedList) != 0 {
			t.Fatalf("optional list %q: got %v, %v", raw, decodedList, err)
		}
	}
}

func TestCustomerConfigJSONRejectsMalformedValues(t *testing.T) {
	for _, raw := range []string{"{", "[]", "true", `"value"`} {
		if _, err := decodeMapJSON([]byte(raw)); err == nil {
			t.Errorf("invalid map %q must fail", raw)
		}
	}
	for _, raw := range []string{"[", "{}", `"value"`, `["sales.read", 42]`} {
		if _, err := decodeStringListJSON([]byte(raw)); err == nil {
			t.Errorf("invalid string list %q must fail", raw)
		}
	}
}

func TestCustomerConfigRoleProfilePreservesRevokesAndRejectsInvalidLists(t *testing.T) {
	var profile biz.RoleProfileInput
	if err := decodeRoleProfileJSON(&profile, []byte(`["sales"]`), []byte(`["sales.write"]`)); err != nil {
		t.Fatal(err)
	}
	if !reflect.DeepEqual(profile.BundleKeys, []string{"sales"}) || !reflect.DeepEqual(profile.Revokes, []string{"sales.write"}) {
		t.Fatalf("role profile lost its permission lists: %#v", profile)
	}
	for _, test := range []struct {
		field   string
		bundles string
		revokes string
	}{
		{field: "bundle_keys", bundles: `{}`, revokes: `[]`},
		{field: "revokes", bundles: `[]`, revokes: `{}`},
	} {
		err := decodeRoleProfileJSON(&profile, []byte(test.bundles), []byte(test.revokes))
		var typeError *json.UnmarshalTypeError
		if !errors.As(err, &typeError) || !strings.Contains(err.Error(), test.field) {
			t.Errorf("%s must return the decoding error with field context: %v", test.field, err)
		}
	}
}

type customerConfigSnapshotScanner struct {
	raw []byte
}

func (scanner customerConfigSnapshotScanner) Scan(dest ...any) error {
	*dest[7].(*[]byte) = scanner.raw
	return nil
}

func TestScanCustomerConfigRevisionRejectsInvalidSnapshot(t *testing.T) {
	revision, err := scanCustomerConfigRevision(customerConfigSnapshotScanner{raw: []byte(`[]`)})
	if revision != nil || err == nil || !strings.Contains(err.Error(), "compiled_snapshot") {
		t.Fatalf("invalid snapshot must fail the revision read: %#v, %v", revision, err)
	}
	revision, err = scanCustomerConfigRevision(customerConfigSnapshotScanner{raw: []byte(`{"config_revision":"v1"}`)})
	if err != nil || revision.CompiledSnapshot["config_revision"] != "v1" {
		t.Fatalf("valid snapshot must remain readable: %#v, %v", revision, err)
	}
}
