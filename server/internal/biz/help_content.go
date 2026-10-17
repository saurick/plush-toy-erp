package biz

import (
	"context"
	"errors"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/google/uuid"
)

var ErrHelpContentConflict = errors.New("help content version conflict")

const (
	HelpMarkdownMaxCharacters = 20000
	HelpSummaryMaxCharacters  = 300
	HelpFeedbackMinCharacters = 5
	HelpFeedbackMaxCharacters = 3000
	HelpQuoteMaxCharacters    = 2000
	HelpResponseMaxCharacters = 1000
)

// HelpDocument is generated from the same definitions used by the handbook reader.
type HelpDocument struct {
	ID         string   `json:"id"`
	Book       string   `json:"book"`
	Title      string   `json:"title"`
	SourceHash string   `json:"source_hash"`
	Path       string   `json:"path,omitempty"`
	Roles      []string `json:"roles,omitempty"`
	Supplement bool     `json:"supplement"`
	CanEdit    bool     `json:"can_edit"`
	CanPublish bool     `json:"can_publish"`
}

type HelpDocumentCatalog interface {
	Documents() []HelpDocument
	CanRead(*AdminUser, HelpDocument) bool
}

type HelpRevision struct {
	Version      int       `json:"version"`
	Action       string    `json:"action"`
	Markdown     string    `json:"markdown"`
	SourceHash   string    `json:"source_hash"`
	Summary      string    `json:"summary"`
	ActorName    string    `json:"actor_name"`
	ActorID      int       `json:"-"`
	RestoredFrom int       `json:"restored_from"`
	CreatedAt    time.Time `json:"created_at"`
}

type HelpSupplement struct {
	DocumentID       string     `json:"document_id"`
	Version          int        `json:"version"`
	PublishedVersion int        `json:"published_version"`
	DraftMarkdown    string     `json:"draft_markdown,omitempty"`
	Markdown         string     `json:"markdown"`
	SourceHash       string     `json:"source_hash"`
	PublishedAt      *time.Time `json:"published_at"`
	PublishedBy      string     `json:"published_by"`
}

type HelpFeedback struct {
	ID               int        `json:"id"`
	DocumentID       string     `json:"document_id"`
	DocumentTitle    string     `json:"document_title"`
	SourceHash       string     `json:"source_hash"`
	PublishedVersion int        `json:"published_version"`
	Quote            string     `json:"quote"`
	Message          string     `json:"message"`
	ActorID          int        `json:"-"`
	ActorName        string     `json:"actor_name"`
	RequestKey       string     `json:"-"`
	CreatedAt        time.Time  `json:"created_at"`
	Response         string     `json:"response"`
	RespondedBy      string     `json:"responded_by"`
	RespondedAt      *time.Time `json:"responded_at"`
}

type HelpContentRepo interface {
	ListPublished(context.Context) ([]HelpSupplement, error)
	ReadChapter(context.Context, string, bool, int) (HelpSupplement, []HelpRevision, []HelpFeedback, error)
	WriteRevision(context.Context, string, int, HelpRevision) (HelpSupplement, error)
	CreateFeedback(context.Context, HelpFeedback) (HelpFeedback, error)
	RespondFeedback(context.Context, string, int, string, string) error
}

type HelpContentUsecase struct {
	repo    HelpContentRepo
	catalog HelpDocumentCatalog
}

func NewHelpContentUsecase(repo HelpContentRepo, catalog HelpDocumentCatalog) *HelpContentUsecase {
	return &HelpContentUsecase{repo: repo, catalog: catalog}
}

func HelpEditPermissions(book string) (string, string) {
	switch book {
	case "business":
		return PermissionHelpBusinessEdit, PermissionHelpBusinessPublish
	case "administration":
		return PermissionHelpAdministrationEdit, PermissionHelpAdministrationPublish
	case "operations":
		return PermissionHelpOperationsEdit, PermissionHelpOperationsPublish
	}
	return "", ""
}

func HelpCanMaintain(admin *AdminUser, book string) (bool, bool) {
	if !admin.IsActive() {
		return false, false
	}
	edit, publish := HelpEditPermissions(book)
	permissions := PermissionKeySet(admin.Permissions)
	return edit != "" && (admin.IsSuperAdmin || PermissionSetHasAny(permissions, edit)), publish != "" && (admin.IsSuperAdmin || PermissionSetHasAny(permissions, publish))
}

func (uc *HelpContentUsecase) document(admin *AdminUser, id string) (HelpDocument, error) {
	if !admin.IsActive() {
		return HelpDocument{}, ErrForbidden
	}
	for _, doc := range uc.catalog.Documents() {
		if doc.ID == id && uc.catalog.CanRead(admin, doc) {
			return doc, nil
		}
	}
	return HelpDocument{}, ErrForbidden
}

type HelpContentView struct {
	Documents []HelpDocument   `json:"documents"`
	Published []HelpSupplement `json:"published"`
}

