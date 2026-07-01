#!/usr/bin/env bash
# ============================================================================
# setup-firebase.sh - הכנת פרויקט Firebase חדש לשכפול מערכת מעלית-שבת.
#
# מריצים *על המחשב שלך* (לא בסביבת-הפיתוח של הסוכן), כשאתה מחובר בתור Owner
# של הפרויקט. הסקריפט עושה אוטומטית את כל מה שאפשר דרך שורת-הפקודה:
#
#   ./scripts/setup-firebase.sh <PROJECT_ID>
#
# מה קורה אוטומטית:
#   1. מגדיר את הפרויקט הפעיל (gcloud + firebase).
#   2. מפעיל את כל ה-APIs הדרושים ל-Cloud Functions v2.
#   3. נותן ל-Service Account של ה-CI את 4 התפקידים הדרושים
#      (Editor, Service Account User, Cloud Functions Admin, Cloud Run Admin).
#   4. מושך את firebaseConfig של אפליקציית ה-Web (להדבקה ב-public/firebase-config.js).
#   5. פורס: hosting + storage + functions:extractTheme.
#   6. (אופציונלי, דגל --github-secret OWNER/REPO) יוצר מפתח ל-SA ומעלה אותו
#      כ-secret FIREBASE_SERVICE_ACCOUNT ב-GitHub (דורש gh CLI מחובר), ומוחק מקומית.
#
# מה *לא* ניתן אוטומטית (ידני - ראו docs/SETUP-NEW-PROJECT.md, עם קישורים):
#   - יצירת הפרויקט עצמו ב-Firebase.
#   - הפעלת Blaze (חיוב - דורש כרטיס). בלי זה שלב 5 (functions) ייכשל.
#   - הפעלת ספקי-התחברות (Email/Password + Google) ב-Authentication.
#   - כללי-אבטחה של RTDB (תלויי-מודל; ראו המסמך).
#
# דרישות מוקדמות על המחשב שלך: gcloud, firebase-tools, node, (ל-secret) gh.
# ============================================================================
set -euo pipefail

# ---- ארגומנטים -------------------------------------------------------------
PROJECT_ID=""
SA_EMAIL=""
DO_GH_SECRET=0
GH_REPO=""

usage() {
  cat <<USAGE
שימוש:  ./scripts/setup-firebase.sh <PROJECT_ID> [אפשרויות]

אפשרויות:
  --sa <email>              כתובת ה-Service Account של ה-CI
                            (ברירת-מחדל: firebase-adminsdk-fbsvc@<PROJECT_ID>.iam.gserviceaccount.com)
  --github-secret <owner/repo>  יצירת מפתח ל-SA והעלאתו כ-secret FIREBASE_SERVICE_ACCOUNT ב-GitHub
  -h, --help                עזרה

דוגמה:  ./scripts/setup-firebase.sh ramada-elev --github-secret elibic/ramada-web
USAGE
}

while [ $# -gt 0 ]; do
  case "$1" in
    --sa) SA_EMAIL="${2:-}"; shift 2 ;;
    --github-secret) DO_GH_SECRET=1; GH_REPO="${2:-}"; shift 2 ;;
    -h|--help) usage; exit 0 ;;
    -*) echo "אפשרות לא מוכרת: $1" >&2; usage; exit 1 ;;
    *) if [ -z "$PROJECT_ID" ]; then PROJECT_ID="$1"; shift; else echo "ארגומנט עודף: $1" >&2; exit 1; fi ;;
  esac
done

if [ -z "$PROJECT_ID" ]; then echo "חסר PROJECT_ID." >&2; usage; exit 1; fi
SA_EMAIL="${SA_EMAIL:-firebase-adminsdk-fbsvc@${PROJECT_ID}.iam.gserviceaccount.com}"

# ---- בדיקת כלים ------------------------------------------------------------
need() { command -v "$1" >/dev/null 2>&1 || { echo "❌ חסר הכלי '$1'. התקן אותו והרץ שוב." >&2; exit 1; }; }
need gcloud; need firebase; need node
[ "$DO_GH_SECRET" = 1 ] && need gh

