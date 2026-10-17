package projectmanuals

import (
	_ "embed"
	"encoding/json"
	"server/internal/biz"
)

//go:embed documents.generated.json
var documentContent []byte

type Catalog struct{ documents []biz.HelpDocument }

func NewCatalog() *Catalog {
	var documents []biz.HelpDocument
	if err := json.Unmarshal(documentContent, &documents); err != nil {
		panic("invalid generated help document catalog")
	}
	return &Catalog{documents: documents}
}

func (c *Catalog) Documents() []biz.HelpDocument { return c.documents }

func (c *Catalog) CanRead(admin *biz.AdminUser, doc biz.HelpDocument) bool {
	if !CanReadBook(admin, doc.Book) {
		return false
	}
	if doc.Book != "business" || admin.IsSuperAdmin || (len(doc.Roles) == 0 && doc.Path == "") {
		return true
	}
	for _, key := range doc.Roles {
		if biz.AdminHasRole(admin, key) {
			return true
		}
	}
	for _, menu := range biz.AdminVisibleMenus(admin) {
		if doc.Path != "" && doc.Path == menu.Path {
			return true
		}
	}
	return false
}
