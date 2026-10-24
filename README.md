# Unified Supervisor

An experimental desktop workspace for using multiple AI services together.

Unified Supervisor brings ChatGPT, Claude, Gemini, and local CLI tools into one Electron application. It provides individual service tabs, a shared prompt broadcast view, and workflows where two AI services debate, collaborate, or review a proposal with an optional supervisor.

The project is an invitation to build a useful unified platform together. It is an early prototype, and contributions to adapters, orchestration, privacy, accessibility, and platform support are welcome.

## What it does

- **Individual service tabs:** open supported web services in embedded browser views and sign in with your own accounts.
- **Broadcast Hub:** send one prompt to selected web or CLI services and compare their responses.
- **Supervisor Arena:** run a configurable number of rounds with debate, collaboration, or supervisor roles, optional judging, and consensus or termination markers.
- **Transcripts and copying:** retain conversation transcripts locally and copy results for review.
- **Webview hibernation:** unload inactive views and reopen them when needed. Persistent browser sessions help retain sign-in state, subject to each provider's session rules.
- **Memory visibility:** show Electron process memory metrics and provide controls to hibernate inactive views.
- **Optional credential editor:** save web-service email/password fields in encrypted device storage. These fields currently support storage and editing; automatic login or credential autofill is not implemented.

## Current integrations

| Integration | Current connection |
| --- | --- |
| ChatGPT Web | Embedded `chatgpt.com` view and DOM adapter |
| Gemini Web | Embedded `gemini.google.com` view and DOM adapter |
| Claude Web | Embedded `claude.ai` view and DOM adapter |
| Codex | Installed `codex` CLI, resolved through `PATH` |
| AGY bridge | Installed `agy` executable; currently labelled Gemini CLI in the UI |

The web adapters automate the providers' existing pages. They are sensitive to page layout changes, account state, and response timing. Service accounts, subscriptions, and provider limits remain separate. The application does not supply accounts, API keys, or additional usage allowances.

Some usage-limit values are prototype defaults. Adapter scraping and memory estimates should be treated as informational.

## Requirements

- **Windows** for the current CLI execution path, which uses `powershell.exe`.
- **Node.js 22.13 or newer on the 22.x line, or Node.js 24 or newer**, with npm.
- Your own accounts for the web services you want to use.
- Optional local CLI installations for CLI integrations. Sign in to each CLI through its own authentication flow.

The desktop UI uses Electron and React. macOS and Linux support, particularly CLI process execution, needs further work and validation.

## Run locally

Clone this repository and open its root directory:

```sh
npm ci
npm run dev
```

The development command starts Vite and builds the Electron main process and preload scripts.

On Windows, you can also use `run.bat` or `start-app.bat` from the project directory after installing dependencies. These launchers resolve their location without a machine-specific user path.

### CLI setup

Make `codex` and `agy` available on `PATH` for the integrations you intend to use.

For AGY installations outside `PATH`, set `AGY_EXECUTABLE` to the executable's full path in your local environment. The application also checks the current user's Windows `AppData/Local/agy/bin/agy.exe` location. No account-specific executable paths are committed.

The service currently named Gemini CLI invokes `agy --print`. It is an AGY bridge, rather than a direct implementation of the official Gemini CLI.

### Build and checks

```sh
npm run build
npm run lint
```

- `npm run build` runs TypeScript checks and creates renderer output in `dist/` and Electron output in `dist-electron/`.
- `npm run lint` runs ESLint.
- `npm run preview` previews the Vite renderer output; it does not provide the complete Electron desktop runtime.

The build currently produces application assets. A packaged installer and release workflow have not been configured.

## Using the application

1. Open the service tabs you want to use and sign in directly to each provider.
2. Use **Broadcast Hub** to send a prompt to selected services and compare responses.
3. Use **Supervisor Arena** to choose participants, a workflow mode, the number of rounds, and an optional judge.
4. Copy useful responses or transcripts for review.
5. Hibernate inactive tabs when you want to release their browser processes.

Provider responses are model output and require your own review. Each selected provider receives the prompts and conversation excerpts sent to it by the chosen workflow.

## Local data and privacy

User data is stored in Electron's per-user application-data directory, outside this source checkout.

| Data | Storage |
| --- | --- |
| Application settings and saved transcripts | `unified-supervisor-data.json`; local plaintext JSON |
| Web-service sessions and cookies | Electron's persistent `unified-supervisor` browser partition |
| Optional stored web credentials | `credentials.enc`, encrypted using Electron `safeStorage` and the operating system's secure-storage backend |

Credential saving is refused when a suitable encryption backend is unavailable, including Linux's `basic_text` fallback. Passwords are masked in the editor, and its field state is cleared when the editor closes.

A legacy checkout-level `credentials.json`, if present, is migrated on credential access. Its contents are encrypted in the user-data directory before the legacy plaintext file is removed. New users should use **Settings > Manage Web Credentials**.

The repository excludes local environment files, legacy credential files, dependencies, generated output, logs, and Windows shortcuts through `.gitignore`. Keep browser profiles, user-data folders, authentication files, and real transcripts out of commits and issue attachments. Share synthetic or redacted examples when reporting bugs.

This is experimental software. CLI actions execute with your local user's permissions. Command restrictions, IPC validation, and isolation between remote webviews and privileged desktop operations are areas that need continued security review before broader distribution.

## Code layout

```text
electron/
  main.ts                Desktop window, IPC, CLI execution, and local data storage
  preload.ts             Bridge between the local renderer and Electron
  webview-preload.ts     Provider selectors, prompt injection, and response scraping
src/
  App.tsx                Service tabs, Broadcast Hub, Supervisor Arena, and settings
  index.css              Application styles
  main.tsx               React entry point
public/                   Static assets
vite.config.ts            Renderer and Electron build configuration
```

`dist/`, `dist-electron/`, and `node_modules/` are generated or installed locally and are excluded from source control.

The application uses Electron, React 19, TypeScript, Vite, Radix UI, Framer Motion, and Lucide icons. The orchestration and broadcast interfaces are inspired by ideas from [Microsoft AutoGen](https://github.com/microsoft/autogen) and [ChatALL](https://github.com/ai-shifu/ChatALL); the current implementation uses its own Electron and DOM-adapter code.

## Contributing

Start with a focused issue or pull request describing the problem and the behavior you want to improve.

Useful contribution areas include:

- More resilient provider adapters and clearer failures when a page changes.
- Reliable response completion detection, cancellation, and orchestration state.
- Separation of provider adapters from the main UI.
- Tests around adapters, IPC boundaries, credential migration, and workflow state.
- Better quota reporting with explicit provenance for scraped or estimated values.
- Keyboard access, accessibility, and clearer settings.
- CLI execution across operating systems.
- Installer packaging, CI, and a repeatable release process.

For a change:

1. Install dependencies with `npm ci`.
2. Keep credentials and machine-specific paths out of source files.
3. Run `npm run build` and `npm run lint`.
4. Explain how you checked the change and any limitations in the pull request.
5. Use redacted screenshots and synthetic conversation data in examples.

## Project status and license

This repository is an experimental collaboration project. Provider adapters, account integrations, and packaging are still evolving. It is not affiliated with or endorsed by the integrated service providers.

A project license has not yet been selected.

