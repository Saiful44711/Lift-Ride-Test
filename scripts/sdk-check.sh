#!/usr/bin/env bash
# Android SDK-র প্রয়োজনীয়তা প্রজেক্ট থেকে পড়ে, কী আছে দেখে, দরকার হলে (সম্ভব হলে) যোগ করে।
# কোনো SDK/build-tools সংস্করণ এখানে হাতে বসানো নেই।
# Design & Developed by Md. Saiful Islam
set -uo pipefail

ROOT="${1:-.}"
cd "$ROOT"
VARS="android/variables.gradle"
SDK="${ANDROID_SDK_ROOT:-${ANDROID_HOME:-}}"

echo "== Android SDK যাচাই =="
if [ -f "$VARS" ]; then
  echo "-- $VARS থেকে প্রয়োজনীয়তা:"
  grep -E "minSdkVersion|compileSdkVersion|targetSdkVersion" "$VARS" || true
  COMPILE="$(grep -E 'compileSdkVersion' "$VARS" | head -1 | grep -oE '[0-9]+' | head -1 || true)"
else
  echo "সতর্কতা: $VARS পাওয়া যায়নি; Gradle নিজে প্রয়োজনীয় SDK ঠিক করার চেষ্টা করবে।"
  COMPILE=""
fi

if [ -z "$SDK" ] || [ ! -d "$SDK" ]; then
  echo "সতর্কতা: ANDROID_SDK_ROOT/ANDROID_HOME পাওয়া যায়নি। Gradle SDK খুঁজে না পেলে বিল্ড ব্যর্থ হবে।"
  exit 0
fi
echo "SDK ফোল্ডার: $SDK"
echo "-- আছে (platforms):";   ls "$SDK/platforms" 2>/dev/null || echo "(নেই)"
echo "-- আছে (build-tools):"; ls "$SDK/build-tools" 2>/dev/null || echo "(নেই)"

SDKM="$(command -v sdkmanager || true)"
[ -z "$SDKM" ] && [ -x "$SDK/cmdline-tools/latest/bin/sdkmanager" ] && SDKM="$SDK/cmdline-tools/latest/bin/sdkmanager"

# local.properties — Gradle যেন SDK খুঁজে পায়
if [ -d android ] && [ ! -f android/local.properties ]; then
  echo "sdk.dir=$SDK" > android/local.properties
  echo "android/local.properties তৈরি হয়েছে"
fi

if [ -n "$COMPILE" ] && [ ! -d "$SDK/platforms/android-$COMPILE" ]; then
  echo "সতর্কতা: platforms/android-$COMPILE নেই।"
  if [ -n "$SDKM" ]; then
    echo "sdkmanager দিয়ে ইনস্টলের চেষ্টা করছি…"
    (yes | "$SDKM" --licenses >/dev/null 2>&1) || true
    "$SDKM" --install "platforms;android-$COMPILE" || echo "সতর্কতা: ইনস্টল ব্যর্থ — Gradle নিজে ডাউনলোডের চেষ্টা করবে (লাইসেন্স গৃহীত থাকলে)।"
  else
    echo "সতর্কতা: sdkmanager পাওয়া যায়নি — Gradle নিজে ডাউনলোডের চেষ্টা করবে।"
  fi
else
  [ -n "$COMPILE" ] && echo "✓ platforms/android-$COMPILE আছে"
fi
# লাইসেন্স গ্রহণ (Gradle-এর স্বয়ংক্রিয় ডাউনলোডের জন্য দরকার)
[ -n "$SDKM" ] && (yes | "$SDKM" --licenses >/dev/null 2>&1 || true)
exit 0
