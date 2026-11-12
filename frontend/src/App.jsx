import { Navigate, NavLink, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { api, authApi, fmt } from './api.js';
import { AuthProvider, useAuth } from './auth/AuthContext.jsx';
import LoginPage from './pages/LoginPage.jsx';
const Dashboard = lazy(() => import('./pages/Dashboard.jsx'));
const Detections = lazy(() => import('./pages/Detections.jsx'));
const Alerts = lazy(() => import('./pages/Alerts.jsx'));
const Cameras = lazy(() => import('./pages/Cameras.jsx'));
const Analytics = lazy(() => import('./pages/Analytics.jsx'));

const links = [
  ['/', 'Overview', '◈'], ['/live', 'Live monitoring', '◉'], ['/detections', 'Detections', '⌖'],
  ['/alerts', 'Alerts', '⌁'], ['/cameras', 'Cameras', '▣'], ['/analytics', 'Analytics', '▥'], ['/reports', 'Reports', '▤'], ['/settings', 'Settings', '⚙'],
];

const configuredStation = import.meta.env.VITE_FIELD_STATION || 'North Canopy';
const roleLabel = (role) => role === 'ADMIN' ? 'Administrator' : 'Forest Officer';

function WorkspaceControls({station,setStation,user,onLogout}) {
  const navigate = useNavigate();
  const [searchOpen, setSearchOpen] = useState(false), [query, setQuery] = useState(''), [searchData, setSearchData] = useState(null), [searchBusy, setSearchBusy] = useState(false), [searchError, setSearchError] = useState('');
  const [menu, setMenu] = useState(''), [alerts, setAlerts] = useState(null), [alertError, setAlertError] = useState('');
  const rootRef = useRef(null), inputRef = useRef(null);

  const openSearch = () => { setSearchOpen(true); setMenu(''); setTimeout(() => inputRef.current?.focus(), 0); };
  useEffect(() => {
    const keydown = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); openSearch(); }
      if (e.key === 'Escape') { setSearchOpen(false); setMenu(''); }
    };
    const outside = (e) => { if (!rootRef.current?.contains(e.target)) { setSearchOpen(false); setMenu(''); } };
    const stationToggle = () => setMenu((value) => value === 'station' ? '' : 'station');
    const profileToggle = () => setMenu((value) => value === 'profile' ? '' : 'profile');
    window.addEventListener('keydown', keydown); document.addEventListener('mousedown', outside);
    window.addEventListener('zovive:station', stationToggle); window.addEventListener('zovive:profile', profileToggle);
    return () => { window.removeEventListener('keydown', keydown); document.removeEventListener('mousedown', outside); window.removeEventListener('zovive:station', stationToggle); window.removeEventListener('zovive:profile', profileToggle); };
  }, []);
  useEffect(() => {
    if (!searchOpen || searchData) return;
    let alive = true; setSearchBusy(true); setSearchError('');
    Promise.all([api.detections(), api.cameras(), api.alerts()]).then(([detections,cameras,apiAlerts]) => {
      if (alive) setSearchData([
        ...detections.map((d) => ({kind:'Detection',title:d.species,detail:`${d.location || `Camera ${d.cameraId ?? '—'}`} · ${fmt(d.detectedAt)}`,to:'/detections',id:d.id})),
        ...cameras.map((c) => ({kind:'Camera',title:c.cameraName,detail:`${c.location || 'Location unavailable'} · ${c.status}`,to:'/cameras',id:c.id})),
        ...apiAlerts.map((a) => ({kind:'Alert',title:a.alertType,detail:`${a.status} · ${fmt(a.createdAt)}`,to:'/alerts',id:a.id})),
      ]);
    }).catch((e) => { if (alive) setSearchError(e.message); }).finally(() => { if (alive) setSearchBusy(false); });
    return () => { alive = false; };
  }, [searchOpen, searchData]);
  useEffect(() => {
    if (alerts) return;
    let alive = true; api.alerts().then((rows) => { if (alive) setAlerts(rows); }).catch((e) => { if (alive) setAlertError(e.message); });
    return () => { alive = false; };
  }, [alerts]);

  const filtered = (searchData || []).filter((item) => `${item.kind} ${item.title} ${item.detail}`.toLowerCase().includes(query.trim().toLowerCase())).slice(0,8);
  const selectResult = (item) => { setSearchOpen(false); setQuery(''); navigate(item.to); };
  const openMenu = (name) => { setMenu(menu === name ? '' : name); setSearchOpen(false); };
  const changeStation = () => { localStorage.setItem('zovive.station', configuredStation); setStation(configuredStation); setMenu(''); };
  const openAlerts = (a) => { setMenu(''); navigate('/alerts'); };
  const openProfileLink = (path) => { setMenu(''); navigate(path); };

  return <div className="top-actions workspace-controls" ref={rootRef}>
    <div className="global-search-wrap">
      <button className="global-search-trigger" onClick={openSearch} aria-label="Search detections, cameras, and alerts"><span>⌕</span><span>Search detections, cameras, alerts…</span><kbd>Ctrl K</kbd></button>
      {searchOpen && <div className="popover search-popover"><div className="search-input-row"><span>⌕</span><input ref={inputRef} value={query} onChange={(e)=>setQuery(e.target.value)} onKeyDown={(e)=>{if(e.key==='Enter'&&filtered[0]){e.preventDefault();selectResult(filtered[0])}}} placeholder="Search species, cameras, locations, alerts…"/><button className="popover-close" onClick={()=>setSearchOpen(false)} aria-label="Close search">×</button></div><div className="popover-label">{query ? 'MATCHING RECORDS' : 'SEARCH AVAILABLE RECORDS'}</div>{searchBusy&&<div className="popover-empty">Loading backend records…</div>}{searchError&&<div className="popover-empty error-text">Search unavailable: {searchError}</div>}{!searchBusy&&!searchError&&query&&!filtered.length&&<div className="popover-empty">No records match “{query}”.</div>}{!searchBusy&&!searchError&&!query&&<div className="popover-empty">Type to search loaded detections, cameras, and alerts.</div>}{!searchBusy&&filtered.map((item)=><button className="search-result" key={`${item.kind}-${item.id}`} onClick={()=>selectResult(item)}><span className={`result-icon result-${item.kind.toLowerCase()}`}>{item.kind==='Detection'?'⌖':item.kind==='Camera'?'▣':'!'}</span><span className="result-copy"><b>{item.title}</b><small>{item.detail}</small></span><span className="result-kind">{item.kind}</span></button>)}<div className="search-footer"><span>↑↓ navigate</span><span>ENTER open</span><span>ESC close</span></div></div>}
    </div>
    <div className="popover-anchor"><button className="icon-button notification" onClick={()=>openMenu('notifications')} aria-label="Open notifications">♧{alerts?.some((a)=>a.status==='NEW')&&<i/>}</button>{menu==='notifications'&&<div className="popover notification-popover"><div className="popover-heading"><div><b>Alert activity</b><small>From the monitoring API</small></div><button className="text-action" onClick={()=>openAlerts()}>View all</button></div>{alertError&&<div className="popover-empty error-text">Could not load alerts: {alertError}</div>}{!alerts&&!alertError&&<div className="popover-empty">Loading alerts…</div>}{alerts?.slice(0,5).map((a)=><button className="notification-row" key={a.id} onClick={()=>openAlerts(a)}><span className={`alert-mark alert-mark-${a.status?.toLowerCase()}`}>{a.status==='RESOLVED'?'✓':'!'}</span><span className="result-copy"><b>{a.alertType}</b><small>{a.status?.replace('_',' ')} · {fmt(a.createdAt)}</small></span><span className="row-arrow">↗</span></button>)}{alerts?.length===0&&<div className="popover-empty">No alerts have been recorded.</div>}<div className="popover-footnote">Alert read receipts are not supported by the backend.</div></div>}</div>
    <div className="popover-anchor"><button className="top-avatar" onClick={()=>openMenu('profile')} aria-label="Open operator profile">{user.username.charAt(0).toUpperCase()}</button>{menu==='profile'&&<div className="popover profile-popover"><div className="profile-summary"><div className="avatar">{user.username.charAt(0).toUpperCase()}</div><div><b>{user.username}</b><small>{roleLabel(user.role)} · {user.email}</small></div></div>{user.role==='ADMIN'&&<button className="menu-row" onClick={()=>openProfileLink('/settings')}>Account settings <span>↗</span></button>}<button className="menu-row auth-logout-row" onClick={()=>{setMenu('');onLogout();}}>Sign out <span>↗</span></button></div>}</div>
    <div className="station-control popover-anchor"><button className="station-trigger" onClick={()=>openMenu('station')} aria-expanded={menu==='station'}><span className="station-orb">⌁</span><span><small>CONFIGURED DEFAULT</small><b>{station}</b></span><span className="station-chevron">⌄</span></button>{menu==='station'&&<div className="popover station-popover"><div className="popover-label">FIELD STATION</div><div className="station-choice"><span className="station-orb">⌁</span><span className="result-copy"><b>{station}</b><small>Configured default · Location unavailable</small></span></div><button className="menu-row station-select" onClick={changeStation}>Use configured default <span>✓</span></button><div className="popover-footnote">Station selector will list backend stations when that service is available.</div></div>}</div>
  </div>;
}

