"""Prepare JDK and Android CLI in writable cloud paths, verifying official checksums."""
import hashlib
import os
from pathlib import Path
import shutil
import stat
import tarfile
import tempfile
import urllib.request
import xml.etree.ElementTree as ET
import zipfile


def download(url, target):
    with urllib.request.urlopen(url) as response, open(target, 'wb') as output:
        shutil.copyfileobj(response, output)


with tempfile.TemporaryDirectory(prefix='mi-balance-') as tmp:
    tmp = Path(tmp)
    jdk = Path('/workspace/jdk-21')
    if not (jdk / 'bin/javac').exists():
        url = 'https://download.oracle.com/java/21/latest/jdk-21_linux-x64_bin.tar.gz'
        with urllib.request.urlopen(url + '.sha256') as response:
            expected = response.read().decode().strip().split()[0]
        archive = tmp / 'jdk.tar.gz'
        download(url, archive)
        assert hashlib.sha256(archive.read_bytes()).hexdigest() == expected, 'JDK checksum mismatch'
        with tarfile.open(archive) as package:
            root = package.getmembers()[0].name.split('/')[0]
            package.extractall('/workspace/java', filter='data')
        jdk.symlink_to(Path('/workspace/java') / root)
    tools = Path('/workspace/android-sdk/cmdline-tools/19.0')
    if not (tools / 'bin/sdkmanager').exists():
        catalog = tmp / 'repository.xml'
        download('https://dl.google.com/android/repository/repository2-1.xml', catalog)
        root = ET.parse(catalog).getroot()
        package = next(p for p in root.findall('remotePackage') if p.get('path') == 'cmdline-tools;19.0')
        archive_info = next(a for a in package.findall('./archives/archive') if a.findtext('host-os') == 'linux')
        archive = tmp / 'tools.zip'
        download('https://dl.google.com/android/repository/' + archive_info.findtext('complete/url'), archive)
        assert hashlib.sha1(archive.read_bytes()).hexdigest() == archive_info.findtext('complete/checksum'), 'SDK checksum mismatch'
        with zipfile.ZipFile(archive) as package:
            package.extractall(tmp / 'unpacked')
        tools.parent.mkdir(parents=True, exist_ok=True)
        shutil.move(str(tmp / 'unpacked/cmdline-tools'), tools)
        for binary in (tools / 'bin').iterdir():
            binary.chmod(binary.stat().st_mode | stat.S_IXUSR)
print('JDK and Android command-line tools available.')
