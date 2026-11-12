import { useEffect, useState } from 'react';
import { api } from '../api.js';

const empty = { cameraName: '', location: '', status: 'ACTIVE' };

export default function Cameras() {
  const [cameras, setCameras] = useState([]);
  const [form, setForm] = useState(empty);
  const [error, setError] = useState('');

  const load = () => api.cameras().then(setCameras).catch((e) => setError(e.message));
  useEffect(() => { load(); }, []);

  const add = async (e) => {
    e.preventDefault();
    try { await api.addCamera(form); setForm(empty); load(); } catch (err) { setError(err.message); }
  };

  const toggle = async (c) => {
    try {
      await api.updateCamera(c.id, { ...c, status: c.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE' });
      load();
    } catch (err) { setError(err.message); }
  };

  const remove = async (id) => {
    if (!window.confirm('Delete this camera record?')) return;
    try { await api.deleteCamera(id); load(); } catch (err) { setError(err.message); }
  };

  return (
    <>
      <h2>Cameras</h2>
      <p className="muted">These are camera records only. No live camera is connected in this version.</p>
      {error && <div className="error">{error}</div>}
      <form className="panel toolbar" onSubmit={add}>
        <label>Camera name<input required value={form.cameraName} onChange={(e) => setForm({ ...form, cameraName: e.target.value })} /></label>
        <label>Location<input value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} /></label>
        <label>Status
          <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
            <option>ACTIVE</option><option>INACTIVE</option>
          </select>
        </label>
        <button type="submit">Add camera</button>
      </form>
      <div className="panel table-wrap">
        <table>
          <thead><tr><th>ID</th><th>Name</th><th>Location</th><th>Status</th><th>Actions</th></tr></thead>
          <tbody>
            {cameras.map((c) => (
              <tr key={c.id}>
                <td>{c.id}</td><td>{c.cameraName}</td><td>{c.location}</td>
                <td><span className={`badge ${c.status}`}>{c.status}</span></td>
                <td>
                  <button className="small secondary" onClick={() => toggle(c)}>Toggle status</button>
                  <button className="small danger" onClick={() => remove(c.id)}>Delete</button>
                </td>
              </tr>
            ))}
            {cameras.length === 0 && <tr><td colSpan="5" className="muted">No cameras registered.</td></tr>}
          </tbody>
        </table>
      </div>
    </>
  );
}
