# AppDeploy deployment checklist

## Reading lessons update 0.7.0

Implementation: update the existing frontend-only app-0gwwi6 with a second-grade lesson selector for all eight units and sixteen lessons, separate word/sentence/passage reading skills, sourced excerpts and page labels, lesson-aware reports and draft/next-student continuity. Reconcile the mobile assessment QA workflow. Include the new reading-lessons.js module in web and portable staging; no new binary resources or SDK/backend.

Preflight: 44 unit tests, mobile lesson assessment/draft/report/next-student/offline flow and portable regression pass. Validate the five JSON QA workflows with one sanity test. Build and test Vite production with the new module; compare with current remote sources and send changed text files only. Retain the existing URL and data schema. Poll publication to terminal status and inspect runtime/QA errors.

## Existing app update 0.6.0 (20 October 2026)

Implementation: retain app-0gwwi6 and its URL; publish complete Word/Excel roster imports, uninterrupted listening, skill-based training plans, and owner-configured opt-in Google Drive backup/restore. No backend or platform SDK is added. Existing IndexedDB schema and student records are retained. Do not republish source-controlled binaries that are unchanged.

Preflight: inspect current ready snapshot 1792114028784 and its JSON tests; reconcile all five QA workflows with changed imports, listening, training-plan and Drive entry/authorization boundary. Run 41 unit tests and local browser checks including mock Drive round trips. Format the staging sources, compare each text file with the existing snapshot and send only changed/new files. Validate tests/manifest JSON, build Vite output and verify the configured public client ID without secrets or student data. Screenshots provided by the owner confirm Drive API enabled, owner in test users, and the matching AppDeploy origin on the dedicated web client. Do not claim real OAuth/Drive acceptance based on mock tests. Keep polling deployment through final QA; real account approval requires the owner.

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

## Staff footer import fix
- Exclude labeled teacher/principal rows across the selected table; preserve student names and guardian columns.
- Verify the attached workbook locally imports 28 students, excluding staff and blank template rows. Never publish its contents.
- Test synthetic Excel and Word footer rows through the browser import workflow.
- Read current source and QA tests, send only the changed importer and reconciled tests, retain app-0gwwi6, and poll through final QA status.

## Astra review update 0.3.0
Implementation: retain app-0gwwi6 and its local data schema; single-task compound cards; balanced solar/lunar subskills; editable listening/dictation criteria; student-only view; full roster confirmation; result search/date/semester/section filters; homogeneous class scope with item counts and dates; matched progress and detailed failed items; ready presets and backup reminder.
Preflight: 24 unit tests pass; full desktop/mobile flow, original snapshot restore, Vite production review flow including compound cards/dates/CSV, portable build and offline all pass. Five reconciled QA workflows, exactly one sanity; no real student data or secrets. Send changed source files plus task-cards.js only; retain current dependencies and existing assets; parse manifest/test JSON and check the current published version before upload. Poll QA until terminal and inspect errors.

