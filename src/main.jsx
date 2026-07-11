import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';

async function api(path, options = {}) {
  const response = await fetch(path, {
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    ...options
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || 'Request failed');
  }
  return data;
}

function App() {
  const [devices, setDevices] = useState([]);
  const [status, setStatus] = useState(null);
  const [macAddresses, setMacAddresses] = useState('');
  const [name, setName] = useState('');
  const [notes, setNotes] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  async function refresh() {
    const [deviceData, statusData] = await Promise.all([
      api('/api/devices'),
      api('/api/status')
    ]);
    setDevices(deviceData.devices);
    setStatus(statusData);
  }

  useEffect(() => {
    refresh()
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  async function addDevices(event) {
    event.preventDefault();
    setSaving(true);
    setError('');
    setMessage('');

    try {
      const data = await api('/api/devices', {
        method: 'POST',
        body: JSON.stringify({ macAddresses, name, notes })
      });
      setDevices(data.devices);
      setMacAddresses('');
      setName('');
      setNotes('');
      const updatedCount = data.updated?.length || 0;
      setMessage(`Added ${data.added.length} and updated ${updatedCount} device${data.added.length + updatedCount === 1 ? '' : 's'}.`);
      if (data.rejected.length > 0) {
        setError(`${data.rejected.length} item${data.rejected.length === 1 ? '' : 's'} rejected: ${data.rejected.map((item) => item.macAddress || item.reason).join(', ')}`);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function removeDevice(macAddress) {
    setError('');
    setMessage('');

    try {
      const data = await api(`/api/devices/${encodeURIComponent(macAddress)}`, { method: 'DELETE' });
      setDevices(data.devices);
      setMessage(`Removed ${macAddress}.`);
    } catch (err) {
      setError(err.message);
    }
  }

  async function applyChanges(action) {
    setSaving(true);
    setError('');
    setMessage('');

    try {
      const result = await api(`/api/apply/${action}`, { method: 'POST' });
      await refresh();
      setMessage(`${action === 'block' ? 'Blocked' : 'Allowed'} ${result.deviceCount} devices in ${result.mode} mode.`);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="shell">
      <section className="hero">
        <div>
          <p className="eyebrow">UniFi Device Control</p>
          <h1>Shut 'Em Down</h1>
          <p className="lede">Keep a server-side shutdown list of MAC addresses and apply it when you are ready.</p>
        </div>
        <div className="action-row">
          <button className="block" onClick={() => applyChanges('block')} disabled={saving || loading}>
            Block Devices
          </button>
          <button className="allow" onClick={() => applyChanges('allow')} disabled={saving || loading}>
            Allow Devices
          </button>
        </div>
      </section>

      <section className="status-grid" aria-label="Status">
        <article>
          <span>Config</span>
          <strong className={status?.configLoaded ? 'ok' : 'bad'}>{status?.configLoaded ? 'Loaded' : 'Missing'}</strong>
        </article>
        <article>
          <span>UniFi</span>
          <strong>{status?.unifiEnabled ? 'Enabled' : 'Stub mode'}</strong>
        </article>
        <article>
          <span>Last Apply</span>
          <strong>{status?.lastApply?.appliedAt ? `${status.lastApply.action}: ${new Date(status.lastApply.appliedAt).toLocaleString()}` : 'Never'}</strong>
        </article>
      </section>

      {message && <p className="notice success">{message}</p>}
      {error && <p className="notice error">{error}</p>}

      <div className="content-grid">
        <form className="panel form" onSubmit={addDevices}>
          <h2>Add Devices</h2>
          <label>
            MAC addresses
            <textarea
              value={macAddresses}
              onChange={(event) => setMacAddresses(event.target.value)}
              placeholder="AA:BB:CC:DD:EE:FF&#10;11-22-33-44-55-66"
              required
            />
          </label>
          <label>
            Name
            <input value={name} onChange={(event) => setName(event.target.value)} placeholder="Kids iPad" />
          </label>
          <label>
            Notes
            <input value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Block during downtime" />
          </label>
          <button type="submit" disabled={saving}>{saving ? 'Saving...' : 'Add to List'}</button>
        </form>

        <section className="panel devices">
          <div className="panel-head">
            <h2>Devices</h2>
            <span>{devices.length} total</span>
          </div>
          {loading ? (
            <p>Loading devices...</p>
          ) : devices.length === 0 ? (
            <p className="empty">No devices are on the shutdown list yet.</p>
          ) : (
            <div className="device-list">
              {devices.map((device) => (
                <article className="device-card" key={device.macAddress}>
                  <div>
                    <strong>{device.name || 'Unnamed device'}</strong>
                    <code>{device.macAddress}</code>
                    {device.notes && <p>{device.notes}</p>}
                  </div>
                  <button onClick={() => removeDevice(device.macAddress)}>Remove</button>
                </article>
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}

createRoot(document.getElementById('root')).render(<App />);
