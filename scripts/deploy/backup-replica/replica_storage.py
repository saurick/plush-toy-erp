"""介质身份、原子落盘与本机运行互斥。"""

from contextlib import contextmanager
from datetime import datetime, timezone
import fcntl
import hashlib
import json
import os
from pathlib import Path
import stat
import uuid

from replica_config import plain_directory, require


MARKER = ".plush-backup-replica.json"


def digest(file):
    result = hashlib.sha256()
    with Path(file).open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            result.update(block)
    return result.hexdigest()


def atomic_bytes(file, content):
    file = Path(file)
    require(not file.is_symlink(), "unsafe_output_file")
    temporary = file.with_name("." + file.name + "." + uuid.uuid4().hex)
    try:
        with open(temporary, "xb", opener=lambda p, flags: os.open(p, flags, 0o600)) as out:
            out.write(content)
            out.flush()
            os.fsync(out.fileno())
        os.replace(temporary, file)
    finally:
        temporary.unlink(missing_ok=True)


def atomic_json(file, value):
    atomic_bytes(file, (json.dumps(value, ensure_ascii=False, indent=2) + "\n").encode())


def private_directory(directory):
    directory = Path(directory)
    # Check existing parents before creating any child through them.
    for parent in [directory, *directory.parents]:
        require(not parent.is_symlink(), "unsafe_directory")
    directory.mkdir(parents=True, exist_ok=True, mode=0o700)
    plain_directory(directory)
    require(directory.stat().st_uid == os.getuid(), "foreign_directory_owner")
    directory.chmod(0o700)
    return directory


def destination(config, mount, initialize=False):
    root = Path(mount) / config["destination"]["relativeDirectory"]
    require(root.is_relative_to(mount), "destination_escapes_volume")
    for parent in [root, *list(root.parents)[:len(root.parts) - len(Path(mount).parts)]]:
        require(not parent.is_symlink(), "unsafe_directory")
    expected = {"schemaVersion": "plush.backup-replica-target/v1",
                "destinationId": config["destination"]["id"],
                "sourceId": config["source"]["id"]}
    marker = root / MARKER
    if initialize and not marker.exists():
        require(not root.exists() or not any(root.iterdir()),
                "unowned_destination_not_empty")
        private_directory(root)
        atomic_json(marker, expected)
    plain_directory(root)
    require(marker.is_file() and not marker.is_symlink()
            and marker.stat().st_uid == os.getuid(), "destination_marker_missing")
    require(json.loads(marker.read_text()) == expected, "destination_marker_mismatch")
    require(stat.S_IMODE(root.stat().st_mode) == 0o700,
            "destination_permissions_mismatch")
    return root


@contextmanager
def exclusive(state):
    state = private_directory(state)
    lock = state / "replica.lock"
    require(not lock.is_symlink(), "unsafe_lock")
    descriptor = os.open(lock, os.O_CREAT | os.O_RDWR | os.O_NOFOLLOW, 0o600)
    try:
        require(os.fstat(descriptor).st_uid == os.getuid(), "foreign_lock_owner")
        try:
            fcntl.flock(descriptor, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            require(False, "replica_already_running")
        yield state
    finally:
        os.close(descriptor)


def now():
    return datetime.now(timezone.utc).isoformat()
