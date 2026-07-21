# Shut 'Em Down

A small LAN-friendly web app for shutting down access to kids' devices with one touch while you are on your network. The React frontend lets you manage a saved list of device MAC addresses, then block or allow all devices or a named group from a simple dashboard. The Express backend owns validation, persistence, YAML configuration, and the UniFi API integration boundary.

## Features

- Add one or more MAC addresses at a time.
- Assign devices to optional groups like `TVs`, `Alexis`, or `Elise`.
- Normalize and validate MAC addresses server-side.
- Store managed devices in `config/devices.json`.
- Track optional device names and notes.
- Block or allow the full device list with one tap.
- Block or allow only devices in a matching group name.
- Run safely in stub mode until UniFi API settings are enabled.
- Serve the built frontend from the Node server in production.

## Requirements

- Node.js 18 or newer.
- npm.
- UniFi API-key configuration if you want real block/allow actions.

## Setup

Install dependencies:

```bash
npm install
```

Create local configuration files if they do not already exist:

```bash
cp config/server.example.yaml config/server.yaml
cp config/devices.example.json config/devices.json
```

Edit `config/server.yaml` for your environment. Keep `unifi.enabled: false` for stub mode, or set it to `true` after adding the required UniFi API settings.

## Development

Run the backend and Vite frontend together:

```bash
npm run dev
```

Default URLs:

- Frontend: `http://localhost:5173`
- API server: `http://localhost:3000`

## Production

Build the frontend:

```bash
npm run build
```

Start the production server:

```bash
npm start
```

The production server listens on `PORT`, then `config/server.yaml` `server.port`, then `3000`. In production it serves both the API and the built frontend from `dist/`.

## Configuration

Runtime configuration lives in `config/server.yaml`.

Important fields:

- `server.port`: default app port.
- `unifi.enabled`: when `false`, block/allow actions run in stub mode.
- `unifi.apiBaseUrl`: defaults to `https://api.ui.com`.
- `unifi.apiKey`: required when UniFi integration is enabled.
- `unifi.consoleId`: required when UniFi integration is enabled.
- `unifi.legacySite`: used for the legacy Network API command endpoint.
- `unifi.blockPath` and `unifi.allowPath`: optional endpoint overrides.

Do not commit real API keys, credentials, or private network details.

## API

List devices:

```http
GET /api/devices
```

Add devices:

```http
POST /api/devices
Content-Type: application/json

{
  "macAddresses": "AA:BB:CC:DD:EE:FF\n11-22-33-44-55-66",
  "groupName": "Alexis",
  "name": "Kids devices",
  "notes": "Block during downtime"
}
```

Remove a device:

```http
DELETE /api/devices/:macAddress
```

Apply the current list:

```http
POST /api/apply/block
POST /api/apply/allow
```

Apply only one group by case-insensitive group name:

```http
POST /api/apply/block
Content-Type: application/json

{
  "groupName": "TVs"
}
```

Check status:

```http
GET /api/status
```

## Deployment

A sample systemd unit is available at `deploy/shutemdown.service`. Review paths, user/group, `PORT`, and hardening settings before installing it.

Typical install flow:

```bash
npm install
npm run build
sudo cp deploy/shutemdown.service /etc/systemd/system/shutemdown.service
sudo systemctl daemon-reload
sudo systemctl enable --now shutemdown
```

## Security Notes

- Keep this app on a trusted LAN unless authentication is added.
- Keep UniFi credentials and API keys server-side only.
- Validate changes in stub mode before enabling real UniFi actions.
- Restrict file permissions on `config/server.yaml` if it contains secrets.
