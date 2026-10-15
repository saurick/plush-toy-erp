package qualitycheck

// Item preserves what was checked and against which requirement. It is evidence,
// not an instruction to change stock or calculate a rejection quantity.
type Item struct {
	Name        string `json:"name"`
	Requirement string `json:"requirement"`
	Observation string `json:"observation"`
	Result      string `json:"result"`
	Scope       string `json:"scope"`
	Note        string `json:"note"`
}
