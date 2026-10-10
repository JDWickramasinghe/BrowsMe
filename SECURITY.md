# Security model

BrowsMe defines “the AI can do anything inside the browser” as: DeepSeek may use every audited browser capability exposed by the action broker. It never receives unrestricted Electron, Chrome DevTools Protocol, JavaScript evaluation, filesystem, operating-system shell, cookie, token, or permission access.

## Trust boundaries

- The local browser chrome, action broker, settings vault, and memory store are trusted.
- Every remote page, including its visible and hidden text, is untrusted.
- DeepSeek output is an untrusted action proposal.
- Only the user’s current terminal instruction and hard-coded policy can grant authority.

Remote tabs run with Node integration disabled, context isolation and sandboxing enabled, web security enabled, and no preload bridge. The trusted renderer receives only an enumerated preload API, and every main-process handler validates its sender.

## Approval modes and protected boundaries

The user's selected mode is stored and restored across launches:

- **Ask for approval** prompts before every AI-initiated click, typed value, selection, submission, navigation, reload, or tab close.
- **Approve for me** automatically allows only enumerated routine actions on origins trusted for the current AI run. Sensitive actions, higher-impact actions, and transitions to a new origin still prompt.
- **Full access** automatically allows the broker's enumerated AI web actions inside BrowsMe. Unknown or future action kinds fail closed and prompt.

No mode grants arbitrary operating-system, shell, or filesystem access. The following protected boundaries always remain human-controlled:

- Downloads.
- Site and device permissions.
- Local/private-network access.
- Persistent AI-memory additions and deletions.
- Native file selection, CAPTCHA, and MFA.

Password-field typing is identified explicitly, and its value is never returned to the model.

Downloads remain paused until approved and never auto-open.

## Action integrity and completion

- Every interactive page reference is qualified to one specific snapshot and expires after a new snapshot or state-changing action.
- The broker rechecks target identity, disabled state, composed visibility, motion, and frame-aware hit-testing immediately before dispatch, including verified visible fragments of wrapped inline controls. It rejects opaque frame-like boundary refs (`iframe`, `object`, and `embed`), associated labels that could forward a click, and separately actionable light-DOM or open-shadow descendants that could substitute another control. Form actions—including image submitters—pin the effective submitter object and its action-bearing attributes across approval.
- Pointer and activation-key actions use Chromium's trusted input channel; checkboxes and selections are sampled again after asynchronous page handlers have settled.
- Only one state-changing tool can run per model response.
- Mutating actions create pending verification that blocks later mutations until a fresh observation clears every affected tab.
- Popups and navigations receive agent authority only from a destination BrowsMe derived and pinned before dispatch. New tabs, links, type-and-submit actions, explicit forms, and Enter-key submissions use one-shot run-scoped grants; popup transfer also requires the effective target, HTTP method, and an unconsumed grant to match. For supported GET submissions, the grant includes a SHA-256 hash of the exact submitted query. For supported URL-encoded POST submissions, it separately hashes the action URL query and exact body, then validates the real outgoing content type before Chromium sends the request. Read-only observation and preflight code manually serializes predictable native successful controls and never constructs `FormData`, because that constructor dispatches a page-observable event. Event-modified, custom, file-backed, image-coordinate, directional, unsupported, unreadable, method-mismatched, query-mismatched, encoding-mismatched, or payload-mismatched requests cannot inherit AI authority and remain page-scoped or fail closed. Any main-frame request competing with a live action or popup-transfer claim—including a different same-origin path—must exactly match that supported claim or receive a separate page approval. Once trusted input ends or an active grant expires, the grant becomes a run-scoped conflict-only sentinel that cannot authorize a request and remains until a navigation commits or the run ends. Filled and empty predictable POST bodies are preserved. If Chromium withholds an approved POST body, BrowsMe blocks it and records a failed side effect instead of changing it to GET. Unclassified JavaScript and timer transitions remain page-scoped even when they occur during trusted input, and a page-scoped cross-site transition prompts separately. Guarded 307/308 redirects retain Chromium's original method and upload body. Unrelated tabs cannot silently enter task scope, and denied or failed correlated effects block a success receipt.
- Navigation grants are one-shot, run-scoped, tab-scoped, request-epoch-scoped, payload-scoped where the request can be determined, and bound to Chromium's original network request ID and redirect chain. A failed dispatch revokes its still-owned grant immediately; a replacement request cannot borrow a consumed grant, and a stale approval cannot overwrite a newer navigation. If a mutation may have begun before an error, the broker records an uncertain action, drains correlated side effects, invalidates the affected references, and blocks another mutation until every surviving affected tab has been freshly observed.
- Main-frame destinations are checked at the guarded Chromium session as well as at the action broker. Literal and DNS-resolved loopback/private destinations remain protected for links, restored tabs, redirects, forms, popups, and agent history actions.
- Timed-out loads are stopped and invalidated. A superseding page or an older overlapping snapshot cannot be accepted as evidence for the original request.
- Evidence is typed by goal, so memory, identity, tab, download, and page observations do not validate unrelated work. Composite goals require every applicable evidence type.
- A successful run requires a broker-validated task receipt; free-form model claims are never accepted as proof of completion.
- BrowsMe may retry interrupted DeepSeek API requests, but never blindly replays a browser side effect.

## Data handling

- The API key never enters a remote page or model context.
- Password values, cookies, authentication headers, and browser tokens are never returned by page snapshots.
- AI memory stores only user/assistant conversation results and explicitly requested durable facts.
- Raw page snapshots and tool observations are not written to persistent AI memory.
- Page text sent to DeepSeek is capped and labelled as untrusted data.
- Page content cannot authorize memory changes or broaden the current user's task.

## Known limitations

Electron is not security-equivalent to Chrome. BrowsMe currently lacks a malware/phishing reputation backend, signed automatic updates, and Chrome’s managed protection services. Packaged builds do enable restrictive Electron fuses and ASAR integrity validation, but should not be presented as a hardened replacement for a fully maintained mainstream browser.

The local-network check resolves hostnames before authorization, but it does not cryptographically pin the eventual socket endpoint. A production hardening pass should add connection-layer endpoint enforcement to further reduce DNS-rebinding time-of-check/time-of-use risk.

For a production release:

1. Code-sign the executable and installer.
2. Add a Safe Browsing-compatible URL/download reputation service.
3. Add automated prompt-injection, navigation, permission, download, and IPC fuzz tests.
4. Maintain an aggressive Electron/Chromium update schedule.

Please report suspected vulnerabilities privately to the project owner rather than posting exploit details publicly.
