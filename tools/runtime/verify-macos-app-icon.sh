#!/usr/bin/env bash
set -euo pipefail

# Verify that a Wails-built macOS bundle contains the black-backed icon generated
# from the current build/appicon.png source. Wails converts appicon.png into
# Contents/Resources/iconfile.icns during every darwin build.
APP_BUNDLE="${1:-}"
SOURCE_ICON="${2:-}"

if [[ -z "$APP_BUNDLE" || -z "$SOURCE_ICON" ]]; then
  echo "usage: $0 <path-to-app-bundle> <path-to-appicon.png>" >&2
  exit 2
fi

if [[ ! -d "$APP_BUNDLE" || "${APP_BUNDLE##*.}" != "app" ]]; then
  echo "[ERROR] invalid macOS app bundle: $APP_BUNDLE" >&2
  exit 2
fi
if [[ ! -f "$SOURCE_ICON" ]]; then
  echo "[ERROR] source app icon is missing: $SOURCE_ICON" >&2
  exit 2
fi

INFO_PLIST="$APP_BUNDLE/Contents/Info.plist"
ICON_FILE="$APP_BUNDLE/Contents/Resources/iconfile.icns"

if [[ ! -f "$INFO_PLIST" ]]; then
  echo "[ERROR] app bundle is missing Contents/Info.plist" >&2
  exit 2
fi
if [[ ! -f "$ICON_FILE" ]]; then
  echo "[ERROR] app bundle is missing Contents/Resources/iconfile.icns" >&2
  exit 2
fi

icon_file_name="$(/usr/libexec/PlistBuddy -c 'Print :CFBundleIconFile' "$INFO_PLIST" 2>/dev/null || true)"
if [[ "$icon_file_name" != "iconfile" && "$icon_file_name" != "iconfile.icns" ]]; then
  echo "[ERROR] CFBundleIconFile must point to iconfile, got: ${icon_file_name:-<missing>}" >&2
  exit 2
fi

# A stale bundle is the common reason the macOS Dock still shows the old logo:
# an already-installed .app is not rebuilt when build/appicon.png changes.
if [[ "$ICON_FILE" -ot "$SOURCE_ICON" ]]; then
  echo "[ERROR] stale macOS app icon: $ICON_FILE is older than $SOURCE_ICON" >&2
  echo "        rebuild the app without --skip-build before packaging or reinstalling." >&2
  exit 1
fi

