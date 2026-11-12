import { useEffect, useMemo, useState } from 'react';
import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { api } from '../api.js';

export default function Analytics() {
  const [rows, setRows] = useState([]);
  const [filters, setFilters] = useState({ species: '', from: '', to: '' });
  const [error, setError] = useState('');

  useEffect(() => {
    api.detections(filters).then(setRows).catch((e) => setError(e.message));
  }, [filters]);

  const bySpecies = useMemo(() => {
    const m = {};
    rows.forEach((d) => { m[d.species] = (m[d.species] || 0) + 1; });
    return Object.entries(m).map(([species, count]) => ({ species, count }));
  }, [rows]);

  const byDay = useMemo(() => {
    const m = {};
    rows.forEach((d) => { const day = d.detectedAt.slice(0, 10); m[day] = (m[day] || 0) + 1; });
    return Object.entries(m).sort().map(([day, count]) => ({ day, count }));
  }, [rows]);

  const avgConf = rows.length ? (rows.reduce((s, d) => s + d.confidence, 0) / rows.length).toFixed(1) : '-';

  return (
    <>
      <h2>Reports and Analytics</h2>
      {error && <div className="error">{error}</div>}
      <div className="toolbar">
        <label>Species<input value={filters.species} onChange={(e) => setFilters({ ...filters, species: e.target.value })} /></label>
        <label>From<input type="date" value={filters.from} onChange={(e) => setFilters({ ...filters, from: e.target.value })} /></label>
        <label>To<input type="date" value={filters.to} onChange={(e) => setFilters({ ...filters, to: e.target.value })} /></label>
      </div>

      <div className="cards">
        <div className="card"><div className="num">{error ? '—' : rows.length}</div><div className="lbl">{error ? 'Records unavailable' : 'Records in selection'}</div></div>
        <div className="card"><div className="num">{error ? '—' : bySpecies.length}</div><div className="lbl">{error ? 'Species data unavailable' : 'Distinct species'}</div></div>
        <div className="card"><div className="num">{avgConf}{rows.length ? '%' : ''}</div><div className="lbl">Average confidence</div></div>
      </div>

      <div className="grid2">
        <div className="panel">
          <h3>Detections per species</h3>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={bySpecies}>
              <CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="species" /><YAxis allowDecimals={false} /><Tooltip />
              <Bar dataKey="count" fill="#1f5a44" />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="panel">
          <h3>Detections per day</h3>
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={byDay}>
              <CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="day" /><YAxis allowDecimals={false} /><Tooltip />
              <Line type="monotone" dataKey="count" stroke="#1f5a44" strokeWidth={2} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
    </>
  );
}
