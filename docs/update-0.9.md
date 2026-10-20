# Assessment controls 0.9.0

Implementation checklist: skip saves a resumable draft and advances in roster order, including sentence rotation; last student ends safely. Four distinct persisted judgements and keyboard 1–4 / ١–٤. Preserve legacy answers. Reports show actual judgement labels. The three passing judgements count as passed items without invented numeric weights; incorrect remains zero.

Preflight checklist: verify all shortcuts, editing/dialog/student-view guards, held-key and concurrent input guards, report/backup retention, skipped draft resume and end-of-roster. Run unit and browser tests, build web/portable/Vite, reconcile platform QA JSON, send only changed snapshot files and poll to terminal state.

Validation: 47 unit tests passed. New browser workflow passed on local web and Vite production for skip/save/reload/resume, quick-sentence rotation, all four ratings, Arabic/English digits, note/student-view guards, reports and backup. Existing single-sentence regression and portable assessment/storage/narration tests passed. Vite build passed. AppDeploy snapshot 1792487151681 is ready with empty frontend/network/backend error lists. Existing conservative manifest warning remains; no new binary assets or SDK calls were introduced.
