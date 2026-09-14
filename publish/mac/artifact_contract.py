#!/usr/bin/env python3
"""Exact local macOS package contract. Never discovers or launches applications."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import plistlib
import re
import subprocess
import tempfile
import zipfile

BUNDLE_ID = 'com.latitude.browser.desktop'
PRODUCT_NAME = 'Latitude Browser'


def digest(path):
    result = hashlib.sha256()
    with Path(path).open('rb') as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b''):
            result.update(chunk)
    return result.hexdigest()


def validate_version(version):
    if not re.fullmatch(r'[0-9][0-9A-Za-z.+_-]{0,79}', version):
        raise ValueError('version must be a safe package component beginning with a digit')
    return version


def paths(output, arch, version):
    if arch not in ('arm64', 'amd64'):
        raise ValueError('unsupported architecture')
    validate_version(version)
    output = Path(output).resolve()
    name = f'LatitudeBrowser-{version}-macos-{arch}'
    return output, output / '.bundles.noindex' / (name + '.app'), output / (name + '.zip')


def bundle_files(bundle):
    required = ['Contents/MacOS/latitude-browser', 'Contents/MacOS/bin/xray', 'Contents/MacOS/bin/sing-box']
    optional = bundle / 'Contents/MacOS/bin/mihomo'
    if optional.exists():
        required.append('Contents/MacOS/bin/mihomo')
    for name in required:
        p = bundle / name
        if p.is_symlink() or not p.is_file() or not os.access(p, os.X_OK):
            raise ValueError(f'missing executable: {name}')
    plist = bundle / 'Contents/Info.plist'
    data = plist.read_bytes()
    # Wails' valid XML template starts with DOCTYPE, which plistlib's
    # automatic format detector does not recognize without an XML declaration.
    info = plistlib.loads(data, fmt=plistlib.FMT_BINARY if data.startswith(b'bplist00') else plistlib.FMT_XML)
    if info.get('CFBundleIdentifier') != BUNDLE_ID or info.get('CFBundleName') != PRODUCT_NAME:
        raise ValueError('unexpected application identity')
    if info.get('CFBundleDisplayName', PRODUCT_NAME) != PRODUCT_NAME:
        raise ValueError('unexpected display name')
    required.append('Contents/Info.plist')
    return {name: digest(bundle / name) for name in required}


def write_manifest(output, arch, version):
    output, bundle, archive = paths(output, arch, version)
    # A version/architecture pair has one exact archive, even when old packages remain.
    if archive.is_symlink() or not archive.is_file():
        raise ValueError('expected ZIP artifact is missing or a symbolic link')
    if bundle.is_symlink() or not bundle.is_dir():
        raise ValueError('expected bundle artifact is missing or a symbolic link')
    record = {'schemaVersion': 1, 'arch': arch, 'version': version,
              'bundleId': BUNDLE_ID, 'bundlePath': str(bundle), 'zipPath': str(archive),
              'zipSha256': digest(archive), 'files': bundle_files(bundle)}
    manifest = output / f'manifest-macos-{arch}.json'
    fd, staged = tempfile.mkstemp(prefix='.manifest-', dir=output)
    try:
        with os.fdopen(fd, 'w') as stream:
            json.dump(record, stream, indent=2)
            stream.write('\n')
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(staged, manifest)
    finally:
        Path(staged).unlink(missing_ok=True)
    return manifest, record


def read_manifest(manifest, expected_arch):
    manifest = Path(manifest).resolve()
    record = json.loads(manifest.read_text())
    if record.get('schemaVersion') != 1 or record.get('arch') != expected_arch or record.get('bundleId') != BUNDLE_ID:
        raise ValueError('manifest schema, architecture or identity mismatch')
    output, bundle, archive = paths(manifest.parent, record['arch'], record['version'])
    if record.get('bundlePath') != str(bundle) or record.get('zipPath') != str(archive):
        raise ValueError('manifest path does not match exact package contract')
    if bundle.is_symlink() or not bundle.is_dir() or archive.is_symlink() or not archive.is_file():
        raise ValueError('expected artifacts are missing or symbolic links')
    if digest(archive) != record.get('zipSha256') or bundle_files(bundle) != record.get('files'):
        raise ValueError('artifact digest mismatch')
    return record


def validate_archive_names(archive, bundle_name):
    with zipfile.ZipFile(archive) as z:
        if not z.infolist():
            raise ValueError('empty ZIP')
        for member in z.infolist():
            name = member.filename
            parts = name.rstrip('/').split('/')
            if '\\' in name or '\0' in name or any(p in ('', '.', '..') for p in parts):
                raise ValueError('unsafe ZIP entry')
            if parts[0] not in (bundle_name, '__MACOSX'):
                raise ValueError('unexpected ZIP root')


def validate_package(manifest, expected_arch):
    record = read_manifest(manifest, expected_arch)
    bundle = Path(record['bundlePath'])
    validate_archive_names(record['zipPath'], bundle.name)
    # TemporaryDirectory creates a private unique directory; suffix excludes it from indexing.
    with tempfile.TemporaryDirectory(prefix='latitude-package-', suffix='.noindex') as temp:
        subprocess.run(['ditto', '-x', '-k', record['zipPath'], temp], check=True)
        extracted = Path(temp) / bundle.name
        if bundle_files(extracted) != record['files']:
            raise ValueError('ZIP contents differ from assembled bundle')
        for app in (bundle, extracted):
            subprocess.run(['plutil', '-lint', str(app / 'Contents/Info.plist')], check=True)
            subprocess.run(['codesign', '--verify', '--deep', '--strict', str(app)], check=True)
            for name in record['files']:
                if name.startswith('Contents/MacOS/'):
                    expected = 'x86_64' if expected_arch == 'amd64' else 'arm64'
                    subprocess.run(['lipo', '-verify_arch', expected, str(app / name)], check=True)
    return record


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest='command', required=True)
    write = sub.add_parser('write')
    write.add_argument('--output', required=True)
    write.add_argument('--arch', required=True)
    write.add_argument('--version', required=True)
    validate = sub.add_parser('validate')
    validate.add_argument('--manifest', required=True)
    validate.add_argument('--arch', required=True)
    version = sub.add_parser('version')
    version.add_argument('value')
    args = parser.parse_args()
    if args.command == 'version':
        validate_version(args.value)
    elif args.command == 'write':
        manifest, record = write_manifest(args.output, args.arch, args.version)
        if os.environ.get('GITHUB_OUTPUT'):
            with open(os.environ['GITHUB_OUTPUT'], 'a') as stream:
                stream.write(f'manifest={manifest}\nzip={record["zipPath"]}\n')
        print(manifest)
    else:
        validate_package(args.manifest, args.arch)
        print('Package contract, ZIP, identity, signatures and architecture verified.')


if __name__ == '__main__':
    main()
