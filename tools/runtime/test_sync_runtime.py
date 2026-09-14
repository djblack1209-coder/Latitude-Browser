"""Offline runtime-sync regressions; no network or fixture binary execution.

Run: python3 -B -m unittest discover -s tools/runtime -p 'test_sync_runtime.py' -v
"""

import contextlib
import gzip
import hashlib
import importlib.util
import io
import json
import os
from pathlib import Path
import shutil
import stat
import subprocess
import sys
import tarfile
import tempfile
import unittest
from unittest import mock
import zipfile


SCRIPT = Path(__file__).with_name("sync-runtime.py")
SPEC = importlib.util.spec_from_file_location("latitude_runtime_sync", SCRIPT)
sync = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(sync)


class RuntimeSyncTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix="latitude-runtime-test-")
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.dest = self.root / "bin/test-target/mihomo"
        self.dest.parent.mkdir(parents=True)
        self.old = b"previous verified runtime\n"
        self.dest.write_bytes(self.old)
        self.dest.chmod(0o755)
        self.payload = b"self-created runtime fixture; never executed\n" * 100

    def archive(self, kind, payload=None):
        payload = self.payload if payload is None else payload
        path = self.root / ("fixture." + kind)
        inner = "nested/mihomo"
        if kind == "gz":
            with path.open("wb") as raw:
                with gzip.GzipFile(filename="../../ignored-header-name", mode="wb", fileobj=raw, mtime=0) as output:
                    output.write(payload)
        elif kind == "zip":
            with zipfile.ZipFile(path, "w") as output:
                output.writestr(inner, payload)
        elif kind == "tar.gz":
            with tarfile.open(path, "w:gz") as output:
                info = tarfile.TarInfo(inner)
                info.size = len(payload)
                output.addfile(info, io.BytesIO(payload))
        else:
            raise AssertionError(kind)
        return path, inner

    def assert_old_preserved(self):
        self.assertEqual(self.dest.read_bytes(), self.old)
        self.assertEqual(sorted(p.name for p in self.dest.parent.iterdir()), ["mihomo"])
        if os.name != "nt":
            self.assertEqual(stat.S_IMODE(self.dest.stat().st_mode), 0o755)

    def fixture_source(self, archive, inner):
        return {
            "id": "offline-fixture",
            "target": "test-target",
            "runtime": "mihomo",
            "version": "fixture",
            "archiveType": "tar.gz" if archive.name.endswith(".tar.gz") else archive.suffix[1:],
            "url": "https://example.invalid/" + archive.name,
            "archiveSha256": hashlib.sha256(archive.read_bytes()).hexdigest(),
            "archiveSize": archive.stat().st_size,
            "archiveBinaryPath": inner,
            "destPath": "bin/test-target/mihomo",
        }

    def prepare_main(self, source, archive):
        cache = self.root / "cache"
        cache.mkdir(exist_ok=True)
        shutil.copyfile(archive, cache / archive.name)
        publish = self.root / "publish"
        publish.mkdir(exist_ok=True)
        (publish / "runtime-sources.json").write_text(json.dumps({"sources": [source]}), encoding="utf-8")
        manifest = publish / "runtime-manifest.json"
        manifest.write_text(json.dumps({"files": [{
            "path": "bin/test-target/mihomo",
            "targets": ["test-target"],
            "sha256": hashlib.sha256(self.old).hexdigest(),
        }]}), encoding="utf-8")
        tool_dir = self.root / "tools/runtime"
        tool_dir.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(SCRIPT, tool_dir / SCRIPT.name)
        shutil.copyfile(SCRIPT.with_name("update-runtime-manifest.py"), tool_dir / "update-runtime-manifest.py")
        return manifest

    def run_main(self):
        with mock.patch.object(sync, "__file__", str(self.root / "tools/runtime/sync-runtime.py")), \
             mock.patch.object(sys, "argv", [str(SCRIPT), "--target", "test-target", "--cache-dir", "cache"]), \
             mock.patch.object(sync, "urlopen", side_effect=AssertionError("offline tests must never download")), \
             contextlib.redirect_stdout(io.StringIO()):
            return sync.main()

    def test_single_file_gzip_is_extracted_and_executable(self):
        archive, inner = self.archive("gz")
        sync.extract_binary(archive, "gz", inner, self.dest)
        self.assertEqual(self.dest.read_bytes(), self.payload)
        self.assertEqual(sorted(p.name for p in self.dest.parent.iterdir()), ["mihomo"])
        self.assertFalse((self.root / "ignored-header-name").exists())
        if os.name != "nt":
            self.assertEqual(stat.S_IMODE(self.dest.stat().st_mode), 0o755)

    def test_zip_and_tar_gz_keep_existing_member_selection(self):
        for kind in ("zip", "tar.gz"):
            with self.subTest(kind=kind):
                archive, inner = self.archive(kind)
                sync.extract_binary(archive, kind, inner, self.dest)
                self.assertEqual(self.dest.read_bytes(), self.payload)

    def test_truncated_gzip_preserves_old_runtime(self):
        archive, inner = self.archive("gz", self.payload * 1000)
        archive.write_bytes(archive.read_bytes()[:-8])
        source = self.fixture_source(archive, inner)
        manifest = self.prepare_main(source, archive)
        before = manifest.read_bytes()
        with self.assertRaises((RuntimeError, OSError, EOFError)):
            self.run_main()
        self.assert_old_preserved()
        self.assertEqual(manifest.read_bytes(), before)

    def test_bad_gzip_crc_preserves_old_runtime(self):
        archive, inner = self.archive("gz", self.payload * 1000)
        damaged = bytearray(archive.read_bytes())
        damaged[-8] ^= 1
        archive.write_bytes(damaged)
        with self.assertRaises((RuntimeError, OSError, EOFError)):
            sync.extract_binary(archive, "gz", inner, self.dest)
        self.assert_old_preserved()

    def test_empty_gzip_does_not_replace_old_runtime(self):
        archive, inner = self.archive("gz", b"")
        with self.assertRaises(RuntimeError):
            sync.extract_binary(archive, "gz", inner, self.dest)
        self.assert_old_preserved()

    def test_archive_hash_mismatch_preserves_runtime_and_manifest(self):
        archive, inner = self.archive("zip")
        source = self.fixture_source(archive, inner)
        source["archiveSha256"] = "0" * 64
        manifest = self.prepare_main(source, archive)
        before = manifest.read_bytes()
        with self.assertRaisesRegex(RuntimeError, "sha256 mismatch"):
            self.run_main()
        self.assert_old_preserved()
        self.assertEqual(manifest.read_bytes(), before)

    def test_archive_size_mismatch_preserves_runtime_and_manifest(self):
        archive, inner = self.archive("zip")
        for delta in (-1, 1):
            with self.subTest(delta=delta):
                self.dest.write_bytes(self.old)
                source = self.fixture_source(archive, inner)
                source["archiveSize"] += delta
                manifest = self.prepare_main(source, archive)
                before = manifest.read_bytes()
                with self.assertRaisesRegex(RuntimeError, "size mismatch"):
                    self.run_main()
                self.assert_old_preserved()
                self.assertEqual(manifest.read_bytes(), before)

    def test_partial_copy_failure_never_replaces_old_runtime(self):
        def fail_after_write(src, out):
            out.write(b"partial unverified bytes")
            raise OSError("injected write failure")

        for kind in ("zip", "tar.gz", "gz"):
            with self.subTest(kind=kind):
                self.dest.write_bytes(self.old)
                archive, inner = self.archive(kind)
                with mock.patch.object(sync.shutil, "copyfileobj", side_effect=fail_after_write):
                    with self.assertRaises((RuntimeError, OSError)):
                        sync.extract_binary(archive, kind, inner, self.dest)
                self.assert_old_preserved()

    def test_first_install_failure_leaves_no_partial_runtime(self):
        archive, inner = self.archive("zip")
        self.dest.unlink()

        def fail_after_write(src, out):
            out.write(b"partial unverified bytes")
            raise OSError("injected write failure")

        with mock.patch.object(sync.shutil, "copyfileobj", side_effect=fail_after_write):
            with self.assertRaises(OSError):
                sync.extract_binary(archive, "zip", inner, self.dest)
        self.assertFalse(self.dest.exists())
        self.assertEqual(list(self.dest.parent.iterdir()), [])

    def test_permission_failure_preserves_old_runtime(self):
        archive, inner = self.archive("zip")
        with mock.patch.object(sync.os, "chmod", side_effect=OSError("injected chmod failure")):
            with self.assertRaises(OSError):
                sync.extract_binary(archive, "zip", inner, self.dest)
        self.assert_old_preserved()

    def test_sync_failure_preserves_old_runtime(self):
        archive, inner = self.archive("zip")
        with mock.patch.object(sync.os, "fsync", side_effect=OSError("injected fsync failure")):
            with self.assertRaises(OSError):
                sync.extract_binary(archive, "zip", inner, self.dest)
        self.assert_old_preserved()

    def test_atomic_replace_failure_preserves_old_runtime(self):
        archive, inner = self.archive("zip")
        with mock.patch.object(sync.os, "replace", side_effect=OSError("injected replace failure")):
            with self.assertRaises(OSError):
                sync.extract_binary(archive, "zip", inner, self.dest)
        self.assert_old_preserved()

    def test_invalid_lock_values_are_rejected(self):
        archive, inner = self.archive("zip")
        for field, values in (
            ("archiveSha256", ("", "deadbeef", "g" * 64, "sha256:" + "a" * 64)),
            ("archiveSize", (None, True, 0, -1, "19012185")),
        ):
            for value in values:
                with self.subTest(field=field, value=value):
                    source = self.fixture_source(archive, inner)
                    source[field] = value
                    with self.assertRaises(RuntimeError):
                        sync.validate_source(source)
        self.assert_old_preserved()

    def test_legacy_source_without_size_remains_valid(self):
        archive, inner = self.archive("zip")
        source = self.fixture_source(archive, inner)
        del source["archiveSize"]
        sync.validate_source(source)

    def test_gzip_cli_updates_manifest_from_actual_binary(self):
        archive, inner = self.archive("gz")
        manifest = self.prepare_main(self.fixture_source(archive, inner), archive)
        home = self.root / "home"
        home.mkdir()
        env = {
            "PATH": os.defpath,
            "HOME": str(home),
            "USERPROFILE": str(home),
            "XDG_CONFIG_HOME": str(home / "config"),
            "XDG_DATA_HOME": str(home / "data"),
            "XDG_CACHE_HOME": str(home / "cache"),
            "APPDATA": str(home / "appdata"),
            "LOCALAPPDATA": str(home / "localappdata"),
            "PYTHONDONTWRITEBYTECODE": "1",
        }
        result = subprocess.run([
            sys.executable, "-B", str(self.root / "tools/runtime/sync-runtime.py"),
            "--target", "test-target", "--cache-dir", "cache",
        ], cwd=self.root, env=env, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, timeout=20)
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertIn("runtime sync complete", result.stdout)
        self.assertEqual(self.dest.read_bytes(), self.payload)
        self.assertEqual(json.loads(manifest.read_text())["files"][0]["sha256"], hashlib.sha256(self.payload).hexdigest())
        self.assertEqual(sorted(p.name for p in self.dest.parent.iterdir()), ["mihomo"])


if __name__ == "__main__":
    unittest.main()
