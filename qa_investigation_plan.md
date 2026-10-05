# WebKit recording checks

Investigate the new synthetic browser suite's microphone-denial and immediate-refresh failures. Preserve real MediaRecorder coverage and never use the physical microphone. First isolate the fixture override and draft persistence timing, then fix confirmed causes and rerun the affected checks plus the browser suite.

The authenticator tests pass on Chromium desktop/mobile and WebKit. That independently tested correction is being released separately from this investigation.

Root causes and fixes are documented in the findings. Focused validation passes; final cross-browser suite and deployment verification are the remaining steps. Unit coverage protects old Blob drafts and save/discard ordering.

Final local verification complete: 21/21 browser checks and 39/39 unit/database checks passed; production build passed. Physical-device recording and real provider calls remain outside this synthetic suite.