func (uc *HelpContentUsecase) Read(ctx context.Context, admin *AdminUser) (HelpContentView, error) {
	view := HelpContentView{Documents: []HelpDocument{}, Published: []HelpSupplement{}}
	if !admin.IsActive() {
		return view, ErrForbidden
	}
	allowed := map[string]bool{}
	for _, doc := range uc.catalog.Documents() {
		if uc.catalog.CanRead(admin, doc) {
			edit, publish := HelpCanMaintain(admin, doc.Book)
			doc.CanEdit = edit && doc.Supplement
			doc.CanPublish = publish && doc.Supplement
			view.Documents = append(view.Documents, doc)
			allowed[doc.ID] = true
		}
	}
	items, err := uc.repo.ListPublished(ctx)
	if err != nil {
		return view, err
	}
	for _, item := range items {
		if allowed[item.DocumentID] {
			item.DraftMarkdown = ""
			view.Published = append(view.Published, item)
		}
	}
	return view, nil
}

type HelpChapterView struct {
	Document   HelpDocument   `json:"document"`
	CanEdit    bool           `json:"can_edit"`
	CanPublish bool           `json:"can_publish"`
	CanRespond bool           `json:"can_respond"`
	Supplement HelpSupplement `json:"supplement"`
	History    []HelpRevision `json:"history"`
	Feedback   []HelpFeedback `json:"feedback"`
}

func (uc *HelpContentUsecase) Chapter(ctx context.Context, admin *AdminUser, id string) (HelpChapterView, error) {
	doc, err := uc.document(admin, id)
	if err != nil {
		return HelpChapterView{}, err
	}
	edit, publish := HelpCanMaintain(admin, doc.Book)
	item, history, feedback, err := uc.repo.ReadChapter(ctx, id, edit || publish, admin.ID)
	if !edit && !publish {
		item.DraftMarkdown = ""
		history = []HelpRevision{}
	}
	return HelpChapterView{Document: doc, CanEdit: edit && doc.Supplement, CanPublish: publish && doc.Supplement, CanRespond: edit || publish, Supplement: item, History: history, Feedback: feedback}, err
}

func (uc *HelpContentUsecase) Write(ctx context.Context, admin *AdminUser, id, action string, expected int, markdown, summary string, restore int) (HelpSupplement, error) {
	doc, err := uc.document(admin, id)
	if err != nil {
		return HelpSupplement{}, err
	}
	edit, publish := HelpCanMaintain(admin, doc.Book)
	if !doc.Supplement || (action == "publish" && !publish) || (action != "publish" && !edit) {
		return HelpSupplement{}, ErrForbidden
	}
	if action != "save" && action != "publish" && action != "restore" {
		return HelpSupplement{}, ErrBadParam
	}
	markdown = strings.TrimSpace(markdown)
	summary = strings.TrimSpace(summary)
	if expected < 0 || utf8.RuneCountInString(markdown) > HelpMarkdownMaxCharacters || utf8.RuneCountInString(summary) > HelpSummaryMaxCharacters || summary == "" || (action == "restore" && restore < 1) {
		return HelpSupplement{}, ErrBadParam
	}
	return uc.repo.WriteRevision(ctx, id, expected, HelpRevision{Action: action, Markdown: markdown, Summary: summary, SourceHash: doc.SourceHash, ActorID: admin.ID, ActorName: AdminDisplayName(admin), RestoredFrom: restore})
}

func (uc *HelpContentUsecase) Feedback(ctx context.Context, admin *AdminUser, id, sourceHash, quote, message, requestKey string, publishedVersion int) (HelpFeedback, error) {
	doc, err := uc.document(admin, id)
	if err != nil {
		return HelpFeedback{}, err
	}
	if sourceHash != doc.SourceHash {
		return HelpFeedback{}, ErrHelpContentConflict
	}
	quote = strings.TrimSpace(quote)
	message = strings.TrimSpace(message)
	if utf8.RuneCountInString(message) < HelpFeedbackMinCharacters || utf8.RuneCountInString(message) > HelpFeedbackMaxCharacters || utf8.RuneCountInString(quote) > HelpQuoteMaxCharacters || len(sourceHash) != 64 || publishedVersion < 0 {
		return HelpFeedback{}, ErrBadParam
	}
	if _, err := uuid.Parse(requestKey); err != nil {
		return HelpFeedback{}, ErrBadParam
	}
	return uc.repo.CreateFeedback(ctx, HelpFeedback{DocumentID: id, DocumentTitle: doc.Title, SourceHash: sourceHash, PublishedVersion: publishedVersion, Quote: quote, Message: message, RequestKey: requestKey, ActorID: admin.ID, ActorName: AdminDisplayName(admin)})
}

func (uc *HelpContentUsecase) Respond(ctx context.Context, admin *AdminUser, id string, feedbackID int, response string) error {
	doc, err := uc.document(admin, id)
	if err != nil {
		return err
	}
	edit, publish := HelpCanMaintain(admin, doc.Book)
	if !edit && !publish {
		return ErrForbidden
	}
	response = strings.TrimSpace(response)
	if feedbackID < 1 || response == "" || utf8.RuneCountInString(response) > HelpResponseMaxCharacters {
		return ErrBadParam
	}
	return uc.repo.RespondFeedback(ctx, id, feedbackID, response, AdminDisplayName(admin))
}
