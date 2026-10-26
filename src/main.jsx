import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import logo from "./assets/logo.png";
import "./styles.css";

async function api(path, options = {}) {
  const response = await fetch(path, {
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    ...options,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || "Request failed");
  }
  return data;
}

function App() {
  const [devices, setDevices] = useState([]);
  const [schedules, setSchedules] = useState([]);
  const [status, setStatus] = useState(null);
  const [macAddresses, setMacAddresses] = useState("");
  const [groupName, setGroupName] = useState("");
  const [targetGroupName, setTargetGroupName] = useState("");
  const [name, setName] = useState("");
  const [notes, setNotes] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [applying, setApplying] = useState(false);
  const [scheduleGroup, setScheduleGroup] = useState("");
  const [offTime, setOffTime] = useState("21:00");
  const [onTime, setOnTime] = useState("07:00");
  const [scheduleDays, setScheduleDays] = useState([1, 2, 3, 4, 5]);
  const [savingSchedule, setSavingSchedule] = useState(false);

  async function refresh() {
    const [deviceData, statusData, scheduleData] = await Promise.all([
      api("/api/devices"),
      api("/api/status"),
      api("/api/schedules"),
    ]);
    setDevices(deviceData.devices);
    setStatus(statusData);
    setSchedules(scheduleData.schedules);
  }

  useEffect(() => {
    refresh()
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  async function addDevices(event) {
    event.preventDefault();
    setSaving(true);
    setError("");
    setMessage("");

    try {
      const data = await api("/api/devices", {
        method: "POST",
        body: JSON.stringify({ macAddresses, groupName, name, notes }),
      });
      setDevices(data.devices);
      setMacAddresses("");
      setGroupName("");
      setName("");
      setNotes("");
      const updatedCount = data.updated?.length || 0;
      setMessage(
        `Added ${data.added.length} and updated ${updatedCount} device${data.added.length + updatedCount === 1 ? "" : "s"}.`,
      );
      if (data.rejected.length > 0) {
        setError(
          `${data.rejected.length} item${data.rejected.length === 1 ? "" : "s"} rejected: ${data.rejected.map((item) => item.macAddress || item.reason).join(", ")}`,
        );
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function removeDevice(macAddress) {
    if (!window.confirm(`Remove ${macAddress} from the shutdown list?`)) {
      return;
    }

    setError("");
    setMessage("");

    try {
      const data = await api(`/api/devices/${encodeURIComponent(macAddress)}`, {
        method: "DELETE",
      });
      setDevices(data.devices);
      setMessage(`Removed ${macAddress}.`);
    } catch (err) {
      setError(err.message);
    }
  }

  async function applyChanges(action, selectedGroupName = "") {
    const trimmedGroupName = selectedGroupName.trim();
    if (
      action === "block" &&
      !trimmedGroupName &&
      !window.confirm("Block internet access for all configured devices?")
    ) {
      return;
    }

    setApplying(true);
    setError("");
    setMessage("");

    try {
      const result = await api(`/api/apply/${action}`, {
        method: "POST",
        body: JSON.stringify(
          trimmedGroupName ? { groupName: trimmedGroupName } : {},
        ),
      });
      await refresh();
      const target = result.groupName ? ` in ${result.groupName}` : "";
      const outcome =
        result.ok === false
          ? "Partially applied"
          : action === "block"
            ? "Blocked"
            : "Allowed";
      const failures = result.failureCount
        ? ` ${result.failureCount} failed.`
        : "";
      setMessage(
        `${outcome} ${result.deviceCount} devices${target} in ${result.mode} mode.${failures}`,
      );
    } catch (err) {
      setError(err.message);
    } finally {
      setApplying(false);
    }
  }

  async function saveSchedule(event) {
    event.preventDefault();
    setSavingSchedule(true);
    setError("");
    setMessage("");
    try {
      const data = await api("/api/schedules", {
        method: "POST",
        body: JSON.stringify({
          groupName: scheduleGroup,
          offTime,
          onTime,
          days: scheduleDays,
        }),
      });
      setSchedules(data.schedules);
      setMessage(`Saved schedule for ${scheduleGroup}.`);
    } catch (err) {
      setError(err.message);
    } finally {
      setSavingSchedule(false);
    }
  }

  async function removeSchedule(id, group) {
    if (!window.confirm(`Remove the schedule for ${group}?`)) return;
    try {
      const data = await api(`/api/schedules/${encodeURIComponent(id)}`, {
        method: "DELETE",
      });
      setSchedules(data.schedules);
      setMessage(`Removed schedule for ${group}.`);
    } catch (err) {
      setError(err.message);
    }
  }

  function toggleScheduleDay(day) {
    setScheduleDays((current) =>
      current.includes(day)
        ? current.filter((value) => value !== day)
        : [...current, day].sort((a, b) => a - b),
    );
  }

  const groups = [
    ...new Set(devices.map((device) => device.groupName).filter(Boolean)),
  ].sort((a, b) => a.localeCompare(b));
  const busy = saving || applying || loading;
  const dayLabels = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const lastApply = status?.lastApply;
  const blockedCount = devices.filter(
    (device) => device.status === "blocked",
  ).length;
  const allowedCount = devices.filter(
    (device) => device.status !== "blocked",
  ).length;
  const accessState = loading
    ? {
        label: "Loading status...",
        className: "pending",
        detail: "Checking configured devices and UniFi state.",
      }
    : applying
      ? {
          label: "Applying changes...",
          className: "pending",
          detail: "Please wait while UniFi is updated.",
        }
      : error
        ? { label: "Action needs attention", className: "bad", detail: error }
        : blockedCount > 0
          ? {
              label: "Some devices blocked",
              className: "bad",
              detail: `${blockedCount} blocked, ${allowedCount} allowed.`,
            }
          : devices.length > 0
            ? {
                label: "Internet access: Allowed",
                className: "ok",
                detail: "All configured devices are currently allowed.",
              }
            : {
                label: "Internet access: No devices",
                className: "neutral",
                detail: "Add devices below to track their UniFi status.",
              };
  const lastApplyText = lastApply?.appliedAt
    ? `${lastApply.action === "block" ? "Blocked" : "Allowed"} ${lastApply.deviceCount} at ${new Date(lastApply.appliedAt).toLocaleString()}`
    : "Never";

  return (
    <main className="shell">
      <section className="hero">
        <img
          className="hero-logo"
          src={logo}
          alt="Shut 'Em Down Internet Access Denied logo"
        />
        <div className="hero-controls">
          <div
            className={`access-state ${accessState.className}`}
            role="status"
            aria-live="polite"
          >
            <span>Current state</span>
            <strong>{accessState.label}</strong>
            <p>{accessState.detail}</p>
          </div>
          <div className="action-row primary-actions">
            <button
              className="block"
              onClick={() => applyChanges("block")}
              disabled={busy}
            >
              {applying ? "Applying..." : "Block All Devices"}
            </button>
            <button
              className="allow"
              onClick={() => applyChanges("allow")}
              disabled={busy}
            >
              {applying ? "Applying..." : "Allow All Devices"}
            </button>
          </div>
        </div>
      </section>

      <section className="status-grid" aria-label="Status">
        <article>
          <span>Config</span>
          <strong className={status?.configLoaded ? "ok" : "bad"}>
            {status?.configLoaded ? "Loaded" : "Missing"}
          </strong>
        </article>
        <article>
          <span>UniFi connection</span>
          <strong>
            {status?.unifiEnabled
              ? status?.unifiConfigured
                ? "Connected"
                : "Needs config"
              : "Stub mode"}
          </strong>
        </article>
        <article>
          <span>Last action</span>
          <strong>{lastApplyText}</strong>
        </article>
      </section>

      {message && <p className="notice success">{message}</p>}
      {error && <p className="notice error">{error}</p>}

      <section className="panel group-control">
        <div>
          <h2>Group Controls</h2>
          <p>
            Choose a saved group, then block or allow only matching devices.
          </p>
        </div>
        <label>
          Group name
          <select
            value={targetGroupName}
            onChange={(event) => setTargetGroupName(event.target.value)}
            disabled={busy || groups.length === 0}
          >
            <option value="">
              {groups.length === 0 ? "No saved groups" : "Choose a group"}
            </option>
            {groups.map((group) => (
              <option value={group} key={group}>
                {group}
              </option>
            ))}
          </select>
        </label>
        <div className="action-row">
          <button
            className="block"
            onClick={() => applyChanges("block", targetGroupName)}
            disabled={busy || !targetGroupName.trim()}
          >
            Block Group
          </button>
          <button
            className="allow"
            onClick={() => applyChanges("allow", targetGroupName)}
            disabled={busy || !targetGroupName.trim()}
          >
            Allow Group
          </button>
        </div>
      </section>

      <section className="panel schedules">
        <div className="panel-head">
          <div>
            <h2>Automatic Schedules</h2>
            <p>Block and allow one group automatically each week.</p>
          </div>
          <span>{schedules.length} configured</span>
        </div>
        <form className="schedule-form" onSubmit={saveSchedule}>
          <label>
            Group
            <select
              value={scheduleGroup}
              onChange={(event) => setScheduleGroup(event.target.value)}
              required
              disabled={busy || groups.length === 0}
            >
              <option value="">Choose a group</option>
              {groups.map((group) => (
                <option value={group} key={group}>
                  {group}
                </option>
              ))}
            </select>
          </label>
          <label>
            Block at
            <input
              type="time"
              value={offTime}
              onChange={(event) => setOffTime(event.target.value)}
              required
            />
          </label>
          <label>
            Allow at
            <input
              type="time"
              value={onTime}
              onChange={(event) => setOnTime(event.target.value)}
              required
            />
          </label>
          <fieldset>
            <legend>Days</legend>
            <div className="day-picker">
              {dayLabels.map((label, day) => (
                <label key={label}>
                  <input
                    type="checkbox"
                    checked={scheduleDays.includes(day)}
                    onChange={() => toggleScheduleDay(day)}
                  />
                  {label}
                </label>
              ))}
            </div>
          </fieldset>
          <button
            type="submit"
            disabled={busy || savingSchedule || !scheduleGroup}
          >
            {savingSchedule ? "Saving..." : "Save Schedule"}
          </button>
        </form>
        {schedules.length > 0 && (
          <div className="schedule-list">
            {schedules.map((schedule) => (
              <article className="schedule-row" key={schedule.id}>
                <div>
                  <strong>{schedule.groupName}</strong>
                  <span>
                    {schedule.offTime} block / {schedule.onTime} allow -{" "}
                    {schedule.days.map((day) => dayLabels[day]).join(", ")}
                  </span>
                </div>
                <button
                  className="remove"
                  onClick={() =>
                    removeSchedule(schedule.id, schedule.groupName)
                  }
                  disabled={busy}
                >
                  Remove
                </button>
              </article>
            ))}
          </div>
        )}
      </section>

      <div className="content-grid">
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
              {devices.map((device) => {
                const accessStatus =
                  device.status === "blocked" ? "blocked" : "allowed";
                return (
                  <article className="device-card" key={device.macAddress}>
                    <div className="device-main">
                      <div className="device-title-row">
                        <strong>{device.name || "Unnamed device"}</strong>
                        <span className={`state-pill ${accessStatus}`}>
                          {accessStatus === "blocked" ? "Blocked" : "Allowed"}
                        </span>
                      </div>
                      {device.groupName && (
                        <span className="group-pill">{device.groupName}</span>
                      )}
                      <code>{device.macAddress}</code>
                      {device.statusUpdatedAt && (
                        <p>
                          Status checked{" "}
                          {new Date(device.statusUpdatedAt).toLocaleString()}
                        </p>
                      )}
                      {device.notes && <p>{device.notes}</p>}
                    </div>
                    <button
                      className="remove"
                      onClick={() => removeDevice(device.macAddress)}
                      disabled={busy}
                    >
                      Remove
                    </button>
                  </article>
                );
              })}
            </div>
          )}
        </section>

        <form className="panel form" onSubmit={addDevices}>
          <h2>Add Devices</h2>
          <label>
            Group name
            <input
              value={groupName}
              onChange={(event) => setGroupName(event.target.value)}
              placeholder="Alexis"
            />
          </label>
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
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Kids iPad"
            />
          </label>
          <label>
            Notes
            <input
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              placeholder="Block during downtime"
            />
          </label>
          <button type="submit" disabled={busy}>
            {saving ? "Saving..." : "Add to List"}
          </button>
        </form>
      </div>
    </main>
  );
}

createRoot(document.getElementById("root")).render(<App />);