# עבור לשורש הריפו (הסקריפט יושב ב-scripts/)
cd "$(dirname "$0")/.."

echo "════════════════════════════════════════════════════════════"
echo " הכנת פרויקט:  $PROJECT_ID"
echo " Service Account:  $SA_EMAIL"
echo "════════════════════════════════════════════════════════════"

# ---- 1. פרויקט פעיל --------------------------------------------------------
echo; echo "▶ [1/5] מגדיר פרויקט פעיל..."
gcloud config set project "$PROJECT_ID" >/dev/null
firebase use "$PROJECT_ID" >/dev/null 2>&1 || firebase use --add "$PROJECT_ID" >/dev/null

# ---- 2. הפעלת APIs ---------------------------------------------------------
echo "▶ [2/5] מפעיל APIs (עשוי לקחת דקה)..."
gcloud services enable \
  cloudfunctions.googleapis.com \
  cloudbuild.googleapis.com \
  artifactregistry.googleapis.com \
  run.googleapis.com \
  eventarc.googleapis.com \
  pubsub.googleapis.com \
  storage.googleapis.com \
  serviceusage.googleapis.com \
  --project "$PROJECT_ID"

# ---- 3. תפקידי IAM ל-SA ----------------------------------------------------
echo "▶ [3/5] נותן תפקידים ל-$SA_EMAIL ..."
for role in roles/editor roles/iam.serviceAccountUser roles/cloudfunctions.admin roles/run.admin; do
  echo "    + $role"
  gcloud projects add-iam-policy-binding "$PROJECT_ID" \
    --member="serviceAccount:${SA_EMAIL}" --role="$role" \
    --condition=None >/dev/null
done

# ---- 4. משיכת firebaseConfig ----------------------------------------------
echo "▶ [4/5] firebaseConfig של אפליקציית ה-Web (העתק ל-public/firebase-config.js):"
echo "------------------------------------------------------------"
firebase apps:sdkconfig WEB --project "$PROJECT_ID" 2>/dev/null || \
  echo "  (אין עדיין Web app. צור אחד: firebase apps:create WEB \"<שם>\" --project $PROJECT_ID ואז הרץ שוב את השלב הזה.)"
echo "------------------------------------------------------------"

# ---- 5. פריסה --------------------------------------------------------------
echo "▶ [5/5] פורס hosting + storage + functions:extractTheme ..."
( cd functions && npm ci --silent )
echo "  (אם זה נופל על 'billing' - הפעל Blaze בקונסול ואז הרץ שוב את הסקריפט.)"
firebase deploy --only "hosting,storage,functions:extractTheme" --project "$PROJECT_ID"

# ---- 6. (אופציונלי) secret ב-GitHub ---------------------------------------
if [ "$DO_GH_SECRET" = 1 ] && [ -n "$GH_REPO" ]; then
  echo "▶ [+] יוצר מפתח ל-SA ומעלה כ-secret ב-$GH_REPO ..."
  KEY_FILE="$(mktemp -t sa-key-XXXXXX.json)"
  trap 'rm -f "$KEY_FILE"' EXIT
  gcloud iam service-accounts keys create "$KEY_FILE" --iam-account="$SA_EMAIL"
  gh secret set FIREBASE_SERVICE_ACCOUNT --repo "$GH_REPO" < "$KEY_FILE"
  rm -f "$KEY_FILE"; trap - EXIT
  echo "    ✔ ה-secret הועלה, והמפתח המקומי נמחק."
fi

echo
echo "════════════════════════════════════════════════════════════"
echo " ✔ סיום החלק האוטומטי."
echo " צעדים ידניים שנותרו (ראו docs/SETUP-NEW-PROJECT.md):"
echo "   - Blaze (אם עוד לא), ספקי Authentication (Email/Password + Google)."
echo "   - הדבקת firebaseConfig מלמעלה ל-public/firebase-config.js + commit."
echo "   - כללי-אבטחה ל-RTDB, ורישום הפרויקט בדשבורד."
echo "   - הגדרת מראה/מעליות/משתמשים דרך setup.html ו-admin.html."
echo "════════════════════════════════════════════════════════════"
