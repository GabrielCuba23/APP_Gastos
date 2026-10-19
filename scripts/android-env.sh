# Source from the repository root before running Gradle in this cloud environment.
mkdir -p /workspace/android-home/.android /workspace/.gradle
export ANDROID_HOME=/workspace/android-sdk
export ANDROID_USER_HOME=/workspace/android-home/.android
export GRADLE_USER_HOME=/workspace/.gradle
export JAVA_HOME=/workspace/jdk-21
export PATH="$JAVA_HOME/bin:$PATH"
export JAVA_OPTS="${JAVA_OPTS:-} -Duser.home=/workspace/android-home -Djavax.net.ssl.trustStore=/etc/ssl/certs/java/cacerts"
if [ -n "${HTTPS_PROXY:-}" ]; then
  _balance_proxy_flags=$(python - <<'PY'
import os, urllib.parse
u=urllib.parse.urlsplit(os.environ['HTTPS_PROXY'])
if u.hostname and u.port:
 print(f'-Dhttp.proxyHost={u.hostname} -Dhttp.proxyPort={u.port} -Dhttps.proxyHost={u.hostname} -Dhttps.proxyPort={u.port}')
PY
)
  export JAVA_OPTS="$JAVA_OPTS $_balance_proxy_flags"
  unset _balance_proxy_flags
fi
