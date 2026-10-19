#!/usr/bin/env bash
set -euo pipefail
cd /workspace/APP_Gastos
npm ci --cache /workspace/.npm-cache
python3 scripts/prepare-android.py
. ./scripts/android-env.sh
python3 - <<'PY'
import subprocess
command=['/workspace/android-sdk/cmdline-tools/19.0/bin/sdkmanager','--sdk_root=/workspace/android-sdk']
subprocess.run(command+['--licenses'],input='y\n'*100,text=True,check=True)
subprocess.run(command+['platforms;android-36','build-tools;35.0.0','build-tools;36.0.0','platform-tools'],check=True)
PY
npm run android:sync
