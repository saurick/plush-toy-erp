"""安装已提交模块的固定副本；定时任务不依赖共享工作区的后续写入。"""

import hashlib
import os
from pathlib import Path
import plistlib
import shutil
import subprocess

from replica_config import private_file, require
from replica_storage import atomic_bytes, atomic_json, now, private_directory


def checked(args, **kwargs):
    return subprocess.run(args, check=True, capture_output=True, timeout=30, **kwargs)


def install(config, config_file, root, state):
    require(os.uname().sysname == "Darwin", "launchd_requires_macos")
    source = Path(__file__).resolve().parent
    repository = source.parents[2]
    environment = dict(os.environ, GIT_OPTIONAL_LOCKS="0")
    sha = checked(["git", "rev-parse", "HEAD"], cwd=repository, env=environment).stdout.decode().strip()
    files = sorted(file for file in source.glob("*.py") if not file.name.startswith("test_"))
    hasher = hashlib.sha256()
    for file in files:
        committed = checked(["git", "show", sha + ":" + str(file.relative_to(repository))],
                            cwd=repository, env=environment).stdout
        require(committed == file.read_bytes(), "install_requires_committed_modules")
        hasher.update(file.name.encode() + b"\0" + committed)
    identity = hasher.hexdigest()
    releases = private_directory(state.parent / "runtime/releases")
    release = releases / identity[:16]
    if not release.exists():
        private_directory(release)
        for file in files:
            atomic_bytes(release / file.name, file.read_bytes())
        atomic_json(release / "artifact.json", {"gitSha": sha, "sha256": identity,
                    "files": [file.name for file in files]})
    for file in files:
        require((release / file.name).read_bytes() == file.read_bytes(), "runtime_artifact_drift")
    label = "me.saurick.plush-backup-replica." + config["destination"]["id"]
    agents = Path.home() / "Library/LaunchAgents"
    agents.mkdir(exist_ok=True)
    require(agents.resolve() == agents and agents.stat().st_uid == os.getuid(), "unsafe_launchagents")
    plist = agents / (label + ".plist")
    logs = private_directory(state.parent / "logs")
    value = {
        "Label": label,
        "ProgramArguments": [shutil.which("python3"), "-B", str(release / "backup_replica.py"),
                             "run", "--config", str(config_file)],
        "RunAtLoad": True, "StartOnMount": True,
        "StartCalendarInterval": {"Hour": config["schedule"]["hour"],
                                  "Minute": config["schedule"]["minute"]},
        "ProcessType": "Background", "LowPriorityIO": True, "Nice": 10,
        "ThrottleInterval": 300,
        "EnvironmentVariables": {"PATH": "/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin",
                                 "PYTHONDONTWRITEBYTECODE": "1", "GIT_OPTIONAL_LOCKS": "0"},
        "StandardOutPath": str(logs / "replica.stdout.log"),
        "StandardErrorPath": str(logs / "replica.stderr.log"),
    }
    domain = "gui/" + str(os.getuid())
    old_bytes = None
    old_loaded = False
    if plist.exists():
        old_bytes = private_file(plist).read_bytes()
        old = plistlib.loads(old_bytes)
        require(old.get("Label") == label and len(old.get("ProgramArguments", [])) >= 3
                and Path(old["ProgramArguments"][2]).is_relative_to(releases),
                "foreign_launchagent")
        old_loaded = subprocess.run(["launchctl", "print", domain + "/" + label],
                                    capture_output=True, timeout=15).returncode == 0
        if old_loaded:
            checked(["launchctl", "bootout", domain, str(plist)])
    atomic_bytes(plist, plistlib.dumps(value))
    checked(["plutil", "-lint", str(plist)])
    try:
        checked(["launchctl", "bootstrap", domain, str(plist)])
        checked(["launchctl", "print", domain + "/" + label])
    except subprocess.SubprocessError:
        if old_bytes is not None:
            subprocess.run(["launchctl", "bootout", domain, str(plist)],
                           capture_output=True, timeout=15)
            atomic_bytes(plist, old_bytes)
            if old_loaded:
                checked(["launchctl", "bootstrap", domain, str(plist)])
        raise
    result = {"status": "passed", "installedAt": now(), "label": label,
              "sourceCommit": sha, "runtimeSha256": identity, "runtimeDirectory": str(release),
              "schedule": config["schedule"], "scheduleTimezone": "local macOS timezone",
              "runAtLogin": True, "runOnMount": True, "wakeComputer": False,
              "destinationId": config["destination"]["id"]}
    atomic_json(state / "installation.json", result)
    return result
