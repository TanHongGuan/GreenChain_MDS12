# Frontend feature checklist

| Phase | Scope | Status | Verification | Backend dependency |
|---|---|---|---|---|
| A | Source-backed contract and gaps | Complete | Existing API/source inspection | None changed |
| B | Mock/real service and consistent records | Complete | Mock service tests; production build | Existing endpoints preserved |
| C | Home/discovery/highlights | Complete | Existing discovery tests; mock filter/highlight tests | Real home totals absent |
| D | Three metrics, trend/comparison/verification charts | Complete | Metric transformation tests; production build | Approved history API; missing unit policy |
| E | Upload preview/confirm and submission detail | Complete | Upload/CSV preview tests; build | XLSX local preview absent; existing multipart/evidence APIs |
| F | Auditor queue and decisions | Complete | Review workflow tests; build | Existing review APIs; backend reason remains optional |
| G | Cross-role mock lifecycle tests | Complete | MockLifecycle tests: approval, rejection, missing data/errors | None |
| H | Real compatibility/build/documentation | Pending | — | Backend gaps recorded separately |
