//go:build !unix

package server

import "os/exec"

func prepareTemplatePDFChromeProcess(_ *exec.Cmd) (*templatePDFChromeOwnership, error) {
	return nil, nil
}

func killTemplatePDFChromeProcess(cmd *exec.Cmd) error {
	if cmd == nil || cmd.Process == nil {
		return nil
	}
	return cmd.Process.Kill()
}
