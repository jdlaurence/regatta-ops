#!/bin/sh
# Fetches the pinned PocketBase binary for this OS and architecture into backend/bin/.
# Idempotent: does nothing when backend/bin/pocketbase already reports the pinned version.
#
# To bump PocketBase: change PB_VERSION, then replace the four hashes below with the lines from
# https://github.com/pocketbase/pocketbase/releases/download/v<version>/checksums.txt
set -eu

PB_VERSION="0.40.4"

SHA256_darwin_amd64="052906521f09f6f23405cd804c930d2b7a1f8eee06d39b85723b5054b2acb4e4"
SHA256_darwin_arm64="eeb619ea4f8a06421daedb946d133bed269fea334a760941d147f76befc25ebc"
SHA256_linux_amd64="9042ec818570e79c3628dadcd0a756c1496d9e1173918ec409d133c02f82e5fa"
SHA256_linux_arm64="86095bf8ed9345954f0d2bf0a5fb9b57584ae60b77ebf3b6cd23a8003a3fd418"

SCRIPT_DIR=$(CDPATH='' cd -- "$(dirname -- "$0")" && pwd)
BIN_DIR="$SCRIPT_DIR/../bin"
BIN="$BIN_DIR/pocketbase"

if [ -x "$BIN" ] && "$BIN" --version 2>/dev/null | grep -q "$PB_VERSION"; then
  echo "PocketBase $PB_VERSION is already in backend/bin/."
  exit 0
fi

case "$(uname -s)" in
  Darwin) OS=darwin ;;
  Linux) OS=linux ;;
  *)
    echo "Unsupported OS: $(uname -s). Download PocketBase $PB_VERSION by hand into backend/bin/." >&2
    exit 1
    ;;
esac

case "$(uname -m)" in
  arm64 | aarch64) ARCH=arm64 ;;
  x86_64 | amd64) ARCH=amd64 ;;
  *)
    echo "Unsupported architecture: $(uname -m). Download PocketBase $PB_VERSION by hand into backend/bin/." >&2
    exit 1
    ;;
esac

eval "EXPECTED=\${SHA256_${OS}_${ARCH}}"
ZIP="pocketbase_${PB_VERSION}_${OS}_${ARCH}.zip"
URL="https://github.com/pocketbase/pocketbase/releases/download/v${PB_VERSION}/${ZIP}"

TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT INT TERM

echo "Downloading $URL"
curl -fsSL --retry 3 -o "$TMP/$ZIP" "$URL"

if command -v sha256sum >/dev/null 2>&1; then
  ACTUAL=$(sha256sum "$TMP/$ZIP" | cut -d' ' -f1)
else
  ACTUAL=$(shasum -a 256 "$TMP/$ZIP" | cut -d' ' -f1)
fi
if [ "$ACTUAL" != "$EXPECTED" ]; then
  echo "Checksum mismatch for $ZIP" >&2
  echo "  expected $EXPECTED" >&2
  echo "  actual   $ACTUAL" >&2
  exit 1
fi

unzip -q -o "$TMP/$ZIP" pocketbase -d "$TMP/out"
mkdir -p "$BIN_DIR"
mv "$TMP/out/pocketbase" "$BIN"
chmod +x "$BIN"
echo "Installed $("$BIN" --version) into backend/bin/."
