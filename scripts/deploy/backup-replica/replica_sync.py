"""复用不可变加密文件，独立保留历史，不传播来源删除。"""

from datetime import datetime, timedelta, timezone
import json
import os
import shutil
import uuid

from replica_config import require
from replica_storage import atomic_bytes, atomic_json, digest, now
from replica_transport import DATABASE_FILE, ENCRYPTED_FILE, validate_inventory


def backup_time(name):
    match = DATABASE_FILE.fullmatch(name)
    require(match is not None, "invalid_backup_name")
    return datetime.strptime(match[1], "%Y%m%dT%H%M%SZ").replace(tzinfo=timezone.utc)


def read_index(root, source_id):
    file = root / "replica-index.json"
    if not file.exists():
        return {}
    require(file.is_file() and not file.is_symlink(), "unsafe_replica_index")
    value = json.loads(file.read_text())
    require(value.get("schemaVersion") == "plush.backup-replica-index/v1"
            and value.get("sourceId") == source_id
            and isinstance(value.get("files"), dict), "invalid_replica_index")
    for name, item in value["files"].items():
        require(ENCRYPTED_FILE.fullmatch(name) and isinstance(item, dict)
                and item.get("name") == name, "invalid_replica_index")
    return value["files"]


def verified_file(root, item):
    file = root / item["name"]
    require(file.is_file() and not file.is_symlink(), "unsafe_replica_file")
    require(file.stat().st_size == item["sizeBytes"]
            and digest(file) == item["sha256"], "replica_checksum_mismatch")
    return file


def synchronize(config, root, source, clock=None):
    clock = clock or datetime.now(timezone.utc)
    inventory = source.inventory()
    validate_inventory(inventory, config["source"]["id"])
    database = [item for item in inventory["files"] if DATABASE_FILE.fullmatch(item["name"])]
    require(database, "source_has_no_database_backup")
    latest = max(database, key=lambda item: backup_time(item["name"]))
    age = (clock - backup_time(latest["name"])).total_seconds()
    require(0 <= age <= config["maxSourceAgeHours"] * 3600, "source_backup_stale")
    records = read_index(root, config["source"]["id"])
    required_space = sum(item["sizeBytes"] for item in inventory["files"]
                         if not (root / item["name"]).exists())
    require(shutil.disk_usage(root).free >= required_space + 64 * 1024**2,
            "destination_space_insufficient")
    copied = 0
    for item in inventory["files"]:
        file = root / item["name"]
        require(not file.is_symlink(), "unsafe_replica_file")
        if not file.exists():
            temporary = root / (".incoming-" + uuid.uuid4().hex)
            try:
                source.download(item, temporary)
                temporary.chmod(0o600)
                require(temporary.stat().st_size == item["sizeBytes"]
                        and digest(temporary) == item["sha256"], "transfer_checksum_mismatch")
                require(not file.exists(), "replica_file_appeared")
                # link creates the immutable final name without overwriting a racing file.
                os.link(temporary, file)
                copied += 1
            finally:
                temporary.unlink(missing_ok=True)
        verified_file(root, item)
        checksum = (item["name"].replace(".dump.age", ".sha256")
                    if DATABASE_FILE.fullmatch(item["name"]) else item["name"] + ".sha256")
        atomic_bytes(root / checksum, (item["sha256"] + "  " + item["name"] + "\n").encode())
        records[item["name"]] = {**item, "copiedAt": records.get(item["name"], {}).get("copiedAt", now())}
    # Source expiry never deletes the replica. Only its own retention window can do so.
    cutoff = clock - timedelta(days=config["retentionDays"])
    expired = [name for name in records if DATABASE_FILE.fullmatch(name)
               and name != latest["name"] and backup_time(name) < cutoff]
    for name in expired:
        checksum = root / name.replace(".dump.age", ".sha256")
        require(not checksum.is_symlink(), "unsafe_checksum_file")
        file = root / name
        require(not file.is_symlink(), "unsafe_replica_file")
        if file.exists():
            verified_file(root, records[name]).unlink()
        checksum.unlink(missing_ok=True)
        del records[name]
    atomic_json(root / "replica-index.json", {
        "schemaVersion": "plush.backup-replica-index/v1",
        "sourceId": config["source"]["id"], "updatedAt": now(), "files": records,
    })
    return {"status": "passed", "checkedAt": now(), "sourceId": config["source"]["id"],
            "destinationId": config["destination"]["id"], "copiedFiles": copied,
            "volumeUUID": config["destination"]["volumeUUID"],
            "verifiedSourceFiles": len(inventory["files"]), "retainedFiles": len(records),
            "expiredFiles": len(expired), "latestBackup": latest["name"],
            "sourceBackupAgeSeconds": int(age), "encryption": "age",
            "sourceDeletionPropagated": False}