function LiveMonitoring() {
  return <section className="page-enter"><div className="page-heading"><div><span className="eyebrow">FIELD OBSERVATION</span><h1>Live monitoring</h1><p>Camera feeds are not connected in this deployment.</p></div><span className="pill pill-muted"><i /> FEED UNAVAILABLE</span></div>
    <div className="feed-panel"><div className="feed-art"><div className="scanline"/><div className="feed-crosshair">+</div><div className="feed-status"><span className="live-dot"/> NO ACTIVE VIDEO SOURCE</div><div className="feed-center"><span className="feed-icon">◉</span><strong>Awaiting camera stream</strong><small>Connect a compatible camera feed to begin live observation.</small></div><div className="feed-coords">FIELD STATION · CAMERA FEED</div></div><aside className="feed-info"><span className="eyebrow">STREAM DETAILS</span><h3>Feed unavailable</h3><p>Camera records are available in Camera Network. No live video source is currently configured.</p><div className="info-line"><span>Connection</span><b className="text-amber">Offline</b></div><div className="info-line"><span>Detection overlay</span><b>Unavailable</b></div></aside></div>
  </section>;
}

function SettingsPage() {
  const { user } = useAuth();
  const [accounts, setAccounts] = useState(null), [accountError, setAccountError] = useState(''), [accountMessage, setAccountMessage] = useState('');
  const [accountForm, setAccountForm] = useState({ username: '', email: '', password: '', role: 'FOREST_OFFICER' }), [savingAccount, setSavingAccount] = useState(false);
  useEffect(() => {
    let alive = true;
    authApi.users().then((rows) => { if (alive) setAccounts(rows); }).catch((error) => { if (alive) setAccountError(error.message); });
    return () => { alive = false; };
  }, []);
  const createAccount = async (event) => {
    event.preventDefault(); setSavingAccount(true); setAccountError(''); setAccountMessage('');
    try {
      const created = await authApi.createUser(accountForm);
      setAccounts((rows) => [...(rows || []), created]);
      setAccountForm({ username: '', email: '', password: '', role: 'FOREST_OFFICER' });
      setAccountMessage(`Account created for ${created.username}. Share the initial password through a secure channel.`);
    } catch (error) { setAccountError(error.message || 'Could not create this account.'); }
    finally { setSavingAccount(false); }
  };
  return <section className="page-enter"><div className="page-heading"><div><span className="eyebrow">WORKSPACE CONFIGURATION</span><h1>Settings</h1><p>Platform configuration and connected services.</p></div></div><div className="surface settings-panel"><div className="panel-heading"><div><span className="eyebrow">PLATFORM</span><h3>Workspace status</h3></div><span className="chart-unit">CONFIGURATION OVERVIEW</span></div><div className="info-line"><span>Workspace</span><b>{configuredStation} · Configured default</b></div><div className="info-line"><span>Backend</span><b>Spring Boot REST integration</b></div><div className="info-line"><span>Signed in as</span><b>{user.username} · {roleLabel(user.role)}</b></div><div className="info-line"><span>Authentication</span><b className="text-success">Protected · HttpOnly JWT cookie</b></div><div className="settings-note">Account and notification preferences are managed by your system administrator.</div></div>
    <div className="surface settings-panel account-admin-panel"><div className="panel-heading"><div><span className="eyebrow">ADMINISTRATION</span><h3>Register a field operator</h3></div><span className="chart-unit">ADMIN ONLY</span></div><p className="account-admin-help">Create accounts for your team. The new user signs in with the username or email and the password you choose. Passwords are stored as BCrypt hashes.</p>
      <form className="account-create-form" onSubmit={createAccount}>
        <label>Username<input required minLength="3" maxLength="64" pattern="[A-Za-z0-9._-]+" autoComplete="off" value={accountForm.username} onChange={(event)=>setAccountForm({...accountForm,username:event.target.value})} placeholder="e.g. forest-officer-01" /></label>
        <label>Email<input required type="email" maxLength="254" autoComplete="email" value={accountForm.email} onChange={(event)=>setAccountForm({...accountForm,email:event.target.value})} placeholder="officer@organization.org" /></label>
        <label>Initial password<input required type="password" minLength="16" maxLength="72" autoComplete="new-password" value={accountForm.password} onChange={(event)=>setAccountForm({...accountForm,password:event.target.value})} placeholder="At least 16 characters" /></label>
        <label>Role<select value={accountForm.role} onChange={(event)=>setAccountForm({...accountForm,role:event.target.value})}><option value="FOREST_OFFICER">Forest Officer</option><option value="ADMIN">Administrator</option></select></label>
        <button className="account-create-button" type="submit" disabled={savingAccount}>{savingAccount?'Creating account…':'Create account'}</button>
      </form>
      {accountError&&<div className="account-feedback account-feedback-error" role="alert">{accountError}</div>}{accountMessage&&<div className="account-feedback" role="status">{accountMessage}</div>}
      <div className="account-roster-heading"><b>Registered accounts</b><span>{accounts?.length ?? '—'}</span></div>
      {accountError&&!accounts?<div className="account-roster-empty">Could not load accounts. Confirm the backend is available and your role is ADMIN.</div>:!accounts?<div className="account-roster-empty">Loading accounts…</div>:<div className="account-roster">{accounts.map((account)=><div className="account-roster-row" key={account.id}><span className="avatar">{account.username.charAt(0).toUpperCase()}</span><span><b>{account.username}</b><small>{account.email}</small></span><em>{roleLabel(account.role)}</em></div>)}</div>}
    </div>
  </section>;
}