# Check the source and decoded ICNS slots instead of relying only on sips'
# broad hasAlpha flag. Latitude Browser intentionally ships a solid black
# background, so every icon pixel must be opaque and the canvas corners must be
# black. This prevents Dock from compositing the old white/transparent variant.
check_png_black_background() {
  local png_path="$1"
  local label="$2"
  python3 - "$png_path" "$label" <<'PY'
import struct
import sys
import zlib

path, label = sys.argv[1:]
data = open(path, "rb").read()
if data[:8] != b"\x89PNG\r\n\x1a\n":
    raise SystemExit(f"[ERROR] {label} is not a PNG: {path}")

pos = 8
idat = bytearray()
width = height = bit_depth = color_type = interlace = None
while pos < len(data):
    if pos + 12 > len(data):
        raise SystemExit(f"[ERROR] truncated PNG chunks in {label}: {path}")
    size = struct.unpack(">I", data[pos : pos + 4])[0]
    chunk = data[pos + 4 : pos + 8]
    payload_start = pos + 8
    payload_end = payload_start + size
    if payload_end + 4 > len(data):
        raise SystemExit(f"[ERROR] truncated PNG payload in {label}: {path}")
    payload = data[payload_start:payload_end]
    pos = payload_end + 4
    if chunk == b"IHDR":
        width, height, bit_depth, color_type, _, _, interlace = struct.unpack(">IIBBBBB", payload)
    elif chunk == b"IDAT":
        idat.extend(payload)
    elif chunk == b"IEND":
        break

if width is None or height is None:
    raise SystemExit(f"[ERROR] PNG has no IHDR in {label}: {path}")
if bit_depth != 8 or color_type not in (2, 4, 6) or interlace != 0:
    raise SystemExit(
        f"[ERROR] {label} must be a non-interlaced 8-bit RGB, grayscale+alpha, or RGBA PNG; "
        f"got bit-depth={bit_depth}, color-type={color_type}, interlace={interlace}: {path}"
    )

channels = {2: 3, 4: 2, 6: 4}[color_type]
stride = width * channels
raw = zlib.decompress(bytes(idat))
expected = height * (stride + 1)
if len(raw) != expected:
    raise SystemExit(f"[ERROR] invalid decompressed PNG size in {label}: {path}")

rows = []
previous = bytearray(stride)
pos = 0
for _ in range(height):
    filter_type = raw[pos]
    pos += 1
    row = bytearray(raw[pos : pos + stride])
    pos += stride
    for index in range(stride):
        left = row[index - channels] if index >= channels else 0
        up = previous[index]
        upper_left = previous[index - channels] if index >= channels else 0
        if filter_type == 1:
            row[index] = (row[index] + left) & 0xFF
        elif filter_type == 2:
            row[index] = (row[index] + up) & 0xFF
        elif filter_type == 3:
            row[index] = (row[index] + ((left + up) // 2)) & 0xFF
        elif filter_type == 4:
            estimate = left + up - upper_left
            distance_left = abs(estimate - left)
            distance_up = abs(estimate - up)
            distance_upper_left = abs(estimate - upper_left)
            if distance_left <= distance_up and distance_left <= distance_upper_left:
                predictor = left
            elif distance_up <= distance_upper_left:
                predictor = up
            else:
                predictor = upper_left
            row[index] = (row[index] + predictor) & 0xFF
        elif filter_type != 0:
            raise SystemExit(f"[ERROR] unsupported PNG filter {filter_type} in {label}: {path}")
    rows.append(row)
    previous = row

pixels = []
if color_type == 6:
    pixels = [tuple(row[index : index + 4]) for row in rows for index in range(0, stride, 4)]
    alphas = [pixel[3] for pixel in pixels]
    corners = (pixels[0], pixels[width - 1], pixels[-width], pixels[-1])
    corner_colors = tuple(pixel[:3] for pixel in corners)
elif color_type == 4:
    pixels = [tuple(row[index : index + 2]) for row in rows for index in range(0, stride, 2)]
    alphas = [pixel[1] for pixel in pixels]
    corners = (pixels[0], pixels[width - 1], pixels[-width], pixels[-1])
    corner_colors = tuple((pixel[0], pixel[0], pixel[0]) for pixel in corners)
else:
    # iconutil commonly emits opaque ICNS slots as truecolor RGB PNGs. RGB has
    # no alpha channel, so treat every pixel as fully opaque while validating
    # the black canvas and visible green artwork.
    pixels = [tuple(row[index : index + 3]) for row in rows for index in range(0, stride, 3)]
    alphas = [255] * len(pixels)
    corners = (pixels[0], pixels[width - 1], pixels[-width], pixels[-1])
    corner_colors = corners

if any(value != 255 for value in alphas):
    minimum = min(alphas)
    maximum = max(alphas)
    raise SystemExit(
        f"[ERROR] {label} has non-opaque alpha (range={minimum}..{maximum}); "
        "the Dock icon must use a solid black background."
    )
if not all(max(color) <= 2 for color in corner_colors):
    raise SystemExit(
        f"[ERROR] {label} has non-black canvas corners {corner_colors}; "
        "the Dock icon likely contains a white or transparent background."
    )

# The corners catch a full white canvas, while this ratio catches a mostly
# white/colored canvas with only tiny black corner pixels.
black_pixels = sum(
    1
    for color in (
        pixel[:3] if color_type in (2, 6) else (pixel[0],) * 3
        for pixel in pixels
    )
    if max(color) <= 2
)
black_ratio = black_pixels / len(pixels)
if black_ratio < 0.50:
    raise SystemExit(
        f"[ERROR] {label} black canvas coverage is only {black_ratio:.1%}; "
        "expected a mostly black background with green artwork."
    )

# A valid icon needs visible artwork and should not be an all-black placeholder.
non_black_pixels = len(pixels) - black_pixels
if non_black_pixels == 0:
    raise SystemExit(f"[ERROR] {label} contains no visible green icon artwork: {path}")

print(
    f"[OK] {label} black background verified ({width}x{height}, alpha=255, "
    f"black canvas={black_ratio:.1%})"
)
PY
}

check_png_black_background "$SOURCE_ICON" "source icon"

# Confirm the ICNS can be decoded and includes the normal 1024px Retina slot.
# iconutil/sips are part of macOS; skip only when this helper is used elsewhere.
if command -v iconutil >/dev/null 2>&1 && command -v sips >/dev/null 2>&1; then
  iconset_dir="$(mktemp -d "${TMPDIR:-/tmp}/latitude-iconset.XXXXXX")"
  trap 'rm -rf "$iconset_dir"' EXIT
  iconutil -c iconset "$ICON_FILE" -o "$iconset_dir/icon.iconset" >/dev/null
  largest="$iconset_dir/icon.iconset/icon_512x512@2x.png"
  if [[ ! -f "$largest" ]]; then
    echo "[ERROR] iconfile.icns has no 1024px Retina icon slot" >&2
    exit 1
  fi
  width="$(sips -g pixelWidth "$largest" 2>/dev/null | awk '/pixelWidth:/ {print $2}')"
  height="$(sips -g pixelHeight "$largest" 2>/dev/null | awk '/pixelHeight:/ {print $2}')"
  if [[ "$width" != "1024" || "$height" != "1024" ]]; then
    echo "[ERROR] largest app icon slot is ${width:-?}x${height:-?}, expected 1024x1024" >&2
    exit 1
  fi

  # Verify every slot, not just the largest one. Dock and Finder can select a
  # smaller slot depending on scale; one bad slot can reintroduce a white square
  # even when the 1024px image is correct.
  shopt -s nullglob
  icon_slots=("$iconset_dir/icon.iconset"/*.png)
  if [[ "${#icon_slots[@]}" -eq 0 ]]; then
    echo "[ERROR] iconfile.icns decoded to no PNG slots" >&2
    exit 1
  fi
  for slot in "${icon_slots[@]}"; do
    check_png_black_background "$slot" "ICNS slot $(basename "$slot")"
  done
fi

echo "[OK] macOS app icon is present, current, opaque black-backed, and referenced by Info.plist: $ICON_FILE"
