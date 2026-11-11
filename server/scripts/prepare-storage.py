"""Migrate the legacy volume root before the API starts; atomic moves can resume after interruption."""
import json, os, pwd, shutil, stat
from pathlib import Path
root=Path('/app/private-material-storage');data=root/'data';journal=root/'.storage-migration.json';temporary=root/'.storage-migration.tmp'
if os.environ.get('MATERIAL_STORAGE_ROOT',str(data))!=str(data):raise RuntimeError('unsupported_container_storage_path')
root.mkdir(parents=True,exist_ok=True)
if root.is_symlink() or data.is_symlink():raise RuntimeError('unsafe_storage_path')
legacy=[p.name for p in root.iterdir() if p.name not in ['data',journal.name,temporary.name]]
if journal.exists():
    if journal.is_symlink():raise RuntimeError('unsafe_storage_path')
    names=json.loads(journal.read_text())['names']
else:
    names=legacy
    if names and data.exists() and any(data.iterdir()):raise RuntimeError('mixed_storage_layout_requires_review')
    if names:
        if temporary.is_symlink():raise RuntimeError('unsafe_storage_path')
        if temporary.exists():
            if not temporary.is_file():raise RuntimeError('unsafe_storage_path')
            temporary.unlink()
        fd=os.open(temporary,os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,0o600)
        with os.fdopen(fd,'w') as output:json.dump({'names':names},output)
        os.replace(temporary,journal)
if any(not isinstance(n,str) or not n or Path(n).name!=n or n in ['.','..','data',journal.name,temporary.name] for n in names):raise RuntimeError('invalid_storage_journal')
data.mkdir(exist_ok=True,mode=0o700)
for name in names:
    old=root/name;new=data/name
    if old.is_symlink() or new.is_symlink():raise RuntimeError('unsafe_storage_path')
    if old.exists() and new.exists():raise RuntimeError('storage_migration_conflict')
    if old.exists():os.rename(old,new)
    elif not new.exists():raise RuntimeError('storage_migration_missing_file')
user=pwd.getpwnam('node')
for folder,dirs,files in os.walk(data,followlinks=False):
    for path in [Path(folder),*[Path(folder)/n for n in files]]:
        if path.is_symlink() or not (path.is_file() or path.is_dir()):raise RuntimeError('unsafe_storage_path')
        if path.stat().st_uid!=user.pw_uid:os.chown(path,user.pw_uid,user.pw_gid)
    if any((Path(folder)/n).is_symlink() for n in dirs):raise RuntimeError('unsafe_storage_path')
# A single API owns this volume; discard interrupted scratch copies before resuming jobs.
work=data/'extraction-work'
if work.is_dir():
    for job in work.iterdir():
        if job.name.startswith('job-') and job.is_dir():shutil.rmtree(job)
os.chown(root,user.pw_uid,user.pw_gid);journal.unlink(missing_ok=True);temporary.unlink(missing_ok=True)
print('Private storage layout ready; legacy entries migrated:',len(names))
