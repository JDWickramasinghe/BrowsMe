# BrowsMe

BrowsMe is an AI-assisted Chromium desktop browser created by J.D. Wickramasinghe, published by Sobersided, and powered by DeepSeek. It uses familiar browser tabs and navigation while giving its AI a typed, session-scoped control surface for the pages inside the app.

## What works

- Chromium tabs with address/search, back, forward, reload/stop, home, favicons, bookmarks, popups, context menus, and keyboard shortcuts.
- Chrome-style page actions: find-in-page (`Ctrl+F`) with match counts and next/previous, page zoom (`Ctrl` `+` / `-` / `0`) with an omnibox zoom indicator, print / print-to-PDF (`Ctrl+P`), full-screen (`F11`), inline PDF viewing, and a tab right-click menu (reload, duplicate, mute/unmute, close, close other tabs, reopen closed tab).
- Browsing surfaces: a searchable **History** view (`Ctrl+H`) with per-entry open/remove and clear-all, a toggleable **Bookmarks bar** (`Ctrl+Shift+B`), a **Reading list** for saving pages to read later, and a browser **menu** (`⋮`) that gathers them.
- Personalization in Settings: a light/dark **theme toggle** (quick sun/moon switch in the toolbar, plus a system/light/dark control), a configurable **search engine** (Google, Bing, DuckDuckGo, Brave), a **startup** choice (reopen tabs or a fresh new tab), and **clear browsing data** (cookies, cache, site storage, and history).
- Tab shortcuts: jump to a tab with `Ctrl+1`–`Ctrl+9` (9 = last), cycle with `Ctrl+Tab` / `Ctrl+Shift+Tab`, and bookmark the current page with `Ctrl+D`.
- A resizable DeepSeek side terminal with visible plans, action results, verification receipts, connection recovery, and immediate Stop controls.
- Browser tools for listing, opening, switching, closing, and duplicating tabs; closing other tabs; muting tabs; navigating; inspecting and finding page controls; clicking; hovering; typing and clearing; checking controls; selecting options; pressing keys; scrolling; zooming; finding visible text in a page; reading browsing history; bookmarking pages; saving pages to the reading list; condition-based waiting; observing downloads; and explicitly submitting forms. Every human page/tab action above is also available to the AI through this typed, audited tool surface.
- A deterministic `observe → act → verify` loop: BrowsMe permits only one state-changing action per model turn, blocks every later mutation until the affected tab is freshly observed, and requires a later reasoning turn before it can report success.
- Snapshot-qualified element references, live target fingerprints, moving-target checks, composed visibility checks, frame-aware overlay/occlusion checks, trusted Chromium pointer/key input, and delayed post-action evidence reduce stale or wrong-target interactions.
- Popups and navigations are correlated to the exact agent input that caused them. Every resulting tab enters the task scope and needs its own fresh observation; failed or denied side effects prevent a false success receipt.
- Navigation completion is tied to the exact request and redirect chain. Superseding pages, late approvals, denied redirects, timed-out loads, and older overlapping snapshots cannot validate or overwrite newer work.
- Clicks use stable snapshot references, live target revalidation, motion and occlusion checks, and a verified visible point on wrapped or partially covered controls. Separately interactive descendants, open-shadow retargeting, and opaque frame-like surfaces (`iframe`, `object`, and `embed`) cannot substitute a different action for the approved control. Form submissions also pin the exact effective submitter and its action-bearing attributes across approval.
- Completion evidence is goal-specific. Page, identity, memory, tab, and download observations cannot substitute for one another, and composite requests require evidence for every relevant part.
- Three persistent approval modes let the user ask before every AI web action, automatically allow routine actions on trusted origins, or allow all audited AI web actions inside BrowsMe.
- Three persistent reliability modes tune DeepSeek thinking depth, bounded connection retries, action budgets, and completion checks.
- Sandboxed remote pages with no Node.js, filesystem, shell, Electron, cookie, or unrestricted JavaScript API exposed to the model.
- Paused downloads with safe filenames and manual Save/Deny decisions.
- DeepSeek API keys protected with Electron `safeStorage`.

## Form coverage

BrowsMe can fill ordinary text, password, email, search, telephone, URL, number, and multiline fields; rich and plain contenteditable areas; native checkbox and radio groups; ARIA checkboxes, switches, radios, and selectable options; single selects; native multiple selects with replace/add/remove modes; and structured date, time, date-time, month, week, range, and color values. Snapshots include fieldset or ARIA group questions, option values and disabled states, validation constraints, multiple-selection state, and accessible descriptions so repeated and multiple-answer questions can be matched accurately.

Each change is re-read after the page's handlers run. Hidden native checkboxes and radios remain actionable when they have a visible label. Custom comboboxes and listboxes are handled by opening them, observing their live options, and changing exact ARIA option refs. Custom sliders and spinbuttons can be adjusted with targeted arrow keys and verified from their ARIA values.

