#!/usr/bin/env bash
# Starts the Firestore + Auth emulators the test suite needs.
#
# firebase-tools 15+ refuses any Java below 21 and picks `java` off PATH, not
# JAVA_HOME, so a machine with an older default JDK fails with a message that
# does not mention PATH. This finds a 21+ JDK and puts it in front.
set -euo pipefail

if JH=$(/usr/libexec/java_home -v 21+ 2>/dev/null); then
  export JAVA_HOME="$JH"
  export PATH="$JAVA_HOME/bin:$PATH"
fi

if ! java -version 2>&1 | grep -qE '"(2[1-9]|[3-9][0-9])'; then
  echo "Need a JDK 21 or newer on PATH. Found: $(java -version 2>&1 | head -1)" >&2
  exit 1
fi

cd "$(dirname "$0")/.."

# --project demo-sorted is deliberate and must NOT be changed to the real
# project id in .firebaserc. The demo- prefix tells the emulator suite to run
# fully offline with no credentials, which is what keeps the test suite from
# ever reaching production data. Tests wipe the sellers collection between
# cases; pointed at the real project, they would wipe it there.
exec firebase emulators:start --only firestore,auth --project demo-sorted "$@"
