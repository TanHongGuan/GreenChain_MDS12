# Mock data architecture

Set `VITE_DATA_MODE=mock` for session-scoped demo data or `VITE_DATA_MODE=real` for FastAPI. Default is real. `src/services/dataService.js` selects the implementation once at build/start time; pages import only this service. Real operations reuse the existing `src/api/*` clients unchanged. Mock operations use `src/mocks/mockService.js` and one internally consistent store in `src/mocks/store.js`.

The store is seeded with four clearly fictional projects in two fictional organisations. It includes approved multi-period data, missing CO2e, a single-period project, an unreviewed project and a rejected submission with a reason. All mock mutations stay in the browser's `sessionStorage`, scoped to that tab/session; no mock operation calls `fetch` or the backend. Demo role identity is also session-scoped. Mock evidence is metadata only, not a downloadable file, and is labelled accordingly. Resetting session storage resets the demo.

This is not a security boundary. Real mode keeps existing cookie authentication and backend RBAC. Mock login accepts a nonempty demo password and chooses a role from the email prefix `viewer`, `uploader`, or `auditor`. Never use mock mode with production data or describe session data as persisted backend evidence.
