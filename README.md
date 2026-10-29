# Edgegap Servers Quickstart for Cocos Creator

Cocos Creator extension that builds your multiplayer game server into a container, tests it locally, uploads it to Edgegap and starts a test server near you, from one editor panel.

Supports **Cocos Creator 3.8** and newer, on Windows and macOS. Needs [Docker Desktop](https://docs.docker.com/get-docker/) running.

A Cocos Creator game has no headless server build: its multiplayer server is a separate Node.js app, usually [Colyseus](https://colyseus.io), a Nakama runtime or a custom WebSocket server, in a folder of your project (for example `Server/`). The extension containerizes that folder. The game client stays a normal Cocos build (web, mobile, desktop).

Example: [edgegap/backend-game-sample-cocos-colyseus-tictactoe](https://github.com/edgegap/backend-game-sample-cocos-colyseus-tictactoe), Colyseus's Cocos tic-tac-toe demo with this extension, a server that stops itself after each match, and an Edgegap matchmaker "Find Match" flow.

## Install

1. Download this repository (Code → Download ZIP, or clone it).
2. Copy it into your project as `extensions/edgegap-extension/`, so the folder holds `package.json`, `dist/`, `static/`, `i18n/` and `assets/`. `dist/` is prebuilt: no `npm install` needed.
3. In Cocos Creator: **Extension → Extension Manager → Project**, enable **edgegap-extension** (click refresh if it isn't listed).
4. Open it with **Extension → Edgegap → Open Panel**.

## Use

| Step | What happens |
|---|---|
| **1. Sign in** | Click **Get a token** (one-click sign-in on the Edgegap dashboard), paste the token, **Verify and sign in**. The token and the container registry login are saved in your Cocos Creator user profile, never in the project. A regular API token (User Settings → Tokens) works too: the panel then asks for the Project, Username and Token from the dashboard's Container Registry page. |
| **2. Server** | The server folder (default `Server`), image name, tag (a UTC timestamp, also the Edgegap version name), port and protocol. Colyseus and other WebSocket servers: **WS** with **TLS Upgrade** on, so web builds on `https` pages can connect with `wss://`. No Dockerfile yet? **Create Dockerfile** writes a starting one for a Node.js server. These settings are saved in the project (`settings/v2/packages/edgegap-extension.json`), so your team shares them. |
| **3. Build and test locally** | **Build image** runs `docker build --platform linux/amd64` (Edgegap runs x86-64 Linux, also when you build on Apple Silicon). **Run locally** starts it on the same port: point a client at `ws://localhost:<port>`. **Stop local** removes the container. |
| **4. Upload** | **Push image and create version** logs in to `registry.edgegap.com`, pushes the image, creates the application if needed, and creates the version (or updates it if the tag already exists) with your port, CPU, memory and a maximum duration. |
| **5. Deploy a test server** | **Deploy near me** starts one server close to your public IP and shows the address clients connect to (`wss://<id>.pr.edgegap.net:<port>`). **Stop server** stops it. It also stops on its own at the maximum duration. |

The Log section shows every command and API call. Passwords go to Docker through stdin and are never logged.

### For players: one server per match

The test server is for you. For players, use the [Edgegap matchmaker](https://docs.edgegap.com/learn/matchmaking): each match gets its own server near its players, and your server stops its deployment when the match ends. The example project shows both parts (the Colyseus server lifecycle and the Cocos client's Find Match).

## Headless (CI)

`scripts/e2e.mjs` runs the same steps without the editor, with the same code and the project's saved settings:

```bash
EDGEGAP_API_TOKEN=<token> node scripts/e2e.mjs --project <path to Cocos project> --deploy --check "node <bot client> --server={url}"
```

With a regular API token, also set `EDGEGAP_REGISTRY_PROJECT`, `EDGEGAP_REGISTRY_USERNAME` and `EDGEGAP_REGISTRY_TOKEN`. To only ship builds from CI, [edgegap/deploy-action](https://github.com/edgegap/deploy-action) is simpler.

## Develop

```bash
npm install
npm run build          # TypeScript in src/ -> dist/ (commit dist/)
node test/panel-smoke.cjs
```

`src/core/` (Edgegap API, Docker, steps) has no editor dependency; `src/panels/default/` is the panel; `src/main.ts` the menu.

## Troubleshooting

| Symptom | Fix |
|---|---|
| "Docker is not running or not installed" | Start Docker Desktop. |
| "not a quick-start token" | Use **Get a token** (one-click sign-in), or fill in the registry login from the dashboard's Container Registry page. |
| Deployment fails to pull the image | The version's registry login is wrong: sign out and in again, then **Push image and create version**. |
| Deployment errors right after start | Open the deployment's logs in the dashboard. Usually the Dockerfile's `CMD`, or the server not listening on the port set in the panel (`PORT` env var). |
| First client join gets **502** for a few seconds | Normal right after a deployment turns ready: retry the join (the example's `joinWithRetry`). |
| `wss://<ip>:<port>` fails the TLS check | Connect by the FQDN shown in the panel, not the IP. |

The 2022 version (Cocos Creator 3.6) is kept at the `v1` tag.
