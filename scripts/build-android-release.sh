#!/usr/bin/env bash
# Keep signing credentials in environment variables; never enable shell tracing.
set +x
set -euo pipefail
umask 077

usage() {
  cat <<'HELP'
Build and verify the Mi Balance release APK with the official Android SDK tools.

Usage: scripts/build-android-release.sh [--unsigned-only | --sign-only]

Default: build the web assets and unsigned release APK, then sign and verify it.
--unsigned-only: build and inspect the unsigned APK; no credentials required.
--sign-only: sign and inspect an existing app-release-unsigned.apk; no rebuild.

Required for signing:
  ANDROID_KEYSTORE_PATH       Private keystore outside the repository
  ANDROID_KEYSTORE_PASSWORD   Keystore password (never passed as plaintext CLI text)
Optional:
  ANDROID_KEY_ALIAS           Defaults to mi-balance-release
  ANDROID_KEY_PASSWORD        Defaults to ANDROID_KEYSTORE_PASSWORD

Set ANDROID_HOME (or ANDROID_SDK_ROOT), and put Java 21 and keytool on PATH.
Install Android platform 36 and build-tools 35.0.0 or 36.0.0 first.
Outputs stay under android/app/build/outputs/apk/release/; nothing is published.
HELP
}

fail() { printf 'Error: %s\n' "$*" >&2; exit 1; }

mode=build-and-sign
if (( $# > 1 )); then usage >&2; exit 2; fi
case "${1:-}" in
  '') ;;
  --unsigned-only) mode=unsigned ;;
  --sign-only) mode=sign ;;
  -h|--help) usage; exit 0 ;;
  *) usage >&2; exit 2 ;;
esac

script_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
repo_root=$(cd -- "$script_dir/.." && pwd)
sdk_root=${ANDROID_HOME:-${ANDROID_SDK_ROOT:-}}
[[ -n "$sdk_root" && -d "$sdk_root/build-tools" ]] || fail 'Set ANDROID_HOME to an installed Android SDK.'
command -v python3 >/dev/null || fail 'python3 is required.'

# Choose the newest supported stable SDK tools without silently using a preview.
build_tools=$(python3 - "$sdk_root/build-tools" <<'PY'
from pathlib import Path
import re
import sys
versions = []
for path in Path(sys.argv[1]).iterdir():
    if path.is_dir() and re.fullmatch(r'\d+\.\d+\.\d+', path.name):
        version = tuple(map(int, path.name.split('.')))
        if (35, 0, 0) <= version <= (36, 0, 0):
            versions.append((version, path))
if versions:
    print(max(versions)[1])
PY
)
[[ -n "$build_tools" ]] || fail 'Install build-tools 35.0.0 or 36.0.0 with sdkmanager.'
for tool_name in aapt apksigner zipalign; do
  [[ -x "$build_tools/$tool_name" ]] || fail "Missing SDK tool: $tool_name."
done
unsigned_apk="$repo_root/android/app/build/outputs/apk/release/app-release-unsigned.apk"
signed_apk="$repo_root/android/app/build/outputs/apk/release/mi-balance-release.apk"
expected_package=com.gabrielcuba.mibalance

