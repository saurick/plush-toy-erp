"""文件损坏、来源变动、介质身份和恢复清理的隔离合同测试。"""

import copy
from datetime import datetime, timezone
import json
import os
from pathlib import Path
import plistlib
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch

import backup_replica
from replica_config import ReplicaError, load_config, resolve_volume
from replica_restore import verify_restore
from replica_storage import atomic_json, destination, digest, exclusive
from replica_sync import synchronize
from replica_transport import REMOTE_DOWNLOAD, REMOTE_INVENTORY, SSHSource, validate_inventory


class Fixture(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name).resolve()
        example = Path(__file__).resolve().parents[3] / "deployments/yoyoosun/env/backup-replica.example.json"
        self.config = json.loads(example.read_text())
        self.config["source"]["directory"] = str(self.root / "source")
        self.config["stateDirectory"] = str(self.root / "state")
        self.config["restore"]["identityFile"] = str(self.root / "identity.txt")
        (self.root / "identity.txt").write_text("fixture identity")
        (self.root / "identity.txt").chmod(0o600)
        self.config_file = self.root / "config.json"
        self.save_config()
        self.mount = self.root / "mount"
        self.mount.mkdir()
        self.destination = destination(self.config, self.mount, initialize=True)
        self.source = self.root / "source"
        self.source.mkdir()
        atomic_json(self.source / ".plush-backup-source.json", {
            "schemaVersion": "plush.backup-source/v1", "sourceId": self.config["source"]["id"]})
        self.name = "plush_erp-20261017T100000Z-42.dump.age"
        self.add_backup(self.name)
        self.clock = datetime(2026, 10, 17, 11, tzinfo=timezone.utc)

    def save_config(self):
        atomic_json(self.config_file, self.config)

    def add_backup(self, name):
        file = self.source / name
        file.write_bytes(b"encrypted fixture for " + name.encode())
        file.with_name(name.replace(".dump.age", ".sha256")).write_text(digest(file) + "  " + name + "\n")

    def remote(self, script):
        return subprocess.run([sys.executable, "-B", "-"], input=script,
                              capture_output=True, timeout=10)

    def inventory(self):
        result = self.remote(SSHSource(self.config).script(REMOTE_INVENTORY))
        self.assertEqual(result.returncode, 0, result.stderr.decode())
        return json.loads(result.stdout)

    def transport(self):
        owner = self

        class LocalSource:
            def inventory(self):
                return owner.inventory()

            def download(self, item, output):
                script = SSHSource(owner.config).script(REMOTE_DOWNLOAD, item)
                result = owner.remote(script)
                owner.assertEqual(result.returncode, 0, result.stderr.decode())
                Path(output).write_bytes(result.stdout)

        return LocalSource()

    def sync(self):
        return synchronize(self.config, self.destination, self.transport(), self.clock)

    def test_private_config_and_closed_fields(self):
        self.assertEqual(load_config(self.config_file), self.config)
        self.config["password"] = "must not be accepted"
        self.save_config()
        with self.assertRaisesRegex(ReplicaError, "invalid_config_fields"):
            load_config(self.config_file)

    def test_config_permissions(self):
        self.config_file.chmod(0o644)
        with self.assertRaisesRegex(ReplicaError, "unsafe_private_file"):
            load_config(self.config_file)

    def test_ssh_alias_cannot_inject_options(self):
        for host in ["-oProxyCommand=bad", "host;bad", "host name", 123]:
            self.config["source"]["host"] = host
            self.save_config()
            with self.assertRaises(ReplicaError):
                load_config(self.config_file)

    def test_destination_cannot_escape_volume(self):
        self.config["destination"]["relativeDirectory"] = "../outside"
        self.save_config()
        with self.assertRaisesRegex(ReplicaError, "invalid_relative_directory"):
            load_config(self.config_file)

    def test_missing_volume_never_creates_destination(self):
        fake = subprocess.CompletedProcess([], 1, b"", b"")
        with self.assertRaisesRegex(ReplicaError, "volume_not_mounted"):
            resolve_volume(self.config, lambda *args, **kwargs: fake)

    def test_internal_volume_is_rejected(self):
        info = {"VolumeUUID": self.config["destination"]["volumeUUID"], "Internal": True,
                "Writable": True, "MountPoint": "/Volumes/fake"}
        fake = subprocess.CompletedProcess([], 0, plistlib.dumps(info), b"")
        with self.assertRaisesRegex(ReplicaError, "volume_not_external_writable"):
            resolve_volume(self.config, lambda *args, **kwargs: fake)

    def test_wrong_volume_uuid_is_rejected(self):
        info = {"VolumeUUID": "ffffffff-ffff-ffff-ffff-ffffffffffff"}
        fake = subprocess.CompletedProcess([], 0, plistlib.dumps(info), b"")
        with self.assertRaisesRegex(ReplicaError, "volume_identity_mismatch"):
            resolve_volume(self.config, lambda *args, **kwargs: fake)

    def test_unknown_nonempty_target_is_preserved(self):
        other = copy.deepcopy(self.config)
        other["destination"]["relativeDirectory"] = "personal-data"
        p = self.mount / "personal-data"
        p.mkdir()
        (p / "keep.txt").write_text("unique")
        with self.assertRaisesRegex(ReplicaError, "unowned_destination_not_empty"):
            destination(other, self.mount, initialize=True)
        self.assertEqual((p / "keep.txt").read_text(), "unique")

    def test_target_symlink_is_preserved_and_rejected(self):
        other = copy.deepcopy(self.config)
        other["destination"]["relativeDirectory"] = "shortcut"
        (self.mount / "shortcut").symlink_to(self.source, target_is_directory=True)
        with self.assertRaisesRegex(ReplicaError, "unsafe_directory"):
            destination(other, self.mount, initialize=True)

    def test_destination_marker_source_must_match(self):
        other = copy.deepcopy(self.config)
        other["source"]["id"] = "another-source"
        with self.assertRaisesRegex(ReplicaError, "destination_marker_mismatch"):
            destination(other, self.mount)

    def test_kernel_lock_releases_after_error(self):
        with self.assertRaises(ValueError):
            with exclusive(self.root / "state"):
                raise ValueError("simulate interruption")
        with exclusive(self.root / "state"):
            with self.assertRaisesRegex(ReplicaError, "replica_already_running"):
                with exclusive(self.root / "state"):
                    pass

    def test_inventory_requires_source_identity(self):
        value = self.inventory()
        value["sourceId"] = "wrong"
        with self.assertRaisesRegex(ReplicaError, "inventory_identity_mismatch"):
            validate_inventory(value, self.config["source"]["id"])

    def test_inventory_rejects_duplicate_and_traversal_names(self):
        for unsafe in ["../secret.age", "/secret.age", "file.dump", 42]:
            value = self.inventory()
            value["files"][0]["name"] = unsafe
            with self.assertRaises(ReplicaError):
                validate_inventory(value, self.config["source"]["id"])
        value = self.inventory()
        value["files"].append(value["files"][0])
        with self.assertRaises(ReplicaError):
            validate_inventory(value, self.config["source"]["id"])

    def test_remote_inventory_ignores_incomplete_pair(self):
        (self.source / "plush_erp-20261017T100100Z-43.dump.age").write_bytes(b"in flight")
        self.assertEqual(len(self.inventory()["files"]), 1)

    def test_remote_rejects_symlink_and_wrong_checksum_name(self):
        checksum = self.source / self.name.replace(".dump.age", ".sha256")
        checksum.write_text("a" * 64 + "  ../../file\n")
        self.assertNotEqual(self.remote(SSHSource(self.config).script(REMOTE_INVENTORY)).returncode, 0)
        checksum.unlink()
        checksum.symlink_to(self.root / "identity.txt")
        self.assertNotEqual(self.remote(SSHSource(self.config).script(REMOTE_INVENTORY)).returncode, 0)

    def test_remote_download_detects_changed_source(self):
        item = self.inventory()["files"][0]
        (self.source / self.name).write_bytes(b"changed")
        self.assertNotEqual(self.remote(SSHSource(self.config).script(REMOTE_DOWNLOAD, item)).returncode, 0)

    def test_sync_replay_is_idempotent(self):
        first = self.sync()
        second = self.sync()
        self.assertEqual(first["copiedFiles"], 1)
        self.assertEqual(second["copiedFiles"], 0)
        self.assertEqual(digest(self.destination / self.name), digest(self.source / self.name))

    def test_source_deletion_is_not_propagated(self):
        old = "plush_erp-20261016T100000Z-41.dump.age"
        self.add_backup(old)
        self.sync()
        (self.source / old).unlink()
        (self.source / old.replace(".dump.age", ".sha256")).unlink()
        result = self.sync()
        self.assertEqual(result["retainedFiles"], 2)
        self.assertTrue((self.destination / old).is_file())

    def test_retention_only_expires_owned_database_files(self):
        old = "plush_erp-20260101T100000Z-40.dump.age"
        self.add_backup(old)
        personal = self.destination / "personal.txt"
        personal.write_text("keep")
        result = self.sync()
        self.assertEqual(result["expiredFiles"], 1)
        self.assertFalse((self.destination / old).exists())
        self.assertEqual(personal.read_text(), "keep")
        self.assertEqual(self.sync()["retainedFiles"], 1)

    def test_corrupt_transfer_never_commits(self):
        source = self.transport()
        source.download = lambda item, output: Path(output).write_bytes(b"corrupt")
        with self.assertRaisesRegex(ReplicaError, "transfer_checksum_mismatch"):
            synchronize(self.config, self.destination, source, self.clock)
        self.assertFalse((self.destination / self.name).exists())
        self.assertFalse(list(self.destination.glob(".incoming-*")))

    def test_existing_corrupt_file_is_not_overwritten(self):
        self.sync()
        file = self.destination / self.name
        file.write_bytes(b"unique corrupt data")
        with self.assertRaisesRegex(ReplicaError, "replica_checksum_mismatch"):
            self.sync()
        self.assertEqual(file.read_bytes(), b"unique corrupt data")

    def test_stale_source_is_not_success(self):
        self.clock = datetime(2026, 10, 20, 11, tzinfo=timezone.utc)
        with self.assertRaisesRegex(ReplicaError, "source_backup_stale"):
            self.sync()

    def test_missing_volume_run_is_observable_skip(self):
        with patch.object(backup_replica, "resolve_volume", side_effect=ReplicaError("volume_not_mounted")):
            result = backup_replica.execute("run", self.config, self.config_file)
        self.assertEqual(result["status"], "skipped")
        self.assertEqual(result["reason"], "volume_not_mounted")
        self.assertFalse((self.root / "state/latest-sync.json").exists())

    def run_with_recent_restore(self, volume_uuid):
        state = self.root / "state"
        state.mkdir(exist_ok=True)
        atomic_json(state / "latest-restore.json", {
            "status": "passed", "sourceId": self.config["source"]["id"],
            "destinationId": self.config["destination"]["id"], "volumeUUID": volume_uuid,
            "checkedAt": datetime.now(timezone.utc).isoformat(),
        })
        with patch.object(backup_replica, "resolve_volume", return_value=self.mount):
            with patch.object(backup_replica, "synchronize", return_value={"status": "passed"}):
                with patch("replica_restore.verify_restore", return_value={"status": "passed"}) as verify:
                    result = backup_replica.execute("run", self.config, self.config_file)
        return result, verify

    def test_new_volume_cannot_reuse_previous_restore_proof(self):
        result, verify = self.run_with_recent_restore("ffffffff-ffff-ffff-ffff-ffffffffffff")
        verify.assert_called_once()
        self.assertEqual(result["restore"]["status"], "passed")

    def test_current_recent_restore_does_not_repeat_heavy_check(self):
        result, verify = self.run_with_recent_restore(self.config["destination"]["volumeUUID"])
        verify.assert_not_called()
        self.assertEqual(result["restore"]["status"], "not_due")

    def test_restore_failure_cleans_plaintext_and_container(self):
        self.sync()
        # The fixture timestamp follows the real clock for freshness checks.
        with patch("replica_restore.datetime") as clock:
            clock.now.return_value = self.clock
            with patch("replica_restore.shutil.which", return_value="/bin/tool"):
                calls = []

                def fake(args, **kwargs):
                    calls.append(args)
                    if args[0] == "age":
                        Path(args[args.index("--output") + 1]).write_bytes(b"decrypted")
                    if "pg_restore" in args:
                        raise ReplicaError("restore_command_failed")
                    data = b"container\n" if args[1:3] == ["ps", "-aq"] and not any("rm" in a for a in calls) else b""
                    return subprocess.CompletedProcess(args, 0, data, b"")

                state = self.root / "state"
                state.mkdir(exist_ok=True)
                with patch("replica_restore.command", side_effect=fake):
                    with patch("replica_restore.subprocess.run", return_value=subprocess.CompletedProcess([], 0)):
                        with self.assertRaisesRegex(ReplicaError, "restore_command_failed"):
                            verify_restore(self.config, self.destination, state)
                self.assertFalse(list((state / "restore-tmp").iterdir()))
                self.assertTrue(any(args[1:3] == ["rm", "--force"] for args in calls))
                self.assertFalse((state / "latest-restore.json").exists())


if __name__ == "__main__":
    unittest.main()
