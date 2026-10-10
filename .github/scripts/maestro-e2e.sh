#!/usr/bin/env bash
set -euo pipefail
export PATH="$ANDROID_HOME/platform-tools:$HOME/.maestro/bin:$PATH"
export MAESTRO_DRIVER_STARTUP_TIMEOUT=300000
export MAESTRO_CLI_NO_ANALYTICS=1
mkdir -p /tmp/maestro-reports /tmp/maestro-debug
persist() {
  mkdir -p "$GITHUB_WORKSPACE/maestro-reports" "$GITHUB_WORKSPACE/maestro-debug"
  cp -r /tmp/maestro-reports/. "$GITHUB_WORKSPACE/maestro-reports/" || true
  cp -r /tmp/maestro-debug/. "$GITHUB_WORKSPACE/maestro-debug/" || true
  cp /tmp/fail-screen.png /tmp/ui-fail.xml /tmp/fail-logcat.txt /tmp/maestro-rec.mp4 "$GITHUB_WORKSPACE/" 2>/dev/null || true
}
trap persist EXIT
stop_recording() {
  kill "${REC_PID:-}" 2>/dev/null || true
  REC_PID=""
  adb shell pkill -f screenrecord >/dev/null 2>&1 || true
}
capture() {
  adb exec-out screencap -p > /tmp/fail-screen.png || true
  adb shell uiautomator dump /sdcard/ui-fail.xml > /dev/null 2>&1 && adb pull /sdcard/ui-fail.xml /tmp/ui-fail.xml > /dev/null 2>&1 || true
  stop_recording
  adb pull /sdcard/maestro-rec.mp4 /tmp/maestro-rec.mp4 >/dev/null 2>&1 || true
  adb logcat -d | grep -E 'ReactNativeJS|Clerk|bgo|AndroidRuntime|FATAL' > /tmp/fail-logcat.txt || true
}
case "${1:-}" in
  install)
    test -n "$E2E_USERNAME"
    test -n "$E2E_PASSWORD"
    test -n "$E2E_TARGET_EMAIL"
    test -n "$E2E_TARGET_USERNAME"
    test -n "$E2E_TARGET_PASSWORD"
    test -n "$E2E_TARGET_PHONE"
    APK="$E2E_APK"
    test -f "$APK"
    echo "APK found: $APK"
    adb install -r "$APK" || { sleep 30; adb install -r "$APK"; }
    adb shell pm clear com.bgo.mobile || true
    # Clerk Android OAuth must return through both app and SDK callbacks.
    adb shell cmd package resolve-activity --brief \
      -a android.intent.action.VIEW \
      -c android.intent.category.BROWSABLE \
      -d 'clerk://com.bgo.mobile.hosted-callback' \
      | tee /tmp/clerk-hosted-callback.txt \
      | grep -q 'com.bgo.mobile'
    adb shell cmd package resolve-activity --brief \
      -a android.intent.action.VIEW \
      -c android.intent.category.BROWSABLE \
      -d 'clerk://com.bgo.mobile.oauth' \
      | tee /tmp/clerk-oauth-callback.txt \
      | grep -q 'com.bgo.mobile'
    cat /tmp/clerk-hosted-callback.txt /tmp/clerk-oauth-callback.txt
    ;;
  warm)
    # Pre-warm the app (first cold start on a software emulator is very slow)
    adb shell am start -n com.bgo.mobile/.MainActivity || true
    sleep 60
    adb shell am force-stop com.bgo.mobile || true
    ;;
  seed)
    TARGET_PHONE="${E2E_TARGET_PHONE:?Target phone required}"
    if [ -n "$TARGET_PHONE" ]; then
      adb shell content insert --uri content://com.android.contacts/raw_contacts \
        --bind account_name:s:bgo-e2e --bind account_type:s:com.bgo.e2e
      RAW_CONTACT_ID=$(adb shell content query \
        --uri content://com.android.contacts/raw_contacts \
        --projection _id | tail -1 | sed -n 's/.*_id=\([0-9][0-9]*\).*/\1/p')
      test -n "$RAW_CONTACT_ID"
      adb shell content insert --uri content://com.android.contacts/data \
        --bind raw_contact_id:i:"$RAW_CONTACT_ID" \
        --bind mimetype:s:vnd.android.cursor.item/phone_v2 \
        --bind data1:s:"$TARGET_PHONE" --bind data2:i:2
      # Exercise local-only, unregistered device contacts in the Search tab.
      adb shell content insert --uri content://com.android.contacts/raw_contacts \
        --bind account_name:s:bgo-e2e --bind account_type:s:com.bgo.e2e
      INVITE_CONTACT_ID=$(adb shell content query \
        --uri content://com.android.contacts/raw_contacts \
        --projection _id | tail -1 | sed -n 's/.*_id=\([0-9][0-9]*\).*/\1/p')
      test -n "$INVITE_CONTACT_ID"
      adb shell content insert --uri content://com.android.contacts/data \
        --bind raw_contact_id:i:"$INVITE_CONTACT_ID" \
        --bind mimetype:s:vnd.android.cursor.item/name \
        --bind data1:s:"E2E Unregistered"
      adb shell content insert --uri content://com.android.contacts/data \
        --bind raw_contact_id:i:"$INVITE_CONTACT_ID" \
        --bind mimetype:s:vnd.android.cursor.item/phone_v2 \
        --bind data1:s:+199999999999999 --bind data2:i:2
      # More than one native page, so Maestro verifies onEndReached loads later rows.
      for i in $(seq 1 43); do
        adb shell content insert --uri content://com.android.contacts/raw_contacts \
          --bind account_name:s:bgo-e2e --bind account_type:s:com.bgo.e2e
        PAGE_CONTACT_ID=$(adb shell content query \
          --uri content://com.android.contacts/raw_contacts \
          --projection _id | tail -1 | sed -n 's/.*_id=\([0-9][0-9]*\).*/\1/p')
        test -n "$PAGE_CONTACT_ID"
        adb shell content insert --uri content://com.android.contacts/data \
          --bind raw_contact_id:i:"$PAGE_CONTACT_ID" \
          --bind mimetype:s:vnd.android.cursor.item/name \
          --bind data1:s:"ZZ Page $i"
        adb shell content insert --uri content://com.android.contacts/data \
          --bind raw_contact_id:i:"$PAGE_CONTACT_ID" \
          --bind mimetype:s:vnd.android.cursor.item/phone_v2 \
          --bind data1:s:"+1999999999$(printf '%05d' "$i")" --bind data2:i:2
      done
    fi
    ;;
  flow)
    FLOW="${2:?Flow required}"
    case "$FLOW" in
      01-launch-welcome|02-login|02-startup-deep-link|05-contacts-follow-block|03-profile-logout|07-reauth-after-logout|06-match-wizard|08-groups|09-group-invitations|10-bgg-collection|12-organizations|13-event-draft|04-dark-mode) ;;
      *) echo "Unknown Maestro flow" >&2; exit 2 ;;
    esac
    test -n "$E2E_USERNAME"
    test -n "$E2E_PASSWORD"
    test -n "$E2E_TARGET_EMAIL"
    test -n "$E2E_TARGET_USERNAME"
    test -n "$E2E_TARGET_PASSWORD"
    if [ "$FLOW" = "12-organizations" ]; then
      # Native community acceptance uses a real media-picker image.
      adb shell mkdir -p /sdcard/Pictures
      adb push apps/mobile/assets/icon.png /sdcard/Pictures/bgo-organization-logo.png
      adb shell am broadcast -a android.intent.action.MEDIA_SCANNER_SCAN_FILE \
        -d file:///sdcard/Pictures/bgo-organization-logo.png >/dev/null
    fi
    if [ "$FLOW" = "04-dark-mode" ]; then
      adb shell cmd uimode night yes || true
    fi
    # Record each flow, so failures late in the suite retain their own video.
    adb shell rm -f /sdcard/maestro-rec.mp4 || true
    adb shell screenrecord --time-limit 1800 /sdcard/maestro-rec.mp4 >/dev/null 2>&1 &
    REC_PID=$!
    trap 'stop_recording; persist' EXIT
    echo "Starting Maestro flow: $FLOW"
    maestro test --format junit --output "/tmp/maestro-reports/$FLOW.xml" \
      --debug-output /tmp/maestro-debug \
      -e "USERNAME=$E2E_USERNAME" -e "PASSWORD=$E2E_PASSWORD" \
      -e "EMAIL_2=$E2E_TARGET_EMAIL" -e "USERNAME_2=$E2E_TARGET_USERNAME" \
      -e "PASSWORD_2=$E2E_TARGET_PASSWORD" \
      "apps/mobile/.maestro/flows/$FLOW.yaml" || { capture; exit 1; }
    stop_recording
    adb shell rm -f /sdcard/maestro-rec.mp4 || true
    ;;
  verify)
    python3 .github/scripts/verify-maestro-reports.py maestro-reports \
      01-launch-welcome 02-login 02-startup-deep-link 05-contacts-follow-block \
      03-profile-logout 07-reauth-after-logout 06-match-wizard 08-groups \
      09-group-invitations 10-bgg-collection 12-organizations 13-event-draft 04-dark-mode
    ;;
  cleanup)
    stop_recording
    if [ -n "${BGO_EMULATOR_PID:-}" ]; then
      kill "$BGO_EMULATOR_PID" 2>/dev/null || true
    fi
    cp /tmp/emulator.log /tmp/avd-create.log "$GITHUB_WORKSPACE/maestro-debug/" 2>/dev/null || true
    ;;
  *) echo "Unknown Maestro phase" >&2; exit 2 ;;
esac
