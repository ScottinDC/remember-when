# WebKit recording findings

Initial run: five of seven WebKit checks passed. Microphone denial stayed in the starting state, suggesting the synthetic override was not used. Stopped-draft refresh returned to an empty recorder. Desktop and mobile Chromium passed all seven checks. The production code starts an asynchronous IndexedDB save but makes the stopped draft available before that save completes; immediate reload may race the write. These are hypotheses pending focused validation.

Evidence uses only synthetic accounts, generated audio and intercepted backend requests. No family recordings or MFA credentials are in the test artifacts.

Microphone-denial cause confirmed in the fixture: overriding a method on WebKit's returned mediaDevices object did not consistently affect the later lookup. Defining a stable synthetic navigator.mediaDevices value made the isolated denial test pass. The production microphone code was unchanged for this fix.

The draft callback now waits for the IndexedDB transaction before exposing the stopped recording, and keeps the unload/navigation guard active during that write. This avoids a timing delay in the test and instead protects immediate refresh in the product. Repeated WebKit validation is in progress.

Waiting for the IndexedDB transaction did not resolve the WebKit refresh failure (two focused runs failed). The write timing hypothesis alone is insufficient. Next inspect synthetic draft presence and blob metadata before/after navigation to distinguish persistence from rendering/state recovery.

The synthetic draft lookup returned absent both before and after refresh. Investigating keys and the UI error before reload; no timeout increase or retry suppression applied. Separately, deployment asset hashes and ten anonymous API denial checks passed. The initial verification script failed because the Python installation lacked a certificate store; using the system CA file restored TLS verification without disabling it.

The UI confirmed the draft write failed before reload and IndexedDB had no keys. The storage implementation now persists audio as an ArrayBuffer with MIME type, preserving support for older Blob drafts. The operation queue includes byte conversion so a later discard cannot be reversed by a delayed save. The existing draft test checks this ordering; browser checks exercise MediaRecorder output.

The byte-buffer change resolved the focused WebKit test. Repeated recording/refresh/upload/AI-retry checks pass with real synthetic MediaRecorder output. This confirms a WebKit Blob persistence compatibility issue in this test environment, not a missing UI selector. Physical iPhone validation remains separate.

## Completion

All 39 unit/database checks and 21 browser checks passed locally on October 5. The corrected frontend was deployed as `6ac3bbad94d417092f7d2300`; live HTML/assets matched the build, and ten anonymous API checks returned 401. Actual-device recording remains a separate check.

## October 6 CI follow-up

GitHub run 37329509820 passed 20/21 checks on Ubuntu. WebKit failed before `Stop recording` became visible, unlike the passing macOS recording run; this was not the prior draft-reload failure. CI now runs the same WebKit recording checks on macOS and Chromium desktop/mobile on Linux, with failure artifacts retained for diagnosis. This preserves the real MediaRecorder test rather than adding a skip or replacing it with fake audio bytes. The exact Linux media-startup cause was not established from the available log.

The two MFA denial checks used a nonexistent export-button label, which made their absence assertions ineffective. They now use the actual label, assert no archive RPC is requested at AAL1, and include a positive AAL2 archive-load check.

October 6 local validation: 39 unit/database checks, all 24 browser checks, TypeScript unused-code checking and the production build passed. The production JS/CSS asset names and contents remain unchanged by the cleanup. The default and headed suites contain only isolated tests; the production configuration lists four separate smoke checks. The npm audit reports zero known advisories after the source-map-js patch.
