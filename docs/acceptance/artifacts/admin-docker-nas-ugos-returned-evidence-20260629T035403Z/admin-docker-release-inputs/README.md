# Admin Docker NAS Release Inputs From UGOS Browserless Readonly

This directory is generated from authenticated UGOS Docker read-only endpoints
plus the existing Admin live-readonly disk status endpoint.

Source UGOS base URL:
http://192.168.1.27:9999

Source Admin live-readonly base URL:
http://192.168.1.27:18080

Safety rules:
- This evidence must not approve Docker upload or deploy by itself.
- Do not include NAS passwords, cookies, tokens, API keys, or full Docker inspect output.
- Only allowlisted worker environment keys are emitted.
- Positive release approval still requires the normal gates to pass.
