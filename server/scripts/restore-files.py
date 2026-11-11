"""Restore only regular private files into an empty target volume."""
import os, sys, tarfile
from pathlib import Path
root=Path('/app/private-material-storage').resolve()
if any(p.is_symlink() or p.name!='data' or not p.is_dir() or any(p.iterdir()) for p in root.iterdir()):raise RuntimeError('target_material_storage_not_empty')
with tarfile.open(fileobj=sys.stdin.buffer,mode='r|') as archive:
    for member in archive:
        parts=Path(member.name).parts
        if not parts and member.isdir():continue
        if not parts or '..' in parts or Path(member.name).is_absolute() or not (member.isdir() or member.isfile()):raise RuntimeError('unsafe_backup_path')
        target=root.joinpath(*parts)
        if not target.resolve().is_relative_to(root) or any(p.is_symlink() for p in [target,*target.parents] if p!=root.parent):raise RuntimeError('unsafe_backup_path')
        if member.isdir():target.mkdir(parents=True,exist_ok=True,mode=0o700)
        else:
            target.parent.mkdir(parents=True,exist_ok=True,mode=0o700)
            with archive.extractfile(member) as source, target.open('xb') as output:
                while chunk:=source.read(1024*1024):output.write(chunk)
            target.chmod(0o600)
print('Private files restored',file=sys.stderr)
