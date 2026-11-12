import { useEffect, useState } from 'react';
import { api, fmt } from '../api.js';

const STATUSES = ['NEW', 'UNDER_REVIEW', 'RESOLVED'];

export default function Alerts() {
  const [alerts, setAlerts] = useState([]);
  const [filter, setFilter] = useState('');
  const [error, setError] = useState('');

  const load = () => api.alerts().then(setAlerts).catch((e) => setError(e.message));
  useEffect(() => { load(); }, []);

  const change = async (id, status) => {
    try { await api.updateAlertStatus(id, status); load(); } catch (e) { setError(e.message); }
  };

  const shown = filter ? alerts.filter((a) => a.status === filter) : alerts;

  return (
    <>
      <h2>Alerts</h2>
      {error && <div className="error">{error}</div>}
      <div className="toolbar">
        <label>Filter by status
          <select value={filter} onChange={(e) => setFilter(e.target.value)}>
            <option value="">All</option>
            {STATUSES.map((s) => <option key={s}>{s}</option>)}
          </select>
        </label>
      </div>
      <div className="panel table-wrap">
        <table>
          <thead><tr><th>ID</th><th>Alert</th><th>Detection</th><th>Created</th><th>Status</th><th>Update status</th></tr></thead>
          <tbody>
            {shown.map((a) => (
              <tr key={a.id}>
                <td>{a.id}</td><td>{a.alertType}</td><td>{a.detectionId ?? '-'}</td><td>{fmt(a.createdAt)}</td>
                <td><span className={`badge ${a.status}`}>{a.status}</span></td>
                <td>
                  <select value={a.status} onChange={(e) => change(a.id, e.target.value)}>
                    {STATUSES.map((s) => <option key={s}>{s}</option>)}
                  </select>
                </td>
              </tr>
            ))}
            {shown.length === 0 && <tr><td colSpan="6" className="muted">No alerts found.</td></tr>}
          </tbody>
        </table>
      </div>
    </>
  );
}