function Workspace({ user, onLogout }) {
  const location = useLocation();
  const [station,setStation]=useState(()=>localStorage.getItem('zovive.station')||configuredStation);
  const visibleLinks = user.role === 'ADMIN' ? links : links.filter(([to]) => !['/reports','/settings'].includes(to));
  return <div className="layout">
    <aside className="sidebar">
      <NavLink to="/" className="brand"><span className="brand-mark brand-mark-logo">Z</span><span><b>ZOVIVE</b><small>WILDLIFE INTELLIGENCE</small></span></NavLink>
      <div className="side-label">WORKSPACE</div><nav>{visibleLinks.map(([to, label, icon]) => <NavLink key={to} to={to} end={to === '/'}><span className="nav-icon">{icon}</span>{label}{to === '/alerts' && <span className="nav-pip"/>}</NavLink>)}</nav>
      <div className="sidebar-bottom"><button className="station-card station-card-button" onClick={()=>window.dispatchEvent(new Event('zovive:station'))}><span className="station-orb">⌁</span><div><small>CONFIGURED DEFAULT</small><b>{station}</b></div><span className="station-chevron">⌄</span></button><button className="user-row user-row-button" onClick={()=>window.dispatchEvent(new Event('zovive:profile'))}><div className="avatar">{user.username.charAt(0).toUpperCase()}</div><div><b>{user.username}</b><small>{roleLabel(user.role)}</small></div><span className="user-more">⌄</span></button></div>
    </aside>
    <main className="content"><header className="topbar"><div className="breadcrumb"><span>ZOVIVE</span><b> / </b>{visibleLinks.find(([to]) => to === location.pathname)?.[1] || 'Overview'}</div><WorkspaceControls station={station} setStation={setStation} user={user} onLogout={onLogout}/></header>
      <div className="page-wrap"><Suspense fallback={<div className="loading-state"><span className="loader-orb"/><span>Opening field workspace…</span></div>}><Routes><Route path="/" element={<Dashboard/>}/><Route path="/live" element={<LiveMonitoring/>}/><Route path="/detections" element={<Detections/>}/><Route path="/alerts" element={<Alerts/>}/><Route path="/cameras" element={<Cameras/>}/><Route path="/analytics" element={<Analytics/>}/><Route path="/reports" element={user.role==='ADMIN'?<Analytics/>:<Navigate to="/" replace/>}/><Route path="/settings" element={user.role==='ADMIN'?<SettingsPage/>:<Navigate to="/" replace/>}/><Route path="*" element={<Navigate to="/" replace/>}/></Routes></Suspense></div>
      <footer className="app-footer"><span>ZOVIVE WILDLIFE INTELLIGENCE</span><span>MONITORING WORKSPACE</span></footer>
    </main>
  </div>;
}

