#!/usr/bin/env bash
# native/ ফোল্ডারের Java ফাইলগুলো Capacitor-এর তৈরি android প্রজেক্টে বসায়।
# Design & Developed by Md. Saiful Islam
set -euo pipefail
trap 'echo "::error title=inject-native ব্যর্থ::লাইন $LINENO-এ সমস্যা। উপরের লগ দেখুন (android ফোল্ডার তৈরি হয়েছে তো?)"' ERR

ROOT="${1:-.}"
cd "$ROOT"
[ -f capacitor.config.json ] || { echo "::error::capacitor.config.json পাওয়া যায়নি (ফোল্ডার: $(pwd))"; exit 1; }
[ -d android/app/src/main ] || { echo "::error::android/app/src/main নেই — আগে 'npx cap add android' চালাতে হবে"; exit 1; }

APP_ID="$(node -e "console.log(require('./capacitor.config.json').appId)")"
PKG_PATH="$(echo "$APP_ID" | tr . /)"
DEST="android/app/src/main/java/$PKG_PATH"
echo "appId=$APP_ID"
echo "গন্তব্য: $DEST"
mkdir -p "$DEST"

# যদি generator Kotlin MainActivity বানিয়ে থাকে, সেটি সরাই (আমরা Java ব্যবহার করছি)
if [ -f "$DEST/MainActivity.kt" ]; then
  echo "সতর্কতা: MainActivity.kt পাওয়া গেছে; সরিয়ে Java সংস্করণ বসাচ্ছি"
  rm -f "$DEST/MainActivity.kt"
fi

for f in LiftSensorPlugin.java MainActivity.java; do
  [ -f "native/$f" ] || { echo "::error::native/$f নেই"; exit 1; }
  # package লাইন appId-এর সাথে মিলিয়ে নিই
  sed -E "s/^package [A-Za-z0-9_.]+;/package $APP_ID;/" "native/$f" > "$DEST/$f"
  echo "বসানো হয়েছে: $DEST/$f"
done

# v2.2: অ্যাপ আইকন ও শুরুর পর্দা (PC সংস্করণের একই নীল আইকন)
RES="android/app/src/main/res"
if [ -d native/res ]; then
  # Capacitor-এর ডিফল্ট splash.png গুলো সরাই (আমাদের splash.xml একই নামের রিসোর্স)
  find "$RES" -name 'splash.png' -delete
  cp -R native/res/. "$RES/"
  echo "আইকন ও splash বসানো হয়েছে: $(find native/res -type f | wc -l) টি ফাইল"
else
  echo "::warning::native/res নেই — ডিফল্ট Capacitor আইকন থাকবে"
fi

# v2.2: মাইক্রোফোন (শব্দ মাপা) — WebView getUserMedia-র জন্য অনুমতি
MANI="android/app/src/main/AndroidManifest.xml"
for perm in android.permission.RECORD_AUDIO android.permission.MODIFY_AUDIO_SETTINGS; do
  if ! grep -q "$perm" "$MANI"; then
    sed -i "s#<application#<uses-permission android:name=\"$perm\" />\n    <application#" "$MANI"
    echo "অনুমতি যোগ: $perm"
  fi
done
grep -q "RECORD_AUDIO" "$MANI" || { echo "::error::AndroidManifest-এ RECORD_AUDIO যোগ করা যায়নি"; exit 1; }

# যাচাই
grep -q "registerPlugin(LiftSensorPlugin.class)" "$DEST/MainActivity.java" || { echo "::error::MainActivity-তে registerPlugin নেই"; exit 1; }
head -1 "$DEST/LiftSensorPlugin.java" | grep -q "package $APP_ID;" || { echo "::error::package লাইন ঠিক হয়নি"; exit 1; }
echo "native plugin প্রস্তুত।"
