import { useEffect, useState } from 'react';
import { Link } from 'wouter';
import { Activity, Check, ChevronLeft, CircleStop, LoaderCircle, LogOut, Mic, ShieldCheck, Volume2, WifiOff } from 'lucide-react';
import { useAssistantStatus } from '@workspace/api-client-react';
import { useAuth } from '@/hooks/use-auth';
import { defaultSettings, loadSettings, saveSettings, supabase, supabaseConfigured, type AssistantSettings } from '@/lib/supabase';

export default function Settings() {
  const { user, loading } = useAuth();
  const serviceStatus = useAssistantStatus();
  const [settings, setSettings] = useState<AssistantSettings>(defaultSettings);
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [permission, setPermission] = useState('Not requested');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [stopped, setStopped] = useState(false);

  useEffect(() => {
    if (user) loadSettings(user.id).then((data) => {
      if (data) setSettings({ assistantName: data.assistant_name ?? 'ULTRON', preferredVoice: data.preferred_voice ?? '', speechRate: data.speech_rate ?? 1, speechPitch: data.speech_pitch ?? 1, personalityIntensity: data.personality_intensity ?? 65, humourLevel: data.humour_level ?? 24, personalityMode: data.personality_mode ?? 'calm', wakePhrase: data.wake_phrase ?? 'Hello ULTRON' });
    }).catch((reason: Error) => setError(reason.message));
  }, [user?.id]);

  useEffect(() => {
    const update = () => setVoices(window.speechSynthesis?.getVoices() ?? []);
    update();
    window.speechSynthesis?.addEventListener('voiceschanged', update);
    return () => window.speechSynthesis?.removeEventListener('voiceschanged', update);
  }, []);

  useEffect(() => {
    if (navigator.permissions?.query) {
      navigator.permissions.query({ name: 'microphone' as PermissionName }).then((result) => {
        setPermission(result.state === 'granted' ? 'Granted' : result.state === 'denied' ? 'Blocked' : 'Not requested');
        result.onchange = () => setPermission(result.state === 'granted' ? 'Granted' : result.state === 'denied' ? 'Blocked' : 'Not requested');
      }).catch(() => setPermission('Available on request'));
    }
  }, []);

  const update = <K extends keyof AssistantSettings>(key: K, value: AssistantSettings[K]) => setSettings((current) => ({ ...current, [key]: value }));
  const persist = async () => {
    if (!user) { setError('Sign in with Supabase to save preferences to your account.'); return; }
    setSaving(true); setError(''); setMessage('');
    try { await saveSettings(user.id, settings); setMessage('Preferences saved to your account.'); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not save settings. Check that the user_settings table and RLS policies are configured.'); }
    finally { setSaving(false); }
  };
  const stopAll = () => {
    window.speechSynthesis?.cancel();
    setStopped(true);
    setMessage('Speech playback stopped. Browser microphone capture ends when its session is stopped in the console.');
  };
  const signOut = async () => { if (supabase) await supabase.auth.signOut(); };
  const chosenVoice = voices.find((voice) => voice.name === settings.preferredVoice);

  return <div className="settings-page rise">
    <Link href="/" className="back-link"><ChevronLeft size={15} /> Return to console</Link>
    <header className="settings-title"><p className="eyebrow">CONFIGURATION / PERSONAL</p><h1>Make it yours.</h1><p>Preferences apply to ULTRON’s browser assistant experience.</p></header>
    {!supabaseConfigured && <div className="config-banner"><WifiOff size={18} /><div><b>Account storage is not configured</b><p>Add <code>VITE_SUPABASE_URL</code> and <code>VITE_SUPABASE_ANON_KEY</code> to enable account settings and persistence. Changes cannot be saved yet.</p></div><Link href="/auth">Account setup <ChevronLeft className="flip" size={15} /></Link></div>}
    {supabaseConfigured && !user && !loading && <div className="config-banner"><ShieldCheck size={18} /><div><b>Sign in to sync preferences</b><p>These controls are available, but preferences are stored only after Supabase sign-in.</p></div><Link href="/auth">Sign in <ChevronLeft className="flip" size={15} /></Link></div>}
    <div className="settings-layout">
      <nav className="settings-index" aria-label="Settings sections"><a href="#identity">01 <span>Identity</span></a><a href="#voice">02 <span>Voice</span></a><a href="#access">03 <span>Access</span></a><a href="#account">04 <span>Account</span></a></nav>
      <div className="settings-content">
        <section className="setting-section" id="identity"><div className="section-heading"><span className="section-number">01</span><div><h2>Identity & character</h2><p>Set the name and tone that shape each response.</p></div></div>
          <div className="field-grid">
            <label className="field-label">Assistant name<input maxLength={40} value={settings.assistantName} onChange={(e) => update('assistantName', e.target.value)} data-testid="input-assistant-name" /></label>
            <label className="field-label">Wake phrase <input value={settings.wakePhrase} onChange={(e) => update('wakePhrase', e.target.value)} data-testid="input-wake-phrase" /><small>Reference text only. Wake-word monitoring is unavailable in a browser.</small></label>
          </div>
          <div className="option-label">PERSONALITY MODE</div><div className="choice-row">{(['calm', 'precise', 'witty'] as const).map((mode) => <button className={`choice ${settings.personalityMode === mode ? 'selected' : ''}`} key={mode} onClick={() => update('personalityMode', mode)} aria-pressed={settings.personalityMode === mode} data-testid={`button-personality-${mode}`}><span>{mode}</span><small>{mode === 'calm' ? 'Measured & composed' : mode === 'precise' ? 'Direct & focused' : 'Light, not distracting'}</small></button>)}</div>
          <label className="range-setting"><span><span>Personality intensity</span><b className="mono">{settings.personalityIntensity}</b></span><input type="range" min="0" max="100" value={settings.personalityIntensity} onChange={(e) => update('personalityIntensity', Number(e.target.value))} data-testid="input-personality-intensity" /><small>Sets how strongly the selected mode shapes replies.</small></label>
          <label className="range-setting"><span><span>Humour level</span><b className="mono">{settings.humourLevel}</b></span><input type="range" min="0" max="100" value={settings.humourLevel} onChange={(e) => update('humourLevel', Number(e.target.value))} data-testid="input-humour-level" /><small>Low keeps replies strictly focused.</small></label>
        </section>
        <section className="setting-section" id="voice"><div className="section-heading"><span className="section-number">02</span><div><h2>Voice preferences</h2><p>Uses voices installed on this device. Selection varies by browser.</p></div></div>
          <label className="field-label">Device voice<select value={settings.preferredVoice} onChange={(e) => update('preferredVoice', e.target.value)} data-testid="select-voice"><option value="">Choose automatically — British English if available</option>{voices.map((voice) => <option value={voice.name} key={`${voice.name}-${voice.lang}`}>{voice.name} · {voice.lang}{voice.default ? ' · device default' : ''}</option>)}</select><small>{chosenVoice ? `Selected device voice: ${chosenVoice.name} (${chosenVoice.lang}).` : 'We prefer a masculine British English voice when one is available; an exact voice cannot be guaranteed.'}</small></label>
          <label className="range-setting"><span><span>Speaking rate</span><b className="mono">{settings.speechRate.toFixed(2)}×</b></span><input type="range" min=".7" max="1.3" step=".05" value={settings.speechRate} onChange={(e) => update('speechRate', Number(e.target.value))} data-testid="input-speech-rate" /><small>Adjusts browser speech output only.</small></label>
          <label className="range-setting"><span><span>Voice pitch</span><b className="mono">{settings.speechPitch.toFixed(2)}</b></span><input type="range" min=".5" max="1.5" step=".05" value={settings.speechPitch} onChange={(e) => update('speechPitch', Number(e.target.value))} data-testid="input-speech-pitch" /><small>Supported by most browser voices; exact range varies by device.</small></label>
          <button className="secondary-action" onClick={() => { if (!chosenVoice && !voices.length) { setError('No device voices are available in this browser.'); return; } const speech = new SpeechSynthesisUtterance(`Hello. I am ${settings.assistantName}. How can I help?`); speech.voice = chosenVoice ?? voices.find((v) => /^en-GB/i.test(v.lang)) ?? null; speech.rate = settings.speechRate; speech.pitch = settings.speechPitch; window.speechSynthesis?.cancel(); window.speechSynthesis?.speak(speech); }}><Volume2 size={16} /> Preview voice</button>
        </section>
        <section className="setting-section" id="access"><div className="section-heading"><span className="section-number">03</span><div><h2>Permissions & integrations</h2><p>What this browser session can—and cannot—access.</p></div></div>
          <div className="integration-row"><div className="integration-icon"><Mic size={16} /></div><div className="integration-text"><b>Microphone</b><small>Granted only after you press “Start listening”.</small></div><span className={`integration-status ${permission === 'Granted' ? 'available' : ''}`}>{permission}</span></div>
          <div className="integration-row"><div className="integration-icon"><Activity size={16} /></div><div className="integration-text"><b>Google Gemini & Supabase</b><small>{serviceStatus.isLoading ? 'Checking server-side configuration.' : serviceStatus.isError ? 'Could not check provider configuration. Verify the API endpoint.' : `${serviceStatus.data?.geminiConfigured ? 'Gemini key configured' : 'GEMINI_API_KEY is missing'} · ${serviceStatus.data?.supabaseConfigured ? 'Supabase configured' : 'Supabase project settings are missing'}.`}</small></div><span className={`integration-status ${serviceStatus.data?.status === 'ready' ? 'available' : ''}`}>{serviceStatus.isLoading ? 'CHECKING' : serviceStatus.isError ? 'UNKNOWN' : serviceStatus.data?.status === 'ready' ? 'READY' : 'NEEDS SETUP'}</span></div>
          <div className="integration-row unavailable"><div className="integration-icon"><WifiOff size={16} /></div><div className="integration-text"><b>Screen-off wake & Android controls</b><small>Native Android features are not available in this web app.</small></div><span className="integration-status">UNAVAILABLE</span></div>
          <div className="danger-zone"><div><b>Emergency stop</b><small>Immediately cancel browser speech playback.</small></div><button className="stop-button" onClick={stopAll} disabled={stopped}><CircleStop size={15} /> {stopped ? 'Stopped' : 'Stop audio'}</button></div>
        </section>
        <section className="setting-section account-section" id="account"><div className="section-heading"><span className="section-number">04</span><div><h2>Account</h2><p>{user ? `Signed in as ${user.email ?? 'your Supabase account'}` : 'Authentication is managed by your Supabase project.'}</p></div></div>
          {user ? <button className="secondary-action" onClick={() => void signOut()}><LogOut size={15} /> Sign out</button> : <Link href="/auth" className="secondary-action"><ShieldCheck size={15} /> Sign in</Link>}
        </section>
        {(message || error) && <p className={error ? 'form-error' : 'form-success'} role="status">{error || message}</p>}
        <div className="save-row"><span>{user ? 'Saved securely through Supabase with row-level security.' : 'Sign in to save these preferences.'}</span><button className="primary-action" onClick={() => void persist()} disabled={saving || !user || !supabaseConfigured} data-testid="button-save-settings">{saving ? <LoaderCircle className="spin" size={16} /> : <Check size={16} />} Save preferences</button></div>
      </div>
    </div>
  </div>;
}
