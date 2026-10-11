import { useState, type FormEvent } from 'react';
import { Link } from 'wouter';
import { ArrowLeft, ArrowUpRight, Check, ChevronLeft, KeyRound, LoaderCircle, LockKeyhole, Mail, ShieldAlert } from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import { supabase, supabaseConfigured } from '@/lib/supabase';

type AuthMode = 'signin' | 'signup' | 'reset';
export default function Auth() {
  const { user } = useAuth();
  const [mode, setMode] = useState<AuthMode>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [pending, setPending] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!supabase) return;
    setPending(true); setError(''); setNotice('');
    try {
      if (mode === 'signup') {
        const { data, error: authError } = await supabase.auth.signUp({ email, password });
        if (authError) throw authError;
        setNotice(data.session ? 'Your account is ready.' : 'Check your inbox to confirm your email address.');
      } else if (mode === 'reset') {
        const { error: authError } = await supabase.auth.resetPasswordForEmail(email);
        if (authError) throw authError;
        setNotice('If an account matches that address, a reset link is on its way.');
      } else {
        const { error: authError } = await supabase.auth.signInWithPassword({ email, password });
        if (authError) throw authError;
        setNotice('Signed in. Your account session is active.');
      }
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Authentication could not be completed.'); }
    finally { setPending(false); }
  };
  const title = mode === 'signin' ? 'Welcome back.' : mode === 'signup' ? 'Create your account.' : 'Reset your password.';

  return <div className="auth-page rise">
    <div className="auth-return"><Link href="/" className="back-link"><ChevronLeft size={15} /> Back to console</Link></div>
    <div className="auth-layout">
      <aside className="auth-aside">
        <div className="auth-crest"><KeyRound size={21} /></div>
        <p className="eyebrow">ULTRON / ACCOUNT</p>
        <h1>Your voice.<br />Your space.</h1>
        <p className="auth-manifesto">Sign in to keep conversations and preferences linked to your own Supabase account.</p>
        <div className="auth-rule" /><span className="mono auth-caption">PRIVATE BY DESIGN&nbsp; / &nbsp;ROW-LEVEL SECURITY</span>
      </aside>
      <section className="auth-card">
        {user ? <div className="signed-in-state"><span className="success-seal"><Check size={20} /></span><p className="eyebrow">ACCOUNT ACTIVE</p><h2>You're signed in.</h2><p>{user.email}</p><Link href="/" className="primary-action">Return to ULTRON <ArrowUpRight size={16} /></Link></div> :
          <>
            <div className="auth-tabs" role="tablist" aria-label="Account action">
              <button role="tab" aria-selected={mode === 'signin'} className={mode === 'signin' ? 'active' : ''} onClick={() => { setMode('signin'); setError(''); setNotice(''); }}>Sign in</button>
              <button role="tab" aria-selected={mode === 'signup'} className={mode === 'signup' ? 'active' : ''} onClick={() => { setMode('signup'); setError(''); setNotice(''); }}>Create account</button>
            </div>
            <p className="eyebrow auth-eyebrow">{mode === 'reset' ? 'ACCOUNT RECOVERY' : 'SECURE ACCESS'}</p><h2>{title}</h2>
            {!supabaseConfigured ? <div className="auth-config" role="status"><ShieldAlert size={19} /><div><b>Supabase configuration needed</b><p>Authentication is not available yet. Add <code>VITE_SUPABASE_URL</code> and <code>VITE_SUPABASE_ANON_KEY</code> to the app environment to connect sign-in, sign-up, and password reset. No account session is being simulated.</p></div></div> :
              <>
                <p className="auth-intro">{mode === 'reset' ? 'We’ll send a password reset link if the email is registered.' : mode === 'signup' ? 'Your account is created through the connected Supabase project.' : 'Use the credentials for your Supabase account.'}</p>
                <form className="auth-form" onSubmit={(event) => void submit(event)}>
                  <label className="field-label">Email address<span className="input-icon"><Mail size={15} /><input type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" data-testid="input-auth-email" /></span></label>
                  {mode !== 'reset' && <label className="field-label">Password<span className="input-icon"><LockKeyhole size={15} /><input type="password" autoComplete={mode === 'signup' ? 'new-password' : 'current-password'} minLength={6} required value={password} onChange={(e) => setPassword(e.target.value)} placeholder="At least 6 characters" data-testid="input-auth-password" /></span></label>}
                  {error && <p className="form-error" role="alert">{error}</p>}{notice && <p className="form-success" role="status"><Check size={15} />{notice}</p>}
                  <button className="primary-action auth-submit" type="submit" disabled={pending}>{pending ? <LoaderCircle size={16} className="spin" /> : mode === 'reset' ? <Mail size={16} /> : <ArrowUpRight size={16} />}{mode === 'signin' ? 'Sign in' : mode === 'signup' ? 'Create account' : 'Send reset link'}</button>
                </form>
                {mode === 'signin' ? <button className="forgot-link" onClick={() => { setMode('reset'); setError(''); setNotice(''); }}><span>Forgot password?</span><ArrowLeft size={14} /></button> : mode === 'reset' ? <button className="forgot-link" onClick={() => setMode('signin')}><ArrowLeft size={14} /><span>Return to sign in</span></button> : null}
              </>}
            <p className="auth-privacy">Supabase authentication with your project’s configured security policies.</p>
          </>}
      </section>
    </div>
    <div className="auth-bottom"><span>ULTRON / PERSONAL AI</span><span>Browser experience</span></div>
  </div>;
}
