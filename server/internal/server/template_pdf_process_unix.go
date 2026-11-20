//go:build unix

package server

import (
	"os"
	"os/exec"
	"syscall"
)

func prepareTemplatePDFChromeProcess(cmd *exec.Cmd) (*templatePDFChromeOwnership, error) {
	input, parentInput, err := os.Pipe()
	if err != nil {
		return nil, err
	}
	parentOutput, output, err := os.Pipe()
	if err != nil {
		_ = input.Close()
		_ = parentInput.Close()
		return nil, err
	}
	cmd.ExtraFiles = []*os.File{input, output}
	cmd.Args = append(cmd.Args, "--remote-debugging-pipe")
	cmd.SysProcAttr = &syscall.SysProcAttr{Setpgid: true}
	return &templatePDFChromeOwnership{
		input: parentInput, output: parentOutput, childInput: input, childOutput: output,
	}, nil
}

func killTemplatePDFChromeProcess(cmd *exec.Cmd) error {
	if cmd == nil || cmd.Process == nil {
		return nil
	}
	return syscall.Kill(-cmd.Process.Pid, syscall.SIGKILL)
}
