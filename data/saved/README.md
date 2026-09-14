# Saved API responses (fallback only)

Read only when a live call fails. The page labels anything shown from here **SAVED · <savedAt UTC>**.
Each file wraps the raw response:

```json
{ "savedAt": "2026-09-14T17:02:11Z", "request": "GET /v1/health", "data": { … } }
```

| File | Request |
|---|---|
| `health.json` | `GET /v1/health` |
| `coverage.json` | `GET /v1/coverage` |
| `coverage-hours.json` | `GET /v1/coverage/hours?days=7` |
| `market.json` | array of `{ "seg": <exchange entry>, "code": "okx-perp", "inst": <instrument entry>, "row": <snapshot row> }`, one per BTC perp venue |

The folder is empty on purpose: nothing is shown from it until a real response is saved here.
