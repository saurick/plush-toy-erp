"""从副本解密并恢复到无网络的一次性 PostgreSQL，始终清理临时明文。"""

from datetime import datetime, timezone
import json
from pathlib import Path
import secrets
import shutil
import subprocess
import tempfile
import time

from replica_config import ReplicaError, private_file, require
from replica_storage import atomic_bytes, atomic_json, digest, now, private_directory
from replica_sync import backup_time, read_index, verified_file
from replica_transport import DATABASE_FILE


def command(args, **kwargs):
    try:
        return subprocess.run(args, check=True, capture_output=True, timeout=120, **kwargs)
    except subprocess.SubprocessError as error:
        if args[0] == "age":
            stage = "decrypt"
        elif "pg_restore" in args:
            stage = "database_import"
        elif "psql" in args:
            stage = "database_readback"
        else:
            stage = "container_" + args[1]
        raise ReplicaError("restore_" + stage + "_failed") from error


def verify_restore(config, root, state):
    identity = private_file(config["restore"]["identityFile"])
    require(shutil.which("age") is not None and shutil.which("docker") is not None,
            "restore_tool_missing")
    records = read_index(root, config["source"]["id"])
    backups = [name for name in records if DATABASE_FILE.fullmatch(name)]
    require(backups, "replica_has_no_database_backup")
    name = max(backups, key=backup_time)
    age = (datetime.now(timezone.utc) - backup_time(name)).total_seconds()
    require(0 <= age <= config["maxSourceAgeHours"] * 3600, "replica_backup_stale")
    encrypted = verified_file(root, records[name])
    image = config["restore"]["postgresImage"]
    image_id = command(["docker", "image", "inspect", image, "--format", "{{.Id}}"])
    private_directory(state / "restore-tmp")
    temporary = Path(tempfile.mkdtemp(prefix="verify-", dir=state / "restore-tmp"))
    container = "plush-replica-restore-" + secrets.token_hex(8)
    began = time.monotonic()
    try:
        decrypted = temporary / "database.dump"
        command(["age", "--decrypt", "--identity", str(identity), "--output", str(decrypted),
                 str(encrypted)])
        decrypted.chmod(0o600)
        require(decrypted.stat().st_size > 0, "empty_decrypted_backup")
        environment = temporary / "postgres.env"
        atomic_bytes(environment, ("POSTGRES_PASSWORD=" + secrets.token_urlsafe(24)
                                  + "\nPOSTGRES_DB=plush_replica_restore\n").encode())
        command(["docker", "run", "--detach", "--rm", "--pull", "never", "--name", container,
                 "--network", "none", "--memory", "1g", "--cpus", "1", "--pids-limit", "256",
                 "--label", "plush.backup-replica-source=" + config["source"]["id"],
                 "--env-file", str(environment), "--volume", str(decrypted) + ":/backup/database.dump:ro",
                 image])
        for attempt in range(40):
            # The image uses a temporary server during initdb. PID 1 becomes
            # postgres only after that server has stopped and initialization ends.
            ready = subprocess.run([
                "docker", "exec", container, "sh", "-ceu",
                'test "$(cat /proc/1/comm)" = postgres && '
                'exec pg_isready -U postgres -d plush_replica_restore',
            ], capture_output=True, timeout=5)
            if ready.returncode == 0:
                break
            require(attempt < 39, "restore_postgres_not_ready")
            time.sleep(0.5)
        command(["docker", "exec", container, "pg_restore", "--username", "postgres",
                 "--dbname", "plush_replica_restore", "--no-owner", "--no-acl",
                 "--exit-on-error", "/backup/database.dump"])
        query = """SELECT json_build_object(
'publicTableCount',(SELECT count(*) FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE'),
'migrationCount',(SELECT count(*) FROM atlas_schema_revisions.atlas_schema_revisions WHERE type=2),
'migrationVersion',(SELECT max(version) FROM atlas_schema_revisions.atlas_schema_revisions WHERE type=2))::text"""
        output = command(["docker", "exec", container, "psql", "-XAtq", "-v", "ON_ERROR_STOP=1",
                          "-U", "postgres", "-d", "plush_replica_restore", "-c", query])
        readback = json.loads(output.stdout)
        require(readback["publicTableCount"] > 0 and readback["migrationCount"] > 0,
                "restored_database_empty")
        version = readback["migrationVersion"]
        require(isinstance(version, str) and len(version) == 14 and version.isdigit(),
                "restored_migration_unknown")
        result = {"schemaVersion": "plush.backup-replica-restore/v1", "status": "passed",
                  "checkedAt": now(), "sourceId": config["source"]["id"],
                  "destinationId": config["destination"]["id"], "backupFile": name,
                  "volumeUUID": config["destination"]["volumeUUID"],
                  "encryptedSha256": digest(encrypted), "decryptedSha256": digest(decrypted),
                  "decryptedSizeBytes": decrypted.stat().st_size, "postgresImage": image,
                  "postgresImageId": image_id.stdout.decode().strip(), **readback,
                  "restoreDurationSeconds": round(time.monotonic() - began, 2),
                  "scope": "PostgreSQL; attachment objects require their paired restore procedure",
                  "productionDatabaseWrites": False}
    finally:
        try:
            remaining = command(["docker", "ps", "-aq", "--filter", "name=^/" + container + "$"])
            if remaining.stdout.strip():
                command(["docker", "rm", "--force", container])
            remaining = command(["docker", "ps", "-aq", "--filter", "name=^/" + container + "$"])
            require(not remaining.stdout.strip(), "restore_container_cleanup_failed")
        finally:
            shutil.rmtree(temporary)
    # Receipt follows successful cleanup, never an optimistic pre-cleanup claim.
    result["cleanup"] = "temporary-container-and-plaintext-removed"
    atomic_json(state / "latest-restore.json", result)
    return result
