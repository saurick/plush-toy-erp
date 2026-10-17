"""备份来源、介质与运行配置；真实地址和恢复密钥留在仓库外。"""

import json
import os
from pathlib import Path
import plistlib
import re
import stat
import subprocess


class ReplicaError(Exception):
    def __init__(self, code):
        super().__init__(code)
        self.code = code


def require(condition, code):
    if not condition:
        raise ReplicaError(code)


def closed(value, fields, code):
    require(isinstance(value, dict) and set(value) == set(fields), code)


def private_file(file):
    file = Path(file)
    info = file.lstat()
    require(stat.S_ISREG(info.st_mode) and info.st_uid == os.getuid()
            and stat.S_IMODE(info.st_mode) in (0o400, 0o600), "unsafe_private_file")
    return file


def absolute(value):
    require(isinstance(value, str) and value.startswith("/") and "\x00" not in value
            and "\n" not in value and all(p not in (".", "..")
            for p in value.split("/")), "invalid_absolute_path")
    require(value != "/", "invalid_absolute_path")
    return Path(value)


def plain_directory(directory):
    directory = Path(directory)
    require(directory.is_dir() and directory.resolve() == directory,
            "unsafe_directory")
    return directory


def load_config(file):
    config = json.loads(private_file(file).read_text())
    closed(config, ["schemaVersion", "source", "destination", "stateDirectory",
                    "retentionDays", "maxSourceAgeHours", "transferTimeoutSeconds",
                    "restore", "schedule"], "invalid_config_fields")
    require(config["schemaVersion"] == "plush.backup-replica/v1", "invalid_schema")
    source = config["source"]
    closed(source, ["id", "transport", "host", "directory"], "invalid_source_fields")
    require(source["transport"] == "ssh-directory", "unsupported_transport")
    require(isinstance(source["host"], str)
            and re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9._-]{0,127}", source["host"])
            is not None, "invalid_ssh_alias")
    absolute(source["directory"])
    destination = config["destination"]
    closed(destination, ["id", "volumeUUID", "relativeDirectory"],
           "invalid_destination_fields")
    require(isinstance(destination["volumeUUID"], str)
            and re.fullmatch(r"[A-Fa-f0-9]{8}(?:-[A-Fa-f0-9]{4}){3}-[A-Fa-f0-9]{12}", destination["volumeUUID"])
            is not None, "invalid_volume_uuid")
    relative = destination["relativeDirectory"]
    require(isinstance(relative, str) and relative and not relative.startswith("/")
            and all(p not in ("", ".", "..") for p in relative.split("/"))
            and "\n" not in relative, "invalid_relative_directory")
    for identity in [source["id"], destination["id"]]:
        require(isinstance(identity, str) and re.fullmatch(r"[a-z0-9][a-z0-9._-]{2,63}",
                identity) is not None, "invalid_identity")
    absolute(config["stateDirectory"])
    for name, low, high in [("retentionDays", 35, 366),
                            ("maxSourceAgeHours", 1, 168),
                            ("transferTimeoutSeconds", 30, 3600)]:
        require(type(config[name]) is int and low <= config[name] <= high,
                "invalid_" + name)
    restore = config["restore"]
    closed(restore, ["identityFile", "postgresImage", "everyDays"],
           "invalid_restore_fields")
    absolute(restore["identityFile"])
    require(restore["postgresImage"] == "postgres:18.6", "unsupported_postgres_image")
    require(type(restore["everyDays"]) is int and 1 <= restore["everyDays"] <= 35,
            "invalid_restore_frequency")
    closed(config["schedule"], ["hour", "minute"], "invalid_schedule_fields")
    for name, maximum in [("hour", 23), ("minute", 59)]:
        require(type(config["schedule"][name]) is int
                and 0 <= config["schedule"][name] <= maximum, "invalid_schedule")
    return config


def resolve_volume(config, runner=subprocess.run):
    uuid = config["destination"]["volumeUUID"]
    process = runner(["/usr/sbin/diskutil", "info", "-plist", uuid],
                     capture_output=True, timeout=15)
    if process.returncode:
        raise ReplicaError("volume_not_mounted")
    info = plistlib.loads(process.stdout)
    require(str(info.get("VolumeUUID", "")).upper() == uuid.upper(),
            "volume_identity_mismatch")
    require(info.get("Internal") is False and info.get("Writable") is True,
            "volume_not_external_writable")
    mount = info.get("MountPoint")
    require(isinstance(mount, str) and mount.startswith("/Volumes/"),
            "volume_not_mounted")
    mount = plain_directory(mount)
    require(os.path.ismount(mount), "volume_not_mounted")
    return mount
