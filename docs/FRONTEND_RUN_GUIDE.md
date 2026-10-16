# Frontend run guide

Install existing dependencies with `npm ci`, then run `npm run dev -- --host 127.0.0.1`. Open the printed URL. The mode is selected at Vite startup; restart the dev server after changing it.

## Demo mode

Set `VITE_DATA_MODE=mock` in your local `.env` or start with `VITE_DATA_MODE=mock npm run dev -- --host 127.0.0.1`. Sign in with an email beginning `viewer`, `uploader`, or `auditor` (for example `uploader@demo.greenchain.test`) and any nonempty demo password. This is only a session-scoped preview; no request goes to FastAPI. Upload a CSV with `metric_name,value,unit[,category]`, confirm it, then log out and sign in as auditor to approve/reject. Sign in as viewer to inspect approved values. The browser tab's session storage holds changes until cleared.

## Real mode

Set `VITE_DATA_MODE=real` (the default) and `VITE_API_BASE_URL` to the actual FastAPI origin. Start the existing backend/PostgreSQL/storage stack per repository setup. Use one hostname consistently for frontend, API and allowed CORS origin (`localhost` or `127.0.0.1`), because cookie auth is host-sensitive. Real mode uses actual backend accounts, RBAC and all existing API clients. It does not seed or reset data.

The current real API does not provide platform-wide totals, a project description, strict metric units, a browser-side XLSX preview or WORM evidence. The UI does not fabricate these. See `FRONTEND_DATA_CONTRACT.md` and `FRONTEND_BACKEND_GAPS.md`.

## Verification

Run `npm test` and `npm run build`. Backend regression tests can be run with `.venv/bin/pytest -q`. Mock tests require no live backend. Browser UX can be inspected at `/`, `/projects`, `/projects/101`, `/upload` and `/review` in demo mode.
