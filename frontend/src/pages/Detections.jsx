import { useCallback, useEffect, useState } from 'react';
import { api, fmt } from '../api.js';

const empty = { species: '', confidence: '', location: '', detectedAt: '', cameraId: '' };

export default function Detections() {
  const [rows, setRows] = useState([]);
  const [filters, setFilters] = useState({ species: '', from: '', to: '' });
  const [form, setForm] = useState(empty);
  const [editingId, setEditingId] = useState(null);
  const [error, setError] = useState('');

  const load = useCallback(() => {
    api.detections(filters).then(setRows).catch((e) => setError(e.message));
  }, [filters]);

  useEffect(() => { load(); }, [load]);

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    const payload = {
      species: form.species,
      confidence: Number(form.confidence),
      location: form.location,
      detectedAt: form.detectedAt,
      cameraId: form.cameraId ? Number(form.cameraId) : null,
    };
    try {
      if (editingId) await api.updateDetection(editingId, payload);
      else await api.addDetection(payload);
      setForm(empty); setEditingId(null); load();
    } catch (err) { setError(err.message); }
  };

  const edit = (d) => {
    setEditingId(d.id);
    setForm({
      species: d.species, confidence: d.confidence, location: d.location || '',
      detectedAt: (d.detectedAt || '').slice(0, 16), cameraId: d.cameraId || '',
    });
  };

  const remove = async (id) => {
    if (!window.confirm('Delete this detection record?')) return;
    try { await api.deleteDetection(id); load(); } catch (err) { setError(err.message); }
  };

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  return (
    <>
      <h2>Wildlife Detections</h2>
      {error && <div className="error">{error}</div>}

      <form className="panel toolbar" onSubmit={submit}>
        <label>Species<input required value={form.species} onChange={set('species')} /></label>
        <label>Confidence (%)<input required type="number" min="0" max="100" step="0.1" value={form.confidence} onChange={set('confidence')} /></label>
        <label>Location<input value={form.location} onChange={set('location')} /></label>
        <label>Date and time<input required type="datetime-local" value={form.detectedAt} onChange={set('detectedAt')} /></label>
        <label>Camera ID<input type="number" value={form.cameraId} onChange={set('cameraId')} /></label>
        <button type="submit">{editingId ? 'Update' : 'Add'}</button>
        {editingId && <button type="button" className="secondary" onClick={() => { setEditingId(null); setForm(empty); }}>Cancel</button>}
      </form>

      <div className="toolbar">
        <label>Search species<input value={filters.species} onChange={(e) => setFilters({ ...filters, species: e.target.value })} /></label>
        <label>From<input type="date" value={filters.from} onChange={(e) => setFilters({ ...filters, from: e.target.value })} /></label>
        <label>To<input type="date" value={filters.to} onChange={(e) => setFilters({ ...filters, to: e.target.value })} /></label>
        <button className="secondary" onClick={() => setFilters({ species: '', from: '', to: '' })}>Clear</button>
      </div>

      <div className="panel table-wrap">
        <table>
          <thead><tr><th>ID</th><th>Species</th><th>Confidence</th><th>Location</th><th>Detected at</th><th>Camera</th><th>Actions</th></tr></thead>
          <tbody>
            {rows.map((d) => (
              <tr key={d.id}>
                <td>{d.id}</td><td>{d.species}</td><td>{d.confidence}%</td><td>{d.location}</td>
                <td>{fmt(d.detectedAt)}</td><td>{d.cameraId ?? '-'}</td>
                <td>
                  <button className="small secondary" onClick={() => edit(d)}>Edit</button>
                  <button className="small danger" onClick={() => remove(d.id)}>Delete</button>
                </td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan="7" className="muted">No records found.</td></tr>}
          </tbody>
        </table>
      </div>
    </>
  );
}
