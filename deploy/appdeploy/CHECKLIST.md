# AppDeploy deployment checklist

Implementation:
- New independent frontend-only html-static app; no backend, no SDK, no cloud student records.
- Generate a Vite staging copy from the existing app; preserve all grades, assessment, roster, reports, settings, backup and PWA workflows.
- Replace template index/main/styles/config through unique diffs; include only new app modules, curriculum, generated assets, font/license and complete tests/tests.json.
- Build a service worker after Vite with actual generated asset filenames and relative scope URLs.
- Upload generated/source-controlled binaries through upload_assets multipart parts; no user-attached binary resources are included.
- Keep the existing GitHub app source and old applications independent.

Preflight:
- Read html-static frontend-only scaffold; validate five independent tests, one sanity test, every covers list nonempty, including mobile and negative validation.
- Check all placeholder replacements, unique diff anchors, only one path field per file and either content or diffs.
- Format generated source as readable multiline code; no credentials, real student names or local paths in deployment.
- Check Vite build and local browser flow against generated output, including offline reload.
- Include new app_id:null, description, frontend_template, model, intent, initiator and type.
- Poll deployment every five seconds until ready/failed; review QA/runtime errors and automatically repair if needed.

Result: all preflight items passed. Local Vite browser workflow passed including offline reload. Generated assets and source uploaded without credentials or rosters. AppDeploy returned ready with empty frontend/network/backend error lists.

## Version 0.2 update
- Import XLSX/XLS/DOCX locally; retain paste option, preview sheets/name/guardian columns and reject malformed files.
- Preserve score keys and old saved results; primary mastery buttons advance only after saving; backtracking replaces previous judgements.
- Next student reuses selected cards with fresh answers, follows captured section order and stops at the end.
- Verify real generated spreadsheet/Word fixtures, auto-advance, saved draft, reports, backup and offline Vite output before updating app-0gwwi6.
- Update the current snapshot files only; retain the existing app ID and URL.
