# Batch 6 defect log

## Targeted UI layout follow-up (18 October 2026)

| ID | Severity | Root cause and observed defect | Scoped fix | Retest |
|---|---|---|---|---|
| D06-06 | Medium | Projects header and each linked row were independent grids with an `auto` action track; its width varied per row, shifting headings/cells. The status pill stretched as a grid item. An older 820px rule also hid cells while a later 900px rule left their tracks reserved. | Shared fixed fractional/final action tracks for header and rows; compact `justify-self: start` pill; 820px compact two-column row with action on its own line. No catalogue logic changed. | Browser screenshots inspected at 1440, 768 and 390px; columns/badges/links aligned without overlap. Existing Projects tests and full suite pass. |
| D06-07 | Low | `.primary-button` supplied no padding; the My Buildings link therefore hugged its text and inherited an unsuitable top margin. | Scoped inline-flex centering, 46px minimum height and 10px/18px padding on `.company-heading .primary-button`. | Browser screenshots inspected at 1440, 768 and 390px. Create route remains covered by existing building-page tests. |
| D06-08 | Medium | Global `input { width: 100%; min-height: 46px }` overrode the intended checkbox size; generic form-label grid and floating category counts made evidence rows/names sprawl. | Added semantic two-line submission label content; scoped 18px checkbox grid rows; category button grid with separate wrapping name/count; no evidence-state logic changed. | GBI (4 submissions on project 108) and GreenRE (4 on 107) inspected in browser, including mobile; label-click/multiple-link persistence test added. Full suite 123/123 passes. |

Visual inspection was performed in the local in-app browser; screenshots were displayed in the QA session but not saved as standalone artifacts. This follow-up does **not** clear the independent exported-file/print or broader Batch 6 accessibility gates.

| ID | Requirement / test | Severity | Reproduction and actual result | Expected | Cause and fix | Retest / residual |
|---|---|---|---|---|---|---|
| D06-01 | VIEW-01 / REG-01 | Medium | Full-suite `ProjectDetail.test.jsx` metric-tab test failed at line 173: `getByText("kWh")` matched three legitimate elements. Baseline 119 passed, 1 failed. | Assert the intended metric card unit. | Test locator was ambiguous, not app timing. Scoped locator to `.metric-card-unit`; kept exact unit assertion. | Focused file repeated 5 times, 9/9 each; final suite result in execution log. |
| D06-02 | AUTH-02, SUB-01 / ISO-01 | High | Calling mock `getPendingReviews`, `getReviewHistory`, `getReviewDetail`, or `decideSubmission` as a non-auditor could bypass UI-only role gating; mock `createSubmission` legacy path similarly lacked a role check. | Mock service must reject wrong roles, including direct calls. | Added `requireDemoRole` at those service entry points and explicit negative tests. | Wrong-role test and cross-role lifecycle pass. Mock checks remain a UX simulation, not server-side security. |
| D06-03 | UPL-01 / E2E-01 | Low | Mock upload confirmation copy could imply real backend validation/evidence storage. | Make simulated nature clear. | Mock-only wording now says no backend validation or evidence storage occurs. | Upload UI/component tests and build pass. |
| D06-04 | UPL-02 / E2E-01 | Medium | Successful upload showed a `View submission` link to `/submissions/:id`, a route not implemented by `src/App.jsx`. | Avoid a dead-end action. | Removed dead link; retained working `View project` action. | Route inspection and upload component tests pass. |
| D06-05 | VIEW-01 / REG-01 | Medium | Final full suite exposed an older test asserting the Water visualization tab never exists. It passed/fail intermittently because the tab loads after metric history. | Assert the current selector when its async data has loaded. | Changed stale test name/assertion to `findByRole("tab", { name: "Water" })`; no product code changed. | Initial final runs: 121/122 twice (first stale absence assertion, then synchronous presence assertion). Corrected run: 122/122. |

## Open verification limitations, not confirmed product defects

- **V06-01:** A browser policy blocked independently opening the downloaded `file://` HTML package. Read-only file inspection found standalone HTML, disclaimer, evidence register, and print CSS, but visual opening and print/PDF were not verified. This blocks Batch 6 acceptance.
- **V06-02:** Native `window.confirm` stalled one in-app browser tab during reassignment QA. Service-level reassignment tests pass; interactive browser reassignment and full responsive/accessibility matrix remain unverified. No product root cause has been established, so this is not labelled a confirmed app defect.

No Critical defect was confirmed. Do not infer complete accessibility or browser compatibility from the passing automated tests.
