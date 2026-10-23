#!/usr/bin/env python3
"""Serialize one authorized, reviewed commit without a resident coordinator."""

import argparse
import fcntl
import hashlib
import json
import os
from pathlib import Path
import re
import signal
import stat
import subprocess
import sys
import tempfile


class Refused(Exception):
    pass


def git(*args, env=None, data=None, ok=(0,)):
    result = subprocess.run(
        ["git", "--literal-pathspecs", "-c", "diff.autoRefreshIndex=false", *args],
        env={**os.environ, "GIT_OPTIONAL_LOCKS": "0", **(env or {})},
        input=data, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
    )
    if result.returncode not in ok:
        raise Refused(result.stderr.decode(errors="replace").strip() or f"git {args[0]} failed")
    return result.stdout


def value(*args, **kwargs):
    return git(*args, **kwargs).decode().strip()


def unchanged(tree, paths=(), env=None):
    result = git("diff", "--cached", "--no-ext-diff", "--binary", tree, "--", *paths, env=env)
    return not result


def worktree_state(paths):
    result = {}
    for name in paths:
        path = Path(name)
        try:
            mode = path.lstat().st_mode
        except FileNotFoundError:
            result[name] = None
            continue
        if stat.S_ISLNK(mode):
            data = os.fsencode(os.readlink(path))
        elif stat.S_ISREG(mode):
            data = path.read_bytes()
        else:
            raise Refused(f"只支持普通文件、符号链接及删除：{name}")
        result[name] = [stat.S_IFMT(mode), bool(mode & stat.S_IXUSR), hashlib.sha256(data).hexdigest()]
    return result


def repository():
    root = value("rev-parse", "--show-toplevel")
    os.chdir(root)
    index = Path(value("rev-parse", "--path-format=absolute", "--git-path", "index"))
    return root, index


