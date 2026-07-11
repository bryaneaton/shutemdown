# UniFi Device Shutdown Website Plan

## Goal

Build a small web application that lets you manage a server-side list of UniFi network devices by MAC address. The web frontend will allow adding and removing MAC addresses. The backend will own validation, persistence, and the eventual UniFi shutdown/blocking integration.

The application should be mobile friendly so devices can be managed easily from a phone or tablet on the network.

## Assumptions

- "Shutdown" means the backend will use provided UniFi/network configuration or logic to disable, block, kick, or otherwise restrict devices by MAC address.
- The frontend only manages the device list and displays status.
- UniFi credentials and sensitive configuration stay server-side.
- Server configuration should be written in YAML.
- This is a new empty project.

## Recommended Architecture

- Frontend: React with Vite.
- Backend: Node.js with Express.
- Storage: JSON file initially, such as `config/devices.json`.
- Runtime config: server-only YAML configuration file for UniFi details, such as `config/server.yaml`.
- Deployment: one server process that serves the API and the built frontend.

## Core Features

1. Device list page
   - Display saved MAC addresses.
   - Show optional friendly device names.
   - Show optional notes.
   - Show last apply/status information.

2. Add device form
   - Fields: `macAddress`, `name`, and `notes`.
   - Allow adding multiple MAC addresses in one request.
   - Support pasting multiple MAC addresses separated by newlines, commas, or spaces.
   - Validate MAC address format before submitting.
   - Normalize MAC addresses to a consistent uppercase colon-separated format.

3. Remove device
   - Remove a MAC address from the shutdown list.
   - Persist the updated configuration.

4. Apply action
   - Provide an `Apply Changes` button initially.
   - Backend applies the current device list to UniFi using the provided shutdown/blocking logic.
   - Keep the UniFi integration behind a service boundary so it can start as a stub.

5. Status reporting
   - Show whether server config is loaded.
   - Show the last successful apply time.
   - Show the latest error if an apply fails.

## Suggested API

```http
GET /api/devices
```

Returns all configured devices.

```http
POST /api/devices
```

Adds a new device.

Example request:

```json
{
  "macAddress": "AA:BB:CC:DD:EE:FF",
  "name": "Kids iPad",
  "notes": "Block during downtime"
}
```

The same endpoint should also support adding multiple devices in one request.

Example bulk request:

```json
{
  "devices": [
    {
      "macAddress": "AA:BB:CC:DD:EE:FF",
      "name": "Kids iPad"
    },
    {
      "macAddress": "11:22:33:44:55:66",
      "name": "Game Console"
    }
  ]
}
```

For quick entry, the backend may also accept raw MAC address text and parse values separated by newlines, commas, or spaces.

Example quick bulk request:

```json
{
  "macAddresses": "AA:BB:CC:DD:EE:FF\n11:22:33:44:55:66"
}
```

```http
DELETE /api/devices/:macAddress
```

Removes a configured device.

```http
POST /api/apply
```

Applies the current device list to UniFi.

```http
GET /api/status
```

Returns server and UniFi integration status.

## Backend Responsibilities

- Validate all MAC addresses server-side.
- Normalize MAC addresses.
- Prevent duplicate devices by overwriting an existing entry when the same normalized MAC address is added again.
- Support bulk add requests with partial-success reporting for invalid or duplicate MAC addresses.
- Persist devices safely.
- Load server-only UniFi configuration from YAML.
- Execute the configured shutdown/block operation.
- Return clear API errors.
- Never expose UniFi credentials to the frontend.

## Frontend Responsibilities

- Render current devices.
- Provide an add-device form.
- Provide a bulk-add textarea for multiple MAC addresses.
- Provide delete controls.
- Provide an apply button.
- Display loading, validation, success, and error states.
- Work cleanly on desktop, tablet, and mobile screen sizes.
- Use touch-friendly controls and readable spacing for phone use.

## Security Notes

- Add authentication before exposing beyond a trusted LAN.
- Keep UniFi credentials out of frontend code.
- Validate every API request server-side.
- Log actions without logging secrets.
- Consider basic auth or session auth as a first pass.

## Implementation Phases

1. Scaffold project
   - Create Vite React frontend.
   - Create Express backend.
   - Add shared dev, build, and start scripts.

2. Backend API
   - Implement JSON config storage.
   - Implement YAML server configuration loading.
   - Add MAC validation and normalization.
   - Implement device CRUD endpoints, including bulk add support.
   - Implement status and apply endpoints with a stub UniFi service.

3. Frontend UI
   - Build the dashboard layout.
   - Add the device table/list.
   - Add the device form.
   - Add delete and apply actions.
   - Add status/error display.

4. UniFi integration
   - Add `unifiService` as the integration boundary.
   - Keep it stubbed until the real UniFi action is confirmed.
   - Wire in the provided UniFi configuration and shutdown/blocking logic.

5. Verification
   - Test MAC validation.
   - Test duplicate prevention.
   - Test bulk add parsing and partial failures.
   - Test add/remove persistence.
   - Test apply flow with the stub service.
   - Test real UniFi integration once credentials/config are available.

## Open Questions

1. Should shutdown mean blocking the client, reconnecting/kicking it, or disabling the switch port?
2. Will this run only on the LAN, or does it need login/authentication?
3. Should storage remain a JSON file, or should it use SQLite?
4. Should changes apply immediately or only after clicking `Apply Changes`?
