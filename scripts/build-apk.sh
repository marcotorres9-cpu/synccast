#!/usr/bin/env bash
# Build the SyncCast APK with optimized size
set -e
cd /tmp/synccast-repo

echo "=== [1/5] Building Next.js static export ==="
export NEXT_OUTPUT=export
export NEXT_PUBLIC_SOCKET_URL=https://synccast-sync.onrender.com

# Temporarily move API routes out (static export doesn't support them)
mv src/app/api /tmp/api-backup-build 2>/dev/null
cp src/lib/db.ts /tmp/db-backup-build.ts
echo "export const db = {} as any" > src/lib/db.ts

# Clean previous build
rm -rf out/

# Build
./node_modules/.bin/next build 2>&1 | tail -3

# Restore API routes
rm -rf src/app/api
cp -r /tmp/api-backup-build src/app/api
git checkout src/lib/db.ts 2>&1 | tail -1
unset NEXT_OUTPUT

echo ""
echo "=== [2/5] Removing APKs and uploads from out/ (they would bloat the APK) ==="
rm -rf out/downloads/
rm -rf out/uploads/

echo "Web assets size (without APKs):"
du -sh out/

echo ""
echo "=== [3/5] Copying web assets to Android project ==="
./node_modules/.bin/cap copy android 2>&1 | tail -2

echo ""
echo "=== [4/5] Building APK ==="
cd android
export ANDROID_HOME=/home/z/android-sdk
export JAVA_HOME=/home/z/jdk/jdk-21
export PATH=$JAVA_HOME/bin:$ANDROID_HOME/cmdline-tools/latest/bin:$ANDROID_HOME/platform-tools:$ANDROID_HOME/build-tools/34.0.0:$PATH

echo "sdk.dir=/home/z/android-sdk" > local.properties
chmod +x gradlew

./gradlew assembleDebug --no-daemon -x lint --console=plain 2>&1 | tail -5

echo ""
echo "=== [5/5] Final APK size ==="
find . -name "app-debug.apk" -exec du -h {} \;
