#!/usr/bin/env bash
set -euo pipefail

# Re-register an already-installed app after replacing its bundle. This avoids
# treating `killall Dock` as the fix: LaunchServices is updated first, and Dock
# is restarted only when explicitly requested.
APP_BUNDLE=""
SOURCE_ICON=""
RESTART_DOCK=0

usage() {
  cat <<'USAGE'
Usage:
  tools/runtime/refresh-macos-app-icon.sh <path-to-app-bundle> [options]

Options:
  --source <path-to-appicon.png>
      Also run verify-macos-app-icon.sh against the source and installed bundle.
  --restart-dock
      Restart Dock after LaunchServices registration. Optional; registration is
      still performed without this flag.
  -h, --help
      Show this help.
USAGE
}

if [[ $# -eq 1 && ( "$1" == "-h" || "$1" == "--help" ) ]]; then
  usage
  exit 0
fi
if [[ $# -lt 1 ]]; then
  usage >&2
  exit 2
fi

APP_BUNDLE="$1"
shift
while [[ $# -gt 0 ]]; do
  case "$1" in
    --source)
      SOURCE_ICON="${2:-}"
      if [[ -z "$SOURCE_ICON" ]]; then
        echo "[ERROR] --source requires a PNG path" >&2
        exit 2
      fi
      shift 2
      ;;
    --restart-dock)
      RESTART_DOCK=1
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "[ERROR] unknown argument: $1" >&2
      usage >&2
      exit 2
      ;;
  esac
done

if [[ "$(uname -s)" != "Darwin" ]]; then
  echo "[ERROR] this helper must run on macOS" >&2
  exit 1
fi
if [[ ! -d "$APP_BUNDLE" || "${APP_BUNDLE##*.}" != "app" ]]; then
  echo "[ERROR] invalid macOS app bundle: $APP_BUNDLE" >&2
  exit 2
fi

if [[ -n "$SOURCE_ICON" ]]; then
  SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
  "$SCRIPT_DIR/verify-macos-app-icon.sh" "$APP_BUNDLE" "$SOURCE_ICON"
fi

LSREGISTER="/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister"
if [[ ! -x "$LSREGISTER" ]]; then
  echo "[ERROR] LaunchServices registration tool is unavailable: $LSREGISTER" >&2
  exit 1
fi

# Unregister and force-register the exact bundle path. This updates the
# LaunchServices record used by Finder and Dock without globally deleting the
# LaunchServices database.
echo "[1/2] Re-registering app with LaunchServices: $APP_BUNDLE"
"$LSREGISTER" -u "$APP_BUNDLE" >/dev/null 2>&1 || true
"$LSREGISTER" -f "$APP_BUNDLE"

echo "[2/2] LaunchServices registration complete"
if [[ "$RESTART_DOCK" -eq 1 ]]; then
  # This is only a final display refresh after the source asset and
  # LaunchServices record have been validated/updated above.
  killall Dock >/dev/null 2>&1 || true
  echo "[OK] Dock restarted"
else
  echo "[OK] app icon cache refreshed; restart Dock with --restart-dock only if needed"
fi
