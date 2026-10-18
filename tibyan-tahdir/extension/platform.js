'use strict';
// Safari exposes browser; Chromium exposes chrome. No network access.
globalThis.TibyanPlatform = globalThis.browser || globalThis.chrome || null;