def verify_context():
    source = os.environ.get("PLUSH_COMMIT_CONTEXT")
    if not source:
        raise Refused(
            "请通过 python3 scripts/git-hooks/commit-scope.py 提交（--help 查看用法）。"
            "它统一保护核对、暂存、hooks 与提交；已有暂存内容已保留。"
        )
    context = json.loads(Path(source).read_text())
    root, index = repository()
    mutex = Path(str(index) + ".codex-commit-once.lock")
    if root != context["root"] or not os.path.samestat(os.fstat(context["fd"]), mutex.stat()):
        raise Refused("提交互斥身份不一致，保留现场")
    with mutex.open("a+b") as probe:
        try:
            fcntl.flock(probe, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            pass
        else:
            raise Refused("提交互斥已释放，保留现场")
    if value("rev-parse", "HEAD") != context["head"]:
        raise Refused("HEAD 在提交期间变化，保留现场")
    if value("symbolic-ref", "-q", "HEAD", ok=(0, 1)) != context["branch"]:
        raise Refused("分支在提交期间变化，保留现场")
    if not unchanged(context["tree"]):
        raise Refused("暂存内容偏离已核对的候选，保留现场")
    if worktree_state(context["worktree"]) != context["worktree"]:
        raise Refused("提交范围内文件被其他写入修改，保留现场")


def acquire(mutex, seconds):
    try:
        fcntl.flock(mutex, fcntl.LOCK_EX | fcntl.LOCK_NB)
        return
    except BlockingIOError:
        if seconds == 0:
            raise Refused("提交入口正在使用；未修改暂存区") from None
    print(f"[commit-scope] 等待当前提交结束，最多 {seconds:g} 秒；尚未暂存", flush=True)

    def timed_out(_signum, _frame):
        raise Refused("等待提交入口超时；未修改暂存区，请在当前提交结束后重新核对")

    previous = signal.signal(signal.SIGALRM, timed_out)
    signal.setitimer(signal.ITIMER_REAL, seconds)
    try:
        fcntl.flock(mutex, fcntl.LOCK_EX)
    finally:
        signal.setitimer(signal.ITIMER_REAL, 0)
        signal.signal(signal.SIGALRM, previous)


def commit(args):
    if any(os.environ.get(key) for key in ("GIT_INDEX_FILE", "GIT_DIR", "GIT_WORK_TREE", "GIT_COMMON_DIR")):
        raise Refused("提交入口不接受外部 Git 目录或 index 覆盖")
    patch_file = Path(args.patch).resolve() if args.patch else None
    root, index = repository()
    base = value("rev-parse", "--verify", f"{args.base}^{{commit}}")
    if value("config", "--get", "core.hooksPath", ok=(0, 1)) != ".githooks":
        raise Refused("项目 hooks 未启用；先运行 bash scripts/setup-git-hooks.sh")
    with tempfile.TemporaryDirectory(prefix="plush-commit-scope-") as temporary:
        temp = Path(temporary)
        candidate_env = {"GIT_INDEX_FILE": str(temp / "index")}
        git("read-tree", base, env=candidate_env)
        if patch_file:
            patch = patch_file.read_bytes()
            git("apply", "--cached", "--whitespace=error-all", "-", env=candidate_env, data=patch)
        else:
            for name in args.files:
                path = Path(name)
                if path.is_absolute() or ".." in path.parts or ".git" in path.parts or path.is_dir():
                    raise Refused(f"需要仓库相对的精确文件路径：{name}")
            git("add", "--", *args.files, env=candidate_env)
        paths = [os.fsdecode(p) for p in git(
            "diff", "--cached", "--no-renames", "--name-only", "-z", base, env=candidate_env
        ).split(b"\0") if p]
        if not paths:
            raise Refused("候选没有提交内容")
        patch = git("diff", "--cached", "--no-ext-diff", "--binary", "--full-index", base, env=candidate_env)
        scope_state = worktree_state(paths)
        with Path(str(index) + ".codex-commit-once.lock").open("a+b") as mutex:
            acquire(mutex, args.wait_seconds)
            # Never delete this persistent inode: unlinking it lets contenders lock different files.
            if Path(str(index) + ".lock").exists():
                raise Refused("Git index.lock 存在；保留锁，按 git-closeout-coordination 核验恢复")
            head = value("rev-parse", "HEAD")
            branch = value("symbolic-ref", "-q", "HEAD", ok=(0, 1))
            if head != base:
                git("merge-base", "--is-ancestor", base, head)
                if git("diff", "--no-ext-diff", "--binary", base, head, "--", *paths):
                    raise Refused("已核对文件在其他提交中变化；请重新核对补丁，未修改暂存区")
            if worktree_state(paths) != scope_state:
                raise Refused("等待期间提交范围内文件变化；未修改暂存区")
            git("read-tree", head, env=candidate_env)
            git("apply", "--cached", "--whitespace=error-all", "-", env=candidate_env, data=patch)
            tree = value("write-tree", env=candidate_env)
            staged_here = unchanged(head)
            if not staged_here and not unchanged(tree):
                raise Refused("暂存区含其他内容；未清空或覆盖，请先由原提交完成收口")
            context = {"root": root, "fd": mutex.fileno(), "head": head, "branch": branch,
                       "tree": tree, "worktree": scope_state}
            context_path = temp / "context.json"
            context_path.write_text(json.dumps(context))
            env = {**os.environ, "GIT_OPTIONAL_LOCKS": "0", "PLUSH_COMMIT_CONTEXT": str(context_path)}
            if staged_here:
                git("-c", "core.lockfilePid=true", "apply", "--cached", "--whitespace=error-all", "-", data=patch)
            try:
                # Check again after staging, then let the real project hooks check the same candidate.
                subprocess.run(
                    [sys.executable, str(Path(__file__).resolve()), "--verify"],
                    env=env, pass_fds=(mutex.fileno(),), check=True,
                )
                result = subprocess.run(
                    ["git", "-c", "core.lockfilePid=true", "commit", "-m", args.message],
                    env=env, pass_fds=(mutex.fileno(),),
                )
                if result.returncode:
                    raise Refused(f"提交或 hook 未通过（退出码 {result.returncode}）")
            except (Refused, subprocess.CalledProcessError, KeyboardInterrupt):
                # Only undo staging made by this invocation, and only if the complete tree is intact.
                if (staged_here and value("rev-parse", "HEAD") == head
                        and value("symbolic-ref", "-q", "HEAD", ok=(0, 1)) == branch
                        and unchanged(tree) and not Path(str(index) + ".lock").exists()):
                    git("-c", "core.lockfilePid=true", "restore", "--staged", "--", *paths)
                    print("[commit-scope] 已撤销本次暂存，工作文件保留", file=sys.stderr)
                else:
                    print("[commit-scope] 已保留暂存现场，请核对后继续", file=sys.stderr)
                raise
            committed = value("rev-parse", "HEAD")
            if value("rev-parse", "HEAD^{tree}") != tree or value("rev-parse", "HEAD^") != head:
                raise Refused("提交后身份与候选不一致；保留现场，需人工核对")
            print(f"[commit-scope] committed {committed}; 未推送", flush=True)


def main():
    parser = argparse.ArgumentParser(description="仅在用户授权后提交；精确范围、进程互斥、真实 hooks，不推送")
    parser.add_argument("--verify", action="store_true", help=argparse.SUPPRESS)
    parser.add_argument("--base", help="已审查补丁/文件对应的完整 HEAD SHA")
    parser.add_argument("--message", help="提交说明")
    parser.add_argument("--patch", help="已审查的 Git 补丁（支持混合文件和 binary diff）")
    parser.add_argument("--wait-seconds", type=float, default=45, help="操作系统互斥等待上限，0–60 秒，默认 45")
    parser.add_argument("files", nargs="*", help="整文件提交时，在 -- 后列出精确路径；与 --patch 互斥")
    args = parser.parse_args()
    if args.verify:
        verify_context()
        return
    if not args.base or not args.message or bool(args.patch) == bool(args.files):
        parser.error("需要 --base、--message，以及 --patch 或 -- 后的精确文件")
    if not re.fullmatch(r"(?:[0-9a-f]{40}|[0-9a-f]{64})", args.base):
        parser.error("--base 必须是已审查的完整 commit SHA，不能使用会变化的 HEAD 或分支名")
    if not 0 <= args.wait_seconds <= 60:
        parser.error("--wait-seconds 必须在 0–60 之间")
    commit(args)


if __name__ == "__main__":
    try:
        main()
    except (Refused, OSError, ValueError, KeyError, subprocess.CalledProcessError) as error:
        print(f"[commit-scope] {error}", file=sys.stderr)
        sys.exit(1)
    except KeyboardInterrupt:
        print("[commit-scope] 操作中断，需重新核对现场", file=sys.stderr)
        sys.exit(130)
