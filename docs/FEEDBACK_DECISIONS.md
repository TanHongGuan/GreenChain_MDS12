# October 2026 page feedback decisions

These decisions apply to the Home, Projects, Upload, and Auditor Review feedback documents. The documents are design input; API and security claims are checked against the repository.

| Feedback | Decision | Reason |
| --- | --- | --- |
| Three overlapping Home project lists | Adopt: one recently updated preview | Repeated records add length without new information. |
| Featured sustainability endorsement | Remove section | Latest rejected submission can coexist with older approved data; endorsement wording was misleading. |
| Platform-wide electricity/water/CO2 totals | Defer; show a named approved project's three metrics | Different projects/periods/units cannot be meaningfully aggregated from the Home payload. |
| Project status and period | Label as latest submission; show separately known approved period | These are distinct data lifecycles. Real catalogue lacks approved-period metadata. |
| Catalogue row highlight toggle | Defer | Real catalogue does not reliably supply highlight state, so a row toggle would misrepresent saved state. Home and Highlighted retain this action. |
| Existing project and authorised organisation selectors | Defer pending backend contract | A catalogue search is not an authorization list. Free-text real upload already exists; backend ownership enforcement is a P0 gap. |
| Upload template and year/quarter | Adopt | Matches the existing multipart reporting-period contract and CSV schema without backend changes. |
| Browser XLSX preview | Defer | No parser dependency is present; real backend processes the active sheet. The UI does not pretend to preview it. |
| Auditor queue filters | Adopt client-side | Filters the authorised pending response without adding unsupported endpoints; not scalable pagination. |
| Mock review evidence | Adopt labelled synthetic preview | Enables workflow testing without pretending demo rows are the original file. |
| Integrity warning | Require acknowledgement before approval when status is not MATCH | Prevents an apparently verified approval in the UI; does not alter backend policy. |
| Review history | Mock-only | No real cross-project review-history API is established. |

No backend code, database schema, authentication rules, ETL, or existing data was changed for this feedback.