if [[ "$mode" != unsigned ]]; then
  [[ -n "${ANDROID_KEYSTORE_PATH:-}" && -f "$ANDROID_KEYSTORE_PATH" && -r "$ANDROID_KEYSTORE_PATH" ]] || fail 'Provide a readable ANDROID_KEYSTORE_PATH outside the repository.'
  [[ -n "${ANDROID_KEYSTORE_PASSWORD:-}" ]] || fail 'Set ANDROID_KEYSTORE_PASSWORD securely in the environment.'
  key_realpath=$(python3 - "$ANDROID_KEYSTORE_PATH" <<'PY'
from pathlib import Path
import sys
print(Path(sys.argv[1]).resolve())
PY
)
  case "$key_realpath" in
    "$repo_root"|"$repo_root"/*) fail 'The private keystore must stay outside the repository.' ;;
  esac
  export ANDROID_KEYSTORE_PATH=$key_realpath
  export ANDROID_KEY_ALIAS=${ANDROID_KEY_ALIAS:-mi-balance-release}
  export ANDROID_KEY_PASSWORD=${ANDROID_KEY_PASSWORD:-$ANDROID_KEYSTORE_PASSWORD}
  export ANDROID_KEYSTORE_PASSWORD
  command -v keytool >/dev/null || fail 'keytool is required; put Java 21 on PATH.'
fi

if [[ "$mode" != sign ]]; then
  cd -- "$repo_root"
  npm run android:sync
  (cd -- "$repo_root/android" && bash ./gradlew assembleRelease --no-daemon --max-workers=2)
fi
[[ -s "$unsigned_apk" ]] || fail 'Unsigned APK missing. Run --unsigned-only first or use the default build mode.'

inspect_manifest() {
  local apk=$1
  local badging
  badging=$("$build_tools/aapt" dump badging "$apk")
  [[ "$badging" == "package: name='$expected_package' "* ]] || fail 'Unexpected application ID in the APK.'
  if [[ "$badging" == application-debuggable* || "$badging" == *$'\n'application-debuggable* ]]; then
    fail 'The APK is debuggable; refusing to treat it as a release.'
  fi
  python3 - "$repo_root/android/app/build.gradle" "$badging" <<'PY'
from pathlib import Path
import re
import sys
source = Path(sys.argv[1]).read_text()
badging = sys.argv[2].splitlines()[0]
for field, pattern in [('versionCode', r'\bversionCode\s+(\d+)'),
                       ('versionName', r'\bversionName\s+[\"\']([^\"\']+)[\"\']')]:
    expected = re.search(pattern, source)
    actual = re.search(rf"\b{field}='([^']+)'", badging)
    if not expected or not actual or expected[1] != actual[1]:
        sys.exit(f'Error: APK {field} does not match build.gradle; rebuild before signing.')
PY
}
inspect_manifest "$unsigned_apk"
if "$build_tools/apksigner" verify "$unsigned_apk" >/dev/null 2>&1; then
  fail 'Expected an unsigned release APK, but it already has a valid signature.'
fi
if [[ "$mode" == unsigned ]]; then
  printf 'Unsigned release build verified (not installable until signed):\n%s\n' "$unsigned_apk"
  exit 0
fi

signing_dir=$(mktemp -d "${TMPDIR:-/tmp}/mi-balance-sign.XXXXXX")
trap 'rm -rf -- "$signing_dir"' EXIT
"$build_tools/zipalign" -P 16 -f -v 4 "$unsigned_apk" "$signing_dir/aligned.apk" >"$signing_dir/alignment.txt"
"$build_tools/apksigner" sign \
  --ks "$ANDROID_KEYSTORE_PATH" \
  --ks-key-alias "$ANDROID_KEY_ALIAS" \
  --ks-pass env:ANDROID_KEYSTORE_PASSWORD \
  --key-pass env:ANDROID_KEY_PASSWORD \
  --out "$signing_dir/signed.apk" \
  "$signing_dir/aligned.apk"
"$build_tools/apksigner" verify --verbose --print-certs "$signing_dir/signed.apk" >"$signing_dir/verification.txt"
"$build_tools/zipalign" -c -P 16 -v 4 "$signing_dir/signed.apk" >>"$signing_dir/alignment.txt"
inspect_manifest "$signing_dir/signed.apk"
python3 - "$signing_dir/verification.txt" <<'PY'
from pathlib import Path
import re
import sys
verification = Path(sys.argv[1]).read_text()
if not re.search(r'^Signer #1 certificate SHA-256 digest: [0-9a-f]{64}$', verification, re.M):
    sys.exit('Error: no verified SHA-256 signing certificate was found.')
for subject in re.findall(r'^Signer #\d+ certificate DN: (.*)$', verification, re.M):
    if re.search(r'\bCN\s*=\s*Android\s*Debug\b', subject, re.I):
        sys.exit('Error: the APK uses an Android Debug certificate.')
PY
keytool -exportcert -rfc \
  -keystore "$ANDROID_KEYSTORE_PATH" \
  -storepass:env ANDROID_KEYSTORE_PASSWORD \
  -alias "$ANDROID_KEY_ALIAS" \
  -file "$signing_dir/certificate.pem" >/dev/null

# Publish local build artifacts only after every check succeeds. The certificate
# and verification report are public metadata; the private keystore is never copied.
cp -- "$signing_dir/signed.apk" "$signed_apk"
cp -- "$signing_dir/certificate.pem" "${signed_apk%.apk}.certificate.pem"
cp -- "$signing_dir/verification.txt" "${signed_apk%.apk}.verification.txt"
(cd -- "$(dirname -- "$signed_apk")" && sha256sum "$(basename -- "$signed_apk")" >"${signed_apk%.apk}.sha256")
printf 'Release signature, application ID, non-debuggable manifest and 16 KB alignment verified.\n%s\n' "$signed_apk"
printf 'SHA-256: '
cut -d ' ' -f 1 "${signed_apk%.apk}.sha256"