Native file pickers, CAPTCHA, WebAuthn, MFA, closed shadow roots, canvas-only controls, and inaccessible cross-origin frames remain human-operated or opaque. BrowsMe does not receive arbitrary host-filesystem access.

## Consistent memory across sessions

BrowsMe persists four separate kinds of state:

1. The Chromium profile keeps cookies, local storage, and signed-in website sessions.
2. Open tab addresses are restored on the next launch.
3. User/assistant conversation results are stored across application restarts.
4. Durable facts can be added by explicitly telling the AI, for example: “Remember that I prefer prices in LKR.”

Conversation history and durable facts are encrypted with the operating system’s protected storage when it is available. If protected storage is unavailable, AI memory remains in the current run and is not written as plaintext. Raw page snapshots, passwords, cookies, tokens, and tool traces are not written into AI memory.

The terminal’s Clear button removes conversation history but keeps explicitly remembered facts. Ask the AI to “forget …” to remove a durable fact.

## Run it

Requirements: Node.js 22.12 or newer and npm.

```powershell
npm install
npm start
```

Open Settings in the browser toolbar and add a DeepSeek API key. The default model is `deepseek-v4-flash`; `deepseek-v4-pro` can be selected for harder tasks.

## Approval modes

BrowsMe remembers the selected approval mode across launches:

- **Ask for approval** prompts before every AI-initiated click, typed value, selection, submission, navigation, reload, or tab close.
- **Approve for me** automatically permits routine actions on origins trusted for the current AI run, but still prompts for sensitive or higher-impact actions and when moving to a new origin.
- **Full access** automatically permits the broker's enumerated AI web actions inside BrowsMe. It does not grant DeepSeek arbitrary operating-system or filesystem access.

Every mode keeps protected boundaries under the user's control: downloads, site and device permissions, local or private-network access, saved-memory additions and deletions, native file selection, CAPTCHA, and MFA.

## Task reliability

Choose a reliability level in Settings:

- **Fast** minimizes latency for simple reading and navigation tasks.
- **Reliable** is the default. It enables deeper thinking, larger bounded action budgets, API retries, recovery snapshots, and multiple completion checks.
- **Maximum accuracy** gives difficult tasks the largest bounded reasoning, action, and verification budgets.

BrowsMe never blindly replays a click, submission, typed action, or other browser side effect after an error. If an input or navigation fails after a change may have begun, BrowsMe marks the outcome uncertain, revokes unused authority, drains related popup/navigation results, invalidates old references, and requires a fresh observation before another change. Only safe DeepSeek API requests are retried automatically.

These controls substantially reduce mistakes, but no browser agent can honestly guarantee zero errors. Keep manual control for irreversible financial, publishing, deletion, account, CAPTCHA, MFA, and native file-selection steps.

The API can also be configured without saving a key in the UI:

```powershell
$env:DEEPSEEK_API_KEY = "your-key"
$env:DEEPSEEK_MODEL = "deepseek-v4-flash"
npm start
```

Build Windows installer and portable artifacts with:

```powershell
npm run dist
```

## Code signing (Windows SmartScreen / Defender trust)

Windows flags *any* unsigned application as an unrecognized app from an "unknown publisher," and some antivirus engines heuristically distrust unsigned executables. The only way to remove that is an Authenticode code-signing certificate issued to the publisher, **Sobersided**. The build is already configured for it (publisher name, RFC‑3161 timestamping); signing turns on automatically once a certificate is supplied — no code change:

```powershell
# OV/EV certificate as a .pfx file
$env:CSC_LINK = "C:\path\to\sobersided-codesign.pfx"
$env:CSC_KEY_PASSWORD = "the-pfx-password"
npm run dist
```

Or, for an EV certificate on a hardware token / in the Windows certificate store, set `win.signtoolOptions.certificateSubjectName` to `"Sobersided"` in `package.json` and run `npm run dist` with the token connected.

- An **EV** certificate gives SmartScreen reputation immediately.
- An **OV** certificate signs and timestamps the binary (removing "unknown publisher") and accrues SmartScreen reputation as downloads build up.

Without a certificate the app still runs; Windows will show the "unknown publisher" prompt (More info → Run anyway) until one is added.

## Browser compatibility and loading

Remote websites see the app’s real Chromium browser identity without the misleading Electron/app version token. The persistent profile explicitly uses Chromium’s HTTP cache, keeps cookies and signed-in sessions, and reports the operating-system language preferences.

Navigation becomes usable at DOM-ready instead of making the AI wait for every analytics, advertising, or long-polling resource. On startup, only the selected restored tab loads immediately; background tabs retain their addresses and load when selected. This avoids restored tabs competing for network, CPU, and memory.