function AppRouter() {
  const location = useLocation();
  const { user, ready, signOut, arrivalTransition, finishArrivalTransition } = useAuth();
  useEffect(() => { document.title = 'ZOVIVE · Wildlife Intelligence'; }, []);
  let page;
  if (!ready) page = <main className="auth-boot"><span className="auth-spinner"/> Securing field workspace…</main>;
  else if (location.pathname === '/login') page = user ? <Navigate to={location.state?.from?.pathname || '/'} replace/> : <LoginPage/>;
  else if (!user) page = <Navigate to="/login" replace state={{ from: location }}/>;
  else page = <Workspace user={user} onLogout={signOut}/>;
  return <>{page}{arrivalTransition&&<div className="auth-flight-transition" role="status" aria-live="polite">
    <img className="auth-transition-forest" src="/images/forest-banyan-backdrop.png" alt="" aria-hidden="true" />
    <div className="auth-transition-shade" aria-hidden="true" />
    <img className="auth-transition-officer" src="/images/forest-officer-root-swing.png" alt="" aria-hidden="true" onAnimationEnd={finishArrivalTransition}/>
    <div className="auth-flight-copy"><i/> ACCESS VERIFIED <span>·</span> ENTERING FIELD NETWORK</div>
  </div>}</>;
}

export default function App() {
  return <AuthProvider><AppRouter/></AuthProvider>;
}
