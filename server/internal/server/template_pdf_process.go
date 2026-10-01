package server

import (
	"io"
	"os"
	"sync"
)

// The parent owns the DevTools pipe. Chromium exits on EOF even if the parent is killed.
type templatePDFChromeOwnership struct {
	input       *os.File
	output      *os.File
	childInput  *os.File
	childOutput *os.File
	disconnect  sync.Once
	closeOutput sync.Once
}

func (p *templatePDFChromeOwnership) Started() {
	if p == nil {
		return
	}
	_ = p.childInput.Close()
	_ = p.childOutput.Close()
	go func() { _, _ = io.Copy(io.Discard, p.output) }()
}

func (p *templatePDFChromeOwnership) Disconnect() {
	if p == nil {
		return
	}
	p.disconnect.Do(func() {
		_ = p.input.Close()
		_ = p.childInput.Close()
		_ = p.childOutput.Close()
	})
}

func (p *templatePDFChromeOwnership) Close() {
	if p == nil {
		return
	}
	p.Disconnect()
	p.closeOutput.Do(func() { _ = p.output.Close() })
}