BrowsMe also keeps agent-controlled Chromium pages active when the app is temporarily covered, preventing background timer throttling from making interactions appear stalled. Local-network approvals are one-shot and scoped to one navigation chain, including new-tab links and browser history. Restored tabs receive no fresh-navigation authority, so a restored private or rebound destination prompts again. Same-origin redirects do not repeatedly prompt, while a different private origin requires a new decision. Hostnames are resolved again at the guarded network boundary so a public-looking name that resolves or rebinds to a loopback/private address cannot silently inherit a public-destination decision. New tabs, links, forms, type-and-submit actions, and Enter-key submissions retain agent attribution only when BrowsMe can derive and pin their exact destination before dispatch. That grant is then bound to Chromium's original request ID and its redirect chain. For normal GET forms, BrowsMe pins a SHA-256 hash of the submitted query. For URL-encoded POST forms, it separately pins the action URL query, exact body, and effective content type at Chromium's outgoing-header boundary. Read-only snapshots and preflight checks manually serialize predictable native form controls and never construct page-observable `FormData`; event-modified, custom, file-backed, image-coordinate, directional, unsupported, or unreadable bodies cannot inherit an AI grant. While an action or newly transferred popup claim is live, every competing main-frame request—including a substituted same-origin path—must match the exact supported claim or receive a separate page approval. After trusted input ends or an active grant expires, a run-scoped non-authorizing sentinel preserves that conflict check until a navigation commits or the AI task ends, without granting the page AI authority. Popup grants additionally pin the effective target and HTTP method, preserve both filled and empty POST bodies, and cannot be reused after consumption. A failed input dispatch immediately revokes any grant it had not successfully transferred. Unclassified JavaScript, timer, or replacement navigations stay page-scoped—even if they race trusted input or an approved request—and require a separate page approval before crossing to another site. Protected 307/308 redirects remain in Chromium's original chain so POST methods and upload bodies are retained.

## BrowsMe identity

BrowsMe has a fixed operational identity across sessions: its name is BrowsMe, it was created by J.D. Wickramasinghe, and DeepSeek is its underlying model provider. It can inspect its current browser scope, available tabs, Chromium engine, capabilities, and encrypted-memory status through the `browsme_self_state` tool. Enter `/whoami` in the terminal for a current self-description.

This is operational self-awareness, not a claim of human consciousness or feelings.

## Useful controls

| Action | Shortcut |
|---|---|
| New tab | `Ctrl+T` |
| Close tab | `Ctrl+W` |
| Reopen closed tab | `Ctrl+Shift+T` |
| Focus address bar | `Ctrl+L` |
| Reload | `Ctrl+R` |
| Back / forward | `Alt+Left` / `Alt+Right` |
| Switch to tab 1–9 | `Ctrl+1` … `Ctrl+9` |
| Next / previous tab | `Ctrl+Tab` / `Ctrl+Shift+Tab` |
| Bookmark this page | `Ctrl+D` |
| History | `Ctrl+H` |
| Toggle bookmarks bar | `Ctrl+Shift+B` |
| Find in page | `Ctrl+F` |
| Zoom in / out / reset | `Ctrl` `+` / `Ctrl` `-` / `Ctrl` `0` |
| Print | `Ctrl+P` |
| Full screen | `F11` |
| Downloads | `Ctrl+J` |
| Toggle AI terminal | `Ctrl+Shift+A` |
| Stop active AI control | `Esc` |

Terminal commands include `/whoami`, `/tabs`, `/inspect`, `/summarize`, `/stop`, and `/clear`.

## Architecture

```text
Trusted Chromium shell
        │ narrow, validated IPC
        ▼
Electron main process
  ├─ tab/session manager
  ├─ deterministic action, verification, and approval broker
  ├─ encrypted settings and memory
  └─ DeepSeek tool-call loop
        │ fixed browser tools only
        ▼
Sandboxed WebContentsView tabs
```

Page text and model output are both treated as untrusted. DeepSeek can ask the broker to perform a defined browser action; it cannot send arbitrary Electron IPC, run operating-system commands, execute model-written JavaScript, read cookies/tokens, or grant its own permissions. Page snapshots flag likely instruction-injection language, while hard-coded policy keeps page content from expanding the user's goal.

## Honest limitations

BrowsMe uses current Chromium through Electron, but it is not Google Chrome and does not include Chrome Sync, Google’s password manager, Chrome extensions, or Chrome-operated Safe Browsing and Certificate Transparency services. DeepSeek V4 is text-only, so BrowsMe currently controls pages from structured semantic snapshots rather than visually interpreting screenshots. CAPTCHA, WebAuthn/MFA, native file selection, and hardware permission prompts remain human-operated. Closed shadow roots and some hostile cross-origin frames can also be opaque to semantic page inspection.

Packaged builds enable restrictive Electron fuses and ASAR integrity validation. For production distribution, also sign the application, keep Electron current, and add a maintained phishing/download reputation service.

See [SECURITY.md](SECURITY.md) for the trust model and reporting guidance.
