import { lazy, Suspense, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { signedOutThisTab, useAuth } from '../auth/AuthContext.jsx';
import { introCardOffset } from '../components/introLayout.js';
const LoginCanopyScene = lazy(() => import('../components/LoginCanopyScene.jsx'));

export default function LoginPage() {
  const { signIn, connectionError, refreshSession } = useAuth();
  const [identifier, setIdentifier] = useState(''), [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(false), [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [forgotOpen, setForgotOpen] = useState(false), [registerHelp, setRegisterHelp] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false), [introComplete, setIntroComplete] = useState(false), [cardAppeared, setCardAppeared] = useState(true); // the card is never hidden by the intro
  const cardRef = useRef(null);
  const cardContentRef = useRef(null);
  const location = useLocation();
  // Straight after signing out (in this tab) the form must be usable at once: no intro, the card starts at home and
  // the ranger is already seated on it.
  const [skipIntro] = useState(() => Boolean(location.state?.signedOut) || signedOutThisTab());
  useLayoutEffect(() => { if (skipIntro) setIntroComplete(true); }, [skipIntro]);

  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReducedMotion(media.matches);
    update();
    media.addEventListener?.('change', update);
    return () => media.removeEventListener?.('change', update);
  }, []);

  // The intro begins with the card off centre (the ranger's rope tows it into place). Place it there before the first
  // paint so it never jumps when the scene loads; if the scene does not take over, or the form is used first, it
  // glides straight home.
  useLayoutEffect(() => {
    const card = cardRef.current, screen = card?.closest('main');
    if (!card || !screen || skipIntro || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return undefined;
    const area = screen.getBoundingClientRect(), parent = card.offsetParent?.getBoundingClientRect();
    if (!parent) return undefined;
    const left = parent.left - area.left + card.offsetLeft, top = parent.top - area.top + card.offsetTop;
    const field = card.querySelector('.auth-field');
    const { dx, dy } = introCardOffset({ W: area.width, H: area.height, card: { left, top, right: left + card.offsetWidth, bottom: top + card.offsetHeight }, inputTop: field ? field.getBoundingClientRect().top - area.top : undefined });
    if (!dx && !dy) return undefined;
    card.style.transform = `translate3d(${dx}px, ${dy}px, 0)`;
    card.classList.add('auth-card-towed');
    const home = () => {
      if (card.dataset.introCard === 'scene') return;
      card.style.transition = 'transform .4s cubic-bezier(.2,.7,.2,1)';
      card.style.transform = '';
      card.classList.remove('auth-card-towed');
    };
    card.addEventListener('pointerdown', home);
    card.addEventListener('focusin', home);
    const timer = window.setTimeout(home, 6000);
    return () => { window.clearTimeout(timer); card.removeEventListener('pointerdown', home); card.removeEventListener('focusin', home); };
  }, []);

  const revealCard = useCallback(() => setCardAppeared(true), []);
  const finishArrival = useCallback(() => { setCardAppeared(true); setIntroComplete(true); }, []);

  const submit = async (event) => {
    event.preventDefault(); setError(''); setBusy(true); setForgotOpen(false);
    try {
      await signIn(identifier.trim(), password, rememberMe, !reducedMotion);
    } catch (loginError) {
      setError(loginError.status === 401 ? 'Those sign-in details were not recognized. Check them and try again.' : loginError.message || 'Unable to sign in right now. Try again shortly.');
    } finally { setBusy(false); }
  };

  return <main className={`auth-login-screen ${introComplete ? 'auth-arrived' : 'auth-warming'} ${reducedMotion ? 'auth-reduced-motion' : ''}`}>
    <img className="auth-forest-plate" src="/images/forest-banyan-backdrop.png" alt="" aria-hidden="true" />
    <Suspense fallback={null}><LoginCanopyScene cardRef={cardRef} reducedMotion={reducedMotion} skipIntro={skipIntro} onCardReveal={revealCard} onComplete={finishArrival} /></Suspense>
    <div className="auth-forest-shade"/>
    <div className="auth-forest-grain" aria-hidden="true"/>
    <header className="auth-brand"><span className="auth-brand-mark">Z</span><span><b>ZOVIVE</b><small>WILDLIFE INTELLIGENCE</small></span></header>
    <div className="auth-scene-layout">
      <section ref={cardRef} className={`auth-card auth-login-card ${cardAppeared ? 'auth-card-visible' : 'auth-card-pending'}`} aria-labelledby="login-title" aria-hidden={!cardAppeared}>
        <div ref={cardContentRef} className="auth-card-content">
        <div className="auth-card-top"><span className="auth-eyebrow"><i/> SECURE FIELD ACCESS</span></div>
        <div className="auth-emblem">⌁</div>
        <h1 id="login-title">Welcome back.</h1>
        <p className="auth-lead">Sign in to your wildlife intelligence workspace.</p>
        <form onSubmit={submit} noValidate>
          <label className="auth-field"><span>Email or username</span><div className="auth-input-wrap"><span aria-hidden="true">◎</span><input type="text" value={identifier} onChange={(event) => setIdentifier(event.target.value)} placeholder="Enter your email or username" autoComplete="username" required maxLength={254}/></div></label>
          <label className="auth-field"><span>Password</span><div className="auth-input-wrap"><span aria-hidden="true">◈</span><input type={showPassword ? 'text' : 'password'} value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Enter your password" autoComplete="current-password" required maxLength={72}/><button className="auth-show-password" type="button" onClick={() => setShowPassword((value) => !value)} aria-label={showPassword ? 'Hide password' : 'Show password'}>{showPassword ? 'Hide' : 'Show'}</button></div></label>
          <div className="auth-form-options"><label className="auth-remember"><input type="checkbox" checked={rememberMe} onChange={(event) => setRememberMe(event.target.checked)}/><span>Remember this device</span></label><button className="auth-forgot" type="button" onClick={() => {setForgotOpen((value) => !value);setError('')}}>Forgot password?</button></div>
          {forgotOpen && <div className="auth-info" role="status">Self-service reset is not configured. Please contact your ZOVIVE administrator to reset your password.</div>}
          {connectionError && <div className="auth-error auth-connection" role="alert"><strong>Backend API is not responding.</strong><span>Run <code>backend\start-local.ps1</code> and leave that terminal open. It uses MySQL when available; otherwise it starts a persistent local development database. On first setup, choose your admin username, email, and password when prompted. There is no default login.</span><button type="button" onClick={refreshSession}>Retry connection</button></div>}
          {error && <div className="auth-error" role="alert">{error}</div>}
          <button className="auth-submit" type="submit" disabled={busy || !identifier.trim() || !password}>
            {busy ? <><span className="auth-spinner"/> Verifying credentials…</> : <>Enter the field workspace <span>→</span></>}
          </button>
        </form>
        <div className="auth-card-foot"><span className="auth-secure-icon">◇</span><span>Protected connection <b>·</b> Role-based access</span><span className="auth-encryption">JWT · HttpOnly</span></div>
        <div className="auth-registration-help"><button type="button" onClick={()=>setRegisterHelp((open)=>!open)} aria-expanded={registerHelp}>{registerHelp?'Hide account setup':'Need an account? How to register'}</button>{registerHelp&&<p>To set up the first account, run <code>backend\start-local.ps1</code> and choose the administrator username, email, and password when prompted. Once signed in, open Settings → Register a field operator to create Forest Officer accounts. There are no built-in credentials or public sign-up.</p>}</div>
        </div>
      </section>
    </div>
    <div className="auth-video-label"><i/> {introComplete ? 'CINEMATIC RAINFOREST' : 'FIELD OFFICER ARRIVING'} <span>·</span> NORTH CANOPY</div>
    <footer className="auth-footer"><span>OBSERVING THE WILD · PROTECTING WHAT MATTERS</span><span className="auth-footer-credit">ZOVIVE · NORTH CANOPY</span></footer>
  </main>;
}
