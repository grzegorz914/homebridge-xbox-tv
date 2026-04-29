# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Install dependencies
npm install

# Run the plugin locally (requires a working Homebridge setup)
homebridge

# No test suite exists — the test script exits with an error by design
npm test
```

There is no lint or build step. The project uses native ES modules (`"type": "module"` in package.json) and runs directly in Node.js without transpilation.

## Architecture

This is a Homebridge platform plugin that exposes Xbox consoles as HomeKit TV accessories. The entry point is [index.js](index.js), which registers `XboxPlatform` under the `XboxTv` platform name.

### Startup flow

`XboxPlatform` (index.js) reads `config.devices[]` and, for each device, runs a startup `ImpulseGenerator` that retries every 120 s until `XboxDevice.start()` succeeds. Once a device is up, it is published via `api.publishExternalAccessories()` and the startup generator stops, handing off to `XboxDevice`'s own connect generator (6 s interval).

### Core classes

- **[src/xboxdevice.js](src/xboxdevice.js)** — Central device class (`EventEmitter`). Orchestrates both APIs, builds all HAP services/characteristics, handles HomeKit gets/sets, and drives external integrations. All log events bubble up via `emit('info'|'warn'|'error'|'debug'|'success')`.
- **[src/impulsegenerator.js](src/impulsegenerator.js)** — Lightweight interval scheduler. `state(true, [{name, sampling}])` starts named intervals that fire events; `state(false)` clears them. Used as a polling/heartbeat mechanism throughout the codebase.
- **[src/functions.js](src/functions.js)** — Shared utilities: file I/O (`readData`/`saveData`), network ping, diacritics normalization.
- **[src/constants.js](src/constants.js)** — All protocol constants: HAP `InputSourceTypes`, Web API URLs/scopes, Local API channel UUIDs, SmartGlass message type/flag maps, default built-in inputs (Dashboard, Settings, etc.), `DiacriticsMap`.

### Two control paths

**Local API** (`src/localApi/`) — UDP-based SmartGlass protocol over the LAN:
- `xboxlocalapi.js` — Manages a UDP socket, discovery/connect handshake, heartbeat ping, and inbound message dispatch.
- `sgcrypto.js` — ECDH key exchange (P-256) + AES-128 + HMAC-SHA256 for the SmartGlass session.
- `simple.js` / `message.js` / `packets.js` / `structure.js` — Packet construction and parsing for the two SmartGlass packet families (simple pre-auth, encrypted post-auth).

**Web API** (`src/webApi/`) — Microsoft Xbox cloud REST API:
- `xboxwebapi.js` — Polls authorization every 15 min, sends commands via `axios` to `xccs.xboxlive.com`, retrieves console status and installed app list.
- `authentication.js` — OAuth 2.0 flow (OAuth → User token → XSTS token) with token persistence to `authToken_<host>` file.
- `providers/` — Individual REST endpoint wrappers (achievements, catalog, people, etc.). These are used by the web API to fetch app/game metadata.

### External integrations

- **[src/restful.js](src/restful.js)** — Express HTTP server. GET routes expose device state; POST `/` accepts `{key: value}` JSON to send commands back to the device.
- **[src/mqtt.js](src/mqtt.js)** — MQTT v5 client. Publishes state updates to `microsoft/<prefix>/<name>/<key>` topics; subscribes to `…/Set` for inbound commands.

### Persistent storage

All per-device state files live under `<homebridge-storage>/xboxTv/` with a host-IP-derived suffix (dots stripped):
- `authToken_<host>` — OAuth + XSTS tokens (JSON)
- `devInfo_<host>` — Console hardware info
- `inputs_<host>` — Installed app/game list from Web API
- `inputsNames_<host>` — User-customized input display names (from HomeKit)
- `inputsTargetVisibility_<host>` — Per-input visibility state (from HomeKit)

### Homebridge UI

`homebridge-ui/server.js` runs as a `HomebridgePluginUiServer` and exposes two custom endpoints used by the Config UI:
- `/clearToken` — Wipes the auth token file so the OAuth flow can restart.
- `/startAuthorization` — Drives the OAuth token exchange when the user pastes a code.

### HomeKit accessory model

Each Xbox is published as an external accessory (`Categories.TELEVISION`). Services created in `XboxDevice.start()`:
- `Television` — primary, with `ActiveIdentifier` mapped to inputs
- `TelevisionSpeaker` — volume/mute
- Up to 85 `InputSource` services (built-in defaults + Web API app list + user-configured static inputs)
- Optional `Switch`/`Outlet` services for each configured button
- Optional `MotionSensor`/`OccupancySensor`/`ContactSensor` services for each configured sensor
- Optional `Lightbulb` service for volume control

Input identifiers are 1-based integers assigned at build time; display order can be sorted by name or reference via `inputs.displayOrder` config.
