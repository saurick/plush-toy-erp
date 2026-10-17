"""固定 SSH 只读协议；来源主机及目录只由私有配置选择。"""

import json
import os
from pathlib import Path
import re
import subprocess

from replica_config import ReplicaError, require


DATABASE_FILE = re.compile(r"plush_erp-([0-9]{8}T[0-9]{6}Z)-[0-9]+\.dump\.age")
ENCRYPTED_FILE = re.compile(r"[A-Za-z0-9][A-Za-z0-9._-]{0,179}\.age")
REMOTE_COMMON = '''import hashlib,json,os,stat,sys
from pathlib import Path
root=Path(request['directory'])
assert root.is_absolute() and root.resolve()==root and root.is_dir()
marker=root/'.plush-backup-source.json'
assert marker.is_file() and not marker.is_symlink()
identity=json.loads(marker.read_text())
assert identity=={'schemaVersion':'plush.backup-source/v1','sourceId':request['sourceId']}
def safe(name):
    assert '/' not in name and name not in ('.','..')
    p=root/name
    assert p.is_file() and not p.is_symlink()
    return p
'''

REMOTE_INVENTORY = '''import re
files=[]
for p in sorted(root.iterdir()):
    if not re.fullmatch(r'[A-Za-z0-9][A-Za-z0-9._-]{0,179}\\.age',p.name): continue
    p=safe(p.name)
    if p.name.endswith('.dump.age'):
        assert re.fullmatch(r'plush_erp-[0-9]{8}T[0-9]{6}Z-[0-9]+\\.dump\\.age',p.name)
        checksum=root/p.name.replace('.dump.age','.sha256')
        if not checksum.exists(): continue
        checksum=safe(checksum.name)
        parts=checksum.read_text().split()
        assert len(parts)==2 and re.fullmatch(r'[a-f0-9]{64}',parts[0])
        assert parts[1].lstrip('*')==p.name
        expected=parts[0]
    else:
        with p.open('rb') as f: expected=hashlib.file_digest(f,'sha256').hexdigest()
    s=p.stat()
    files.append({'name':p.name,'sizeBytes':s.st_size,'sha256':expected,
                  'inode':s.st_ino,'mtimeNs':s.st_mtime_ns})
assert len(files)<=2000
print(json.dumps({'schemaVersion':'plush.backup-inventory/v1',
                 'sourceId':request['sourceId'],'files':files}))
'''

REMOTE_DOWNLOAD = '''item=request['file']
p=safe(item['name'])
with p.open('rb') as f:
    s=os.fstat(f.fileno())
    assert (s.st_size,s.st_ino,s.st_mtime_ns)==(item['sizeBytes'],item['inode'],item['mtimeNs'])
    remaining=item['sizeBytes']
    while remaining:
        block=f.read(min(1024*1024,remaining))
        assert block
        sys.stdout.buffer.write(block)
        remaining-=len(block)
    assert not f.read(1)
    after=os.fstat(f.fileno())
    assert (s.st_ino,s.st_size,s.st_mtime_ns)==(after.st_ino,after.st_size,after.st_mtime_ns)
'''


class SSHSource:
    def __init__(self, config):
        self.source = config["source"]
        self.timeout = config["transferTimeoutSeconds"]

    def command(self):
        return ["ssh", "-oBatchMode=yes", "-oStrictHostKeyChecking=yes",
                "-oConnectTimeout=10", "-oServerAliveInterval=15",
                "-oServerAliveCountMax=2", "--", self.source["host"], "python3 -"]

    def script(self, body, item=None):
        request = {"directory": self.source["directory"],
                   "sourceId": self.source["id"]}
        if item is not None:
            request["file"] = item
        return ("request=" + repr(request) + "\n" + REMOTE_COMMON + body).encode()

    def inventory(self):
        try:
            result = subprocess.run(self.command(), input=self.script(REMOTE_INVENTORY),
                                    capture_output=True, timeout=self.timeout, check=True)
            require(len(result.stdout) < 2 * 1024 * 1024, "inventory_too_large")
            value = json.loads(result.stdout)
        except (subprocess.SubprocessError, ValueError) as error:
            raise ReplicaError("source_inventory_failed") from error
        validate_inventory(value, self.source["id"])
        return value

    def download(self, item, output):
        try:
            with Path(output).open("xb") as stream:
                subprocess.run(self.command(), input=self.script(REMOTE_DOWNLOAD, item),
                               stdout=stream, stderr=subprocess.PIPE,
                               timeout=self.timeout, check=True)
                stream.flush()
                os.fsync(stream.fileno())
        except subprocess.SubprocessError as error:
            raise ReplicaError("source_transfer_failed") from error


def validate_inventory(value, source_id):
    require(isinstance(value, dict) and value.get("sourceId") == source_id
            and value.get("schemaVersion") == "plush.backup-inventory/v1",
            "inventory_identity_mismatch")
    files = value.get("files")
    require(isinstance(files, list) and 0 < len(files) <= 2000, "invalid_inventory")
    names = set()
    for item in files:
        require(isinstance(item, dict) and isinstance(item.get("name"), str)
                and ENCRYPTED_FILE.fullmatch(item["name"])
                and item["name"] not in names, "unsafe_inventory_name")
        require(isinstance(item.get("sha256"), str)
                and re.fullmatch(r"[a-f0-9]{64}", item["sha256"]) is not None
                and type(item.get("sizeBytes")) is int
                and 0 < item["sizeBytes"] <= 1024**4, "invalid_inventory_digest")
        require(type(item.get("inode")) is int and type(item.get("mtimeNs")) is int,
                "invalid_inventory_stat")
        require(not item["name"].endswith(".dump.age")
                or DATABASE_FILE.fullmatch(item["name"]), "invalid_backup_name")
        names.add(item["name"])
