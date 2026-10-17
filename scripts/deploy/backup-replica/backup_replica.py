#!/usr/bin/env python3
"""独立加密备份副本：介质初始化、拉取、隔离恢复与 launchd 安装。"""

import argparse
from datetime import datetime, timezone
import json
import os
from pathlib import Path
import signal
import subprocess
import sys

from replica_config import ReplicaError, load_config, resolve_volume
from replica_storage import atomic_json, destination, exclusive, now, private_directory
from replica_sync import synchronize
from replica_transport import SSHSource


def interrupted(signum, frame):
    raise ReplicaError("interrupted")


def execute(action, config, config_file):
    state = private_directory(config["stateDirectory"])
    if action == "status":
        file = state / "latest-operation.json"
        return json.loads(file.read_text()) if file.exists() else {"status": "not_run"}
    if action == "install":
        from replica_install import install
        root = destination(config, resolve_volume(config))
        return install(config, config_file, root, state)
    with exclusive(state):
        try:
            mount = resolve_volume(config)
        except ReplicaError as error:
            if error.code != "volume_not_mounted" or action not in ("sync", "run"):
                raise
            return {"status": "skipped", "reason": error.code, "checkedAt": now(),
                    "destinationId": config["destination"]["id"]}
        root = destination(config, mount, initialize=action == "init")
        if action == "init":
            return {"status": "passed", "action": "init", "checkedAt": now(),
                    "destinationId": config["destination"]["id"]}
        if action == "verify":
            from replica_restore import verify_restore
            return verify_restore(config, root, state)
        result = synchronize(config, root, SSHSource(config))
        atomic_json(state / "latest-sync.json", result)
        if action == "run":
            previous = state / "latest-restore.json"
            due = not previous.exists()
            if not due:
                last = json.loads(previous.read_text())
                due = last.get("status") != "passed" or last.get("sourceId") != config["source"]["id"]
                due = due or last.get("destinationId") != config["destination"]["id"]
                due = due or last.get("volumeUUID") != config["destination"]["volumeUUID"]
                if not due:
                    elapsed = datetime.now(timezone.utc) - datetime.fromisoformat(last["checkedAt"])
                    due = elapsed.total_seconds() >= config["restore"]["everyDays"] * 86400
            if due:
                from replica_restore import verify_restore
                result["restore"] = verify_restore(config, root, state)
            else:
                result["restore"] = {"status": "not_due", "lastVerifiedAt": last["checkedAt"]}
        atomic_json(state / "last-success.json", result)
        return result


def main():
    os.umask(0o077)
    signal.signal(signal.SIGTERM, interrupted)
    signal.signal(signal.SIGINT, interrupted)
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("action", choices=["init", "sync", "verify", "run", "status", "install"])
    parser.add_argument("--config", required=True, type=Path)
    args = parser.parse_args()
    config = None
    try:
        config = load_config(args.config)
        result = execute(args.action, config, args.config.resolve())
        code = 0
    except (ReplicaError, OSError, ValueError, KeyError, subprocess.SubprocessError) as error:
        result = {"status": "failed", "checkedAt": now(), "action": args.action,
                  "reason": error.code if isinstance(error, ReplicaError) else type(error).__name__}
        code = 1
    artifact = Path(__file__).resolve().parent / "artifact.json"
    if artifact.is_file() and not artifact.is_symlink():
        identity = json.loads(artifact.read_text())
        result["producer"] = {"sourceCommit": identity["gitSha"], "contentSha256": identity["sha256"]}
    else:
        result["producer"] = {"sourceState": "working-tree"}
    if config and args.action not in ("status", "install"):
        atomic_json(private_directory(config["stateDirectory"]) / "latest-operation.json", result)
    print(json.dumps(result, ensure_ascii=False))
    return code


if __name__ == "__main__":
    sys.exit(main())
