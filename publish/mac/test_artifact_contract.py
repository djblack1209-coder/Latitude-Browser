import importlib.util
from pathlib import Path
import os
import plistlib
import json
import subprocess
import sys
import tempfile
import unittest
import zipfile
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('artifact_contract', Path(__file__).with_name('artifact_contract.py'))
contract = importlib.util.module_from_spec(spec)
spec.loader.exec_module(contract)


class ArtifactContractTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix='latitude contract spaces ')
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name).resolve()

    def fixture(self, arch, version='1.5.0'):
        output, bundle, archive = contract.paths(self.root, arch, version)
        for name in ('latitude-browser', 'bin/xray', 'bin/sing-box', 'bin/mihomo'):
            p = bundle / 'Contents/MacOS' / name
            p.parent.mkdir(parents=True, exist_ok=True)
            p.write_bytes(b'fixture ' + arch.encode())
            p.chmod(0o700)
        with (bundle / 'Contents/Info.plist').open('wb') as stream:
            plistlib.dump({'CFBundleIdentifier': contract.BUNDLE_ID, 'CFBundleName': contract.PRODUCT_NAME}, stream)
        with zipfile.ZipFile(archive, 'w') as z:
            for p in bundle.rglob('*'):
                if p.is_file():
                    z.write(p, str(Path(bundle.name) / p.relative_to(bundle)))
        return bundle, archive

    def test_exact_both_architectures_with_old_artifacts_and_spaces(self):
        for arch in ('arm64', 'amd64'):
            with self.subTest(arch=arch):
                self.fixture(arch, '0.0.1')
                bundle, archive = self.fixture(arch)
                manifest, record = contract.write_manifest(self.root, arch, '1.5.0')
                self.assertEqual(contract.read_manifest(manifest, arch), record)
                self.assertEqual(record['zipPath'], str(archive))
                self.assertEqual(record['bundlePath'], str(bundle))
                self.assertFalse(any(self.root.glob('*.app')))
                with self.assertRaises(ValueError):
                    contract.read_manifest(manifest, 'arm64' if arch == 'amd64' else 'amd64')

    def test_wails_doctype_first_and_binary_plist(self):
        bundle, _ = self.fixture('arm64')
        info = bundle / 'Contents/Info.plist'
        values = {'CFBundleIdentifier': contract.BUNDLE_ID, 'CFBundleName': contract.PRODUCT_NAME}
        xml = plistlib.dumps(values).split(b'\n', 1)[1]
        self.assertTrue(xml.startswith(b'<!DOCTYPE'))
        for data in (xml, plistlib.dumps(values, fmt=plistlib.FMT_BINARY)):
            info.write_bytes(data)
            self.assertIn('Contents/Info.plist', contract.bundle_files(bundle))
        info.write_bytes(b'not a plist')
        with self.assertRaises(Exception):
            contract.bundle_files(bundle)

    def test_missing_tampered_and_redirected_artifacts(self):
        bundle, archive = self.fixture('arm64')
        manifest, _ = contract.write_manifest(self.root, 'arm64', '1.5.0')
        archive.write_bytes(b'tampered')
        with self.assertRaisesRegex(ValueError, 'digest'):
            contract.read_manifest(manifest, 'arm64')
        archive.unlink()
        with self.assertRaises(ValueError):
            contract.write_manifest(self.root, 'arm64', '1.5.0')
        self.fixture('arm64')
        exe = bundle / 'Contents/MacOS/latitude-browser'
        exe.unlink()
        exe.symlink_to('/bin/sh')
        with self.assertRaises(ValueError):
            contract.write_manifest(self.root, 'arm64', '1.5.0')

    def test_safe_version(self):
        for value in ('../outside', '1/../../outside', '1\nbad', '', '1 $(id)', '1;bad'):
            with self.subTest(value=value), self.assertRaises(ValueError):
                contract.paths(self.root, 'arm64', value)

    def test_cli_outputs_exact_current_artifacts_for_ci(self):
        self.fixture('arm64', '0.0.1')
        _, archive = self.fixture('arm64')
        outputs = self.root / 'github outputs'
        subprocess.run([sys.executable, str(Path(contract.__file__)), 'write', '--output', str(self.root), '--arch', 'arm64', '--version', '1.5.0'], env={**os.environ, 'GITHUB_OUTPUT': str(outputs)}, check=True, capture_output=True)
        values = dict(line.split('=', 1) for line in outputs.read_text().splitlines())
        self.assertEqual(values, {'manifest': str(self.root / 'manifest-macos-arm64.json'), 'zip': str(archive)})
        contract.read_manifest(values['manifest'], 'arm64')

    def test_manifest_redirect_and_wrong_product_identity_are_rejected(self):
        bundle, _ = self.fixture('arm64')
        manifest, record = contract.write_manifest(self.root, 'arm64', '1.5.0')
        record['zipPath'] = str(self.root / 'old.zip')
        manifest.write_text(json.dumps(record))
        with self.assertRaisesRegex(ValueError, 'exact package'):
            contract.read_manifest(manifest, 'arm64')
        with (bundle / 'Contents/Info.plist').open('wb') as stream:
            plistlib.dump({'CFBundleIdentifier': 'unexpected.product'}, stream)
        with self.assertRaisesRegex(ValueError, 'identity'):
            contract.write_manifest(self.root, 'arm64', '1.5.0')

    def test_archive_roots_and_traversal(self):
        bundle, archive = self.fixture('arm64')
        contract.validate_archive_names(archive, bundle.name)
        for name in ('../escape', '/absolute', bundle.name + '/../escape', 'Other.app/Contents/x'):
            with zipfile.ZipFile(archive, 'w') as z:
                z.writestr(name, b'x')
            with self.subTest(name=name), self.assertRaises(ValueError):
                contract.validate_archive_names(archive, bundle.name)

    def test_private_unique_validation_directory_cleans_up_on_failure(self):
        self.fixture('arm64')
        manifest, _ = contract.write_manifest(self.root, 'arm64', '1.5.0')
        observed = []
        def fail_extract(command, **kwargs):
            destination = Path(command[-1])
            self.assertTrue(destination.name.endswith('.noindex'))
            self.assertEqual(destination.stat().st_mode & 0o777, 0o700)
            observed.append(destination)
            raise RuntimeError('synthetic extraction failure')
        for _ in range(2):
            with patch.object(contract.subprocess, 'run', side_effect=fail_extract):
                with self.assertRaises(RuntimeError):
                    contract.validate_package(manifest, 'arm64')
        self.assertNotEqual(*observed)
        self.assertTrue(all(not p.exists() for p in observed))


if __name__ == '__main__':
    unittest.main()
