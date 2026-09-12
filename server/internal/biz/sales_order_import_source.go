package biz

import (
	"bytes"
	"encoding/hex"
	"encoding/json"
	"path"
	"strings"
	"unicode/utf8"
)

// The original cells are evidence only: they never assign designers, products,
// shipment quantities or finance facts, and remain immutable after creation.
func normalizeSalesOrderImportSource(source map[string]any) (map[string]any, error) {
	if len(source) == 0 {
		return nil, nil
	}
	raw, err := json.Marshal(source)
	if err != nil || len(raw) > 32768 {
		return nil, ErrBadParam
	}
	var evidence struct {
		FileName   string   `json:"file_name"`
		FileSHA256 string   `json:"file_sha256"`
		SheetName  string   `json:"sheet_name"`
		RowNumber  int      `json:"row_number"`
		ImageFiles []string `json:"image_files,omitempty"`
		Cells      []struct {
			Column int    `json:"column"`
			Label  string `json:"label"`
			Value  string `json:"value"`
		} `json:"cells"`
	}
	decoder := json.NewDecoder(bytes.NewReader(raw))
	decoder.DisallowUnknownFields()
	if decoder.Decode(&evidence) != nil {
		return nil, ErrBadParam
	}
	validName := func(value string, max int) bool {
		return strings.TrimSpace(value) != "" && utf8.RuneCountInString(value) <= max && !strings.ContainsAny(value, "\x00\r\n")
	}
	digest, err := hex.DecodeString(evidence.FileSHA256)
	if !validName(evidence.FileName, 255) || path.Base(evidence.FileName) != evidence.FileName || strings.Contains(evidence.FileName, "\\") || !validName(evidence.SheetName, 128) || evidence.RowNumber < 1 || evidence.RowNumber > 5000 || err != nil || len(digest) != 32 || len(evidence.Cells) == 0 || len(evidence.Cells) > 64 || len(evidence.ImageFiles) > 10 {
		return nil, ErrBadParam
	}
	seen := map[int]bool{}
	for _, cell := range evidence.Cells {
		if cell.Column < 1 || cell.Column > 16384 || seen[cell.Column] || !validName(cell.Label, 128) || utf8.RuneCountInString(cell.Value) > 2048 || strings.ContainsRune(cell.Value, 0) {
			return nil, ErrBadParam
		}
		seen[cell.Column] = true
	}
	for _, name := range evidence.ImageFiles {
		if !validName(name, 255) || path.Base(name) != name || strings.Contains(name, "\\") {
			return nil, ErrBadParam
		}
	}
	raw, _ = json.Marshal(evidence)
	var normalized map[string]any
	if json.Unmarshal(raw, &normalized) != nil {
		return nil, ErrBadParam
	}
	return normalized, nil
}
