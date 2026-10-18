#!/bin/bash
set -euo pipefail
project_root="$(cd "$(dirname "$0")/.." && pwd)"
if [[ "$(uname -s)" != "Darwin" ]]; then
  echo "يتطلب تحويل إضافة Safari جهاز Mac وXcode." >&2
  exit 1
fi
if ! xcrun --find safari-web-extension-converter >/dev/null 2>&1; then
  echo "ثبّت Xcode وحدد مساره باستخدام xcode-select أولًا." >&2
  exit 1
fi
if [[ -e "$project_root/SafariProject" ]]; then
  echo "مجلد SafariProject موجود. احتفظ به أو انقله قبل توليد مشروع جديد." >&2
  exit 1
fi
xcrun safari-web-extension-converter "$project_root/extension" \
  --project-location "$project_root/SafariProject" \
  --app-name "Tibyan Tahdir" \
  --bundle-identifier "sa.alluhaybi.tibyantahdir" \
  --swift --no-open --no-prompt
echo "افتح مشروع Xcode الناتج، وحدد فريق التوقيع والجهاز، ثم Build / Run."
