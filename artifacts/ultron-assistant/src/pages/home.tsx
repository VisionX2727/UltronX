import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'wouter';
import { getHealthCheckQueryKey, useHealthCheck, useSendAssistantMessage } from '@workspace/api-client-react';
import { ArrowUp, AudioLines, ChevronDown, CircleStop, Clock3, Eye, LoaderCircle, Mic, Monitor, Pause, Plus, Radio, ShieldAlert, Volume2, X } from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import { defaultSettings, supabase, type AssistantSettings } from '@/lib/supabase';

const Sphere = lazy(() => import('@/components/Sphere'));
type Mode = 'IDLE' | 'LISTENING' | 'PROCESSING' | 'SPEAKING' | 'PAUSED' | 'SHUTDOWN' | 'ERROR';
type Turn = { role: 'user' | 'assistant'; content: string; created_at?: string };
type SpeechRecognitionResult = { 0: { transcript: string }; isFinal: boolean };
type SpeechRecognitionEvent = { results: ArrayLike<SpeechRecognitionResult>; resultIndex?: number };
type SpeechRecognitionInstance = { continuous: boolean; interimResults: boolean; lang: string; onresult: ((event: SpeechRecognitionEvent) => void) | null; onerror: (() => void) | null; onend: (() => void) | null; start: () => void; stop: () => void };
type SpeechWindow = Window & { SpeechRecognition?: new () => SpeechRecognitionInstance; webkitSpeechRecognition?: new () => SpeechRecognitionInstance };

const stateCopy: Record<Mode, string> = {
  IDLE: 'ULTRON ONLINE', LISTENING: 'LISTENING...', PROCESSING: 'ANALYZING REQUEST...', SPEAKING: 'RESPONDING...',
  PAUSED: 'VOICE MONITORING PAUSED', SHUTDOWN: 'ULTRON OFFLINE', ERROR: 'MICROPHONE UNAVAILABLE',
};

export default function Home() {
  const { user } = useAuth();
  const api = useSendAssistantMessage();
  const health = useHealthCheck({ query: { queryKey: getHealthCheckQueryKey(), refetchInterval: 60000 } });
  const [mode, setMode] = useState<Mode>('IDLE');
  const [text, setText] = useState('');
  const [turns, setTurns] = useState<Turn[]>([]);
  const [settings, setSettings] = useState<AssistantSettings>(defaultSettings);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [history, setHistory] = useState<Array<{ id: string; title: string; updated_at: string }>>([]);
  const [micLevel, setMicLevel] = useState(0);
  const [waveform, setWaveform] = useState<number[]>(Array(32).fill(0));
  const [micError, setMicError] = useState('');
  const [notice, setNotice] = useState('');
  const [voiceDraft, setVoiceDraft] = useState('');
  const [screenShared, setScreenShared] = useState(false);
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [selectedVoice, setSelectedVoice] = useState<SpeechSynthesisVoice | null>(null);
  const audioRef = useRef<{ stream: MediaStream; context: AudioContext; frame: number } | null>(null);
  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);
  const displayStreamRef = useRef<MediaStream | null>(null);
  const voiceListeningRef = useRef(false);
  const recognitionHeldRef = useRef(true);
  const wakePhraseHeardRef = useRef(false);
  const recognitionRestartRef = useRef<number | null>(null);
  const feedRef = useRef<HTMLDivElement>(null);
  const modeRef = useRef(mode);
  modeRef.current = mode;

  useEffect(() => {
    if (!supabase || !user) return;
    supabase.from('user_settings').select('*').eq('user_id', user.id).maybeSingle().then(({ data }) => {
      if (data) setSettings({ ...defaultSettings, assistantName: data.assistant_name ?? defaultSettings.assistantName, preferredVoice: data.preferred_voice ?? '', speechRate: data.speech_rate ?? 1, speechPitch: data.speech_pitch ?? 1, personalityIntensity: data.personality_intensity ?? 65, humourLevel: data.humour_level ?? 24, personalityMode: data.personality_mode ?? 'calm', wakePhrase: data.wake_phrase ?? defaultSettings.wakePhrase });
    });
    refreshHistory();
  }, [user?.id]);

  const refreshHistory = useCallback(async () => {
    if (!supabase || !user) return;
    const { data } = await supabase.from('conversations').select('id,title,updated_at').eq('user_id', user.id).order('updated_at', { ascending: false }).limit(30);
    if (data) setHistory(data);
  }, [user?.id]);

  useEffect(() => {
    const update = () => {
      const list = window.speechSynthesis?.getVoices() ?? [];
      setVoices(list);
      const stored = list.find((v) => v.name === settings.preferredVoice);
      const british = list.find((v) => /^en-GB/i.test(v.lang) && !/\bfemale\b/i.test(v.name) && /male|daniel|george|oliver|arthur|ryan/i.test(v.name)) ?? list.find((v) => /^en-GB/i.test(v.lang) && !/\bfemale\b/i.test(v.name));
      setSelectedVoice(stored ?? british ?? null);
    };
    update();
    window.speechSynthesis?.addEventListener('voiceschanged', update);
    return () => window.speechSynthesis?.removeEventListener('voiceschanged', update);
  }, [settings.preferredVoice]);

  useEffect(() => {
    if (feedRef.current) feedRef.current.scrollTop = feedRef.current.scrollHeight;
  }, [turns, api.isPending]);

  const stopMic = useCallback(() => {
    voiceListeningRef.current = false;
    recognitionHeldRef.current = true;
    if (recognitionRestartRef.current !== null) window.clearTimeout(recognitionRestartRef.current);
    recognitionRestartRef.current = null;
    const current = audioRef.current;
    if (current) {
      cancelAnimationFrame(current.frame);
      current.stream.getTracks().forEach((track) => track.stop());
      void current.context.close();
      audioRef.current = null;
    }
    recognitionRef.current?.stop();
    recognitionRef.current = null;
    setMicLevel(0);
  }, []);

  const stopScreenShare = useCallback(() => {
    displayStreamRef.current?.getTracks().forEach((track) => track.stop());
    displayStreamRef.current = null;
    setScreenShared(false);
  }, []);

  useEffect(() => () => { stopMic(); stopScreenShare(); }, [stopMic, stopScreenShare]);

  const startRecognition = () => {
    if (!voiceListeningRef.current || recognitionHeldRef.current || recognitionRef.current) return;
    const Rec = (window as SpeechWindow).SpeechRecognition ?? (window as SpeechWindow).webkitSpeechRecognition;
    if (!Rec) return;
    const recognition = new Rec();
    recognition.lang = 'en-GB';
    recognition.interimResults = true;
    recognition.continuous = true;
    recognition.onresult = (event) => {
      const first = event.resultIndex ?? Math.max(0, event.results.length - 1);
      for (let index = first; index < event.results.length; index += 1) {
        const result = event.results[index];
        const transcript = result?.[0]?.transcript?.trim();
        if (!transcript) continue;
        setText(transcript);
        if (!result.isFinal) continue;

        let request = transcript;
        if (!wakePhraseHeardRef.current) {
          const phraseParts = (settings.wakePhrase || 'Hey ULTRON').trim().split(/\s+/).filter(Boolean);
          const phrasePattern = phraseParts.map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('[\\s,!.?\\-]*');
          const wakeMatch = request.match(new RegExp(`^\\s*${phrasePattern}[\\s,!.?\\-]*`, 'i'));
          if (!wakeMatch) {
            setNotice(`Listening for “${settings.wakePhrase || 'Hey ULTRON'}”.`);
            continue;
          }
          wakePhraseHeardRef.current = true;
          request = request.slice(wakeMatch[0].length).trim();
        }

        if (request) {
          recognitionHeldRef.current = true;
          recognition.stop();
          setVoiceDraft(request);
        } else {
          setText('');
          setNotice(`${settings.assistantName} is awake. Go ahead.`);
        }
      }
    };
    recognition.onerror = () => setNotice('Speech recognition paused. Tap Start listening to try again.');
    recognition.onend = () => {
      if (recognitionRef.current === recognition) recognitionRef.current = null;
      if (voiceListeningRef.current && !recognitionHeldRef.current) {
        recognitionRestartRef.current = window.setTimeout(() => {
          recognitionRestartRef.current = null;
          startRecognition();
        }, 350);
      }
    };
    recognitionRef.current = recognition;
    try {
      recognition.start();
    } catch {
      recognitionRef.current = null;
      setNotice('Could not start speech recognition. You can still type a message.');
    }
  };

  const startMic = async () => {
    setMicError('');
    if (!navigator.mediaDevices?.getUserMedia) { setMode('ERROR'); setMicError('Microphone access is not available in this browser.'); return; }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const context = new AudioContext();
      const analyser = context.createAnalyser();
      analyser.fftSize = 256;
      context.createMediaStreamSource(stream).connect(analyser);
      const buffer = new Uint8Array(analyser.fftSize);
      const frequencies = new Uint8Array(analyser.frequencyBinCount);
      let sampleCount = 0;
      const monitor = () => {
        analyser.getByteTimeDomainData(buffer);
        analyser.getByteFrequencyData(frequencies);
        if (++sampleCount % 3 === 0) {
          let energy = 0;
          for (const value of buffer) energy += (value - 128) ** 2;
          setMicLevel(Math.min(1, Math.sqrt(energy / buffer.length) / 46));
          setWaveform(Array.from({ length: 32 }, (_, index) => Math.min(1, frequencies[Math.floor(index * frequencies.length / 32)] / 180)));
        }
        if (audioRef.current) audioRef.current.frame = requestAnimationFrame(monitor);
      };
      audioRef.current = { stream, context, frame: requestAnimationFrame(monitor) };
      voiceListeningRef.current = true;
      recognitionHeldRef.current = false;
      wakePhraseHeardRef.current = false;
      startRecognition();
      const hasSpeechRecognition = Boolean((window as SpeechWindow).SpeechRecognition ?? (window as SpeechWindow).webkitSpeechRecognition);
      if (!hasSpeechRecognition) setNotice('This browser cannot listen for a wake phrase. You can still type your message.');
      else setNotice(`Listening for “${settings.wakePhrase || 'Hey ULTRON'}”. Keep this page open.`);
      setMode('LISTENING');
    } catch {
      setMode('ERROR');
      setMicError('Microphone permission was not granted. Allow access in your browser settings or type a message.');
    }
  };

  const loadConversation = async (id: string) => {
    if (!supabase) return;
    const { data } = await supabase.from('messages').select('role,content,created_at').eq('conversation_id', id).order('created_at', { ascending: true });
    if (data) { setTurns(data as Turn[]); setConversationId(id); }
    setHistoryOpen(false);
  };

  const newConversation = () => { stopMic(); setMode('IDLE'); setTurns([]); setConversationId(null); setText(''); setHistoryOpen(false); };

  const send = async (overrideMessage?: string, screenImage?: string) => {
    const message = (overrideMessage ?? text).trim();
    if (!message || api.isPending) return;
    if (!user) { setNotice('Sign in to send a message.'); return; }
    if (mode === 'SHUTDOWN') { setNotice('Resume ULTRON before sending.'); return; }
    recognitionHeldRef.current = true;
    recognitionRef.current?.stop();
    recognitionRef.current = null;
    if (recognitionRestartRef.current !== null) window.clearTimeout(recognitionRestartRef.current);
    recognitionRestartRef.current = null;
    const nextTurns: Turn[] = [...turns, { role: 'user', content: message }];
    setTurns(nextTurns);
    setText('');
    setMode('PROCESSING');
    setNotice('');
    let activeId = conversationId;
    try {
      if (supabase && !activeId) {
        const { data, error } = await supabase.from('conversations').insert({ user_id: user.id, title: message.slice(0, 72) }).select('id').single();
        if (error) throw error;
        activeId = data.id;
        setConversationId(activeId);
      }
      if (supabase && activeId) {
        const { error } = await supabase.from('messages').insert({ conversation_id: activeId, user_id: user.id, role: 'user', content: message });
        if (error) throw error;
      }
      api.mutate({ data: {
        message,
        history: turns.slice(-12).map((turn) => ({ role: turn.role, content: turn.content })),
        assistantName: settings.assistantName,
        personality: settings.personalityMode,
        personalityIntensity: settings.personalityIntensity,
        humourLevel: settings.humourLevel,
         ...(screenImage ? { screenImage } : {}),
      } }, {
        onSuccess: async (result) => {
          const answer = result.message;
          setTurns((current) => [...current, { role: 'assistant', content: answer }]);
          if (modeRef.current !== 'SHUTDOWN') setMode('SPEAKING');
          if (supabase && activeId) {
            await supabase.from('messages').insert({ conversation_id: activeId, user_id: user.id, role: 'assistant', content: answer });
            await supabase.from('conversations').update({ updated_at: new Date().toISOString() }).eq('id', activeId);
            void refreshHistory();
          }
          if (modeRef.current === 'SHUTDOWN') return;
          if (selectedVoice && 'speechSynthesis' in window) {
            const utterance = new SpeechSynthesisUtterance(answer);
            utterance.voice = selectedVoice;
            utterance.rate = settings.speechRate;
            utterance.pitch = settings.speechPitch;
            utterance.onend = () => {
              if (voiceListeningRef.current && modeRef.current !== 'SHUTDOWN') {
                recognitionHeldRef.current = false;
                startRecognition();
                setMode('LISTENING');
              } else setMode('IDLE');
            };
            window.speechSynthesis.speak(utterance);
          } else if (voiceListeningRef.current) {
            recognitionHeldRef.current = false;
            startRecognition();
            setMode('LISTENING');
          } else setMode('IDLE');
        },
        onError: () => {
          setMode(voiceListeningRef.current ? 'LISTENING' : 'ERROR');
          setNotice('The assistant service could not respond. Your message remains in this session.');
          if (voiceListeningRef.current) {
            recognitionHeldRef.current = false;
            startRecognition();
          }
        },
      });
    } catch (error) {
      setMode('ERROR');
      setNotice(error instanceof Error ? error.message : 'Could not save this conversation.');
    }
  };

  useEffect(() => {
    if (!voiceDraft) return;
    setText(voiceDraft);
    void send(voiceDraft);
    setVoiceDraft('');
  }, [voiceDraft]);

  const beginScreenShare = async () => {
    if (!navigator.mediaDevices?.getDisplayMedia) {
      setNotice('Screen sharing is not available in this browser. Try a current desktop browser.');
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
      displayStreamRef.current = stream;
      stream.getVideoTracks()[0]?.addEventListener('ended', () => {
        if (displayStreamRef.current === stream) {
          displayStreamRef.current = null;
          setScreenShared(false);
          setNotice('Screen sharing has ended.');
        }
      });
      setScreenShared(true);
      setNotice('Screen is shared. ULTRON only receives a still image if you choose Ask about my screen.');
    } catch {
      setNotice('Screen sharing was cancelled. No screen content was sent.');
    }
  };

  const askAboutScreen = async () => {
    const stream = displayStreamRef.current;
    if (!stream || !user || api.isPending) return;
    const video = document.createElement('video');
    video.muted = true;
    video.playsInline = true;
    video.srcObject = stream;
    try {
      await new Promise<void>((resolve, reject) => {
        video.onloadedmetadata = () => resolve();
        video.onerror = () => reject(new Error('Could not read the shared screen.'));
        if (video.readyState >= 1) resolve();
      });
      await video.play();
      const scale = Math.min(1, 1280 / video.videoWidth);
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(video.videoWidth * scale));
      canvas.height = Math.max(1, Math.round(video.videoHeight * scale));
      const context = canvas.getContext('2d');
      if (!context) throw new Error('Screen capture is unavailable.');
      context.drawImage(video, 0, 0, canvas.width, canvas.height);
      const prompt = text.trim() || 'Please inspect this screen capture and help me with what is visible. Describe what you can see and ask before taking any action.';
      let image = canvas.toDataURL('image/jpeg', 0.68);
      if (image.length > 1_450_000) image = canvas.toDataURL('image/jpeg', 0.45);
      if (image.length > 1_500_000) throw new Error('This screen capture is too large to send. Share a smaller window or tab instead.');
      video.pause();
      video.srcObject = null;
      setNotice('Sending one screen image for analysis. Screen video is not recorded.');
      void send(prompt, image);
    } catch (error) {
      video.pause();
      video.srcObject = null;
      setNotice(error instanceof Error ? error.message : 'Could not capture the shared screen.');
    }
  };

  const emergencyStop = () => {
    stopMic();
    stopScreenShare();
    window.speechSynthesis?.cancel();
    setMode('SHUTDOWN');
    setNotice('Audio input and playback have stopped.');
  };
  const pauseAssistant = () => {
    stopMic();
    stopScreenShare();
    window.speechSynthesis?.cancel();
    setMode('PAUSED');
    setNotice('ULTRON is paused. Resume when you are ready.');
  };

  const backendUp = health.data?.status === 'ok' || health.data?.status === 'healthy';
  const status = mode === 'PROCESSING' && api.isPending ? 'PROCESSING' : mode;

  return <div className="workspace rise">
    <div className="console-heading">
      <div><p className="eyebrow"><span className="live-dot" /> PERSONAL CONSOLE <span className="slash">/</span> {user ? 'SIGNED IN' : 'GUEST SESSION'}</p><h1>At your command.</h1><p className="heading-sub">A voice-first companion, ready when you are.</p></div>
      <div className="heading-actions"><button type="button" className="quiet-button" onClick={() => setHistoryOpen((v) => !v)} aria-expanded={historyOpen} data-testid="button-history"><Clock3 size={15} /> History <ChevronDown size={14} /></button><button type="button" className="icon-button" onClick={newConversation} aria-label="New conversation" data-testid="button-new-conversation"><Plus size={19} /></button></div>
    </div>
    {historyOpen && <section className="history-panel" aria-label="Conversation history">
      <div className="history-head"><span className="eyebrow">RECENT CONVERSATIONS</span><button className="icon-button small" onClick={() => setHistoryOpen(false)} aria-label="Close history"><X size={15} /></button></div>
      {!user ? <p className="muted-copy">Sign in to access conversations saved to your account.</p> : history.length ? history.map((item) => <button className="history-row" key={item.id} onClick={() => void loadConversation(item.id)}><span>{item.title}</span><time>{new Date(item.updated_at).toLocaleDateString()}</time></button>) : <p className="muted-copy">No saved conversations yet.</p>}
    </section>}
    <div className="console-grid">
      <section className="assistant-panel">
        <div className="orb-wrap" aria-label="Three dimensional ULTRON energy sphere">
          <div className={`orb-aura ${status.toLowerCase()}`} />
          <Suspense fallback={null}><Sphere level={micLevel} active={status === 'LISTENING' || status === 'PROCESSING' || status === 'SPEAKING'} /></Suspense>
          <span className="orb-coordinate mono">U—01&nbsp;&nbsp; / &nbsp;&nbsp;CORE</span>
        </div>
        <div className="state-readout">
          <span className={`state-led ${status.toLowerCase()}`} />
          <span className="state-name" data-testid="status-assistant">{status}</span>
          <span className="state-divider">/</span><span className="state-caption">{stateCopy[status]}</span>
        </div>
        {status === 'LISTENING' ? <div className="live-waveform" aria-label="Live microphone frequency waveform">{waveform.map((value, i) => <i key={i} style={{ transform: `scaleY(${Math.max(.12, value)})` }} />)}</div> : <p className="sphere-caption">Voice and text, on your terms.</p>}
        {micError && <p role="alert" className="inline-error">{micError}</p>}
        <div className="core-actions">
        {status === 'SHUTDOWN' || status === 'PAUSED' ? <button className="mic-button resume" onClick={() => { setMode('IDLE'); setNotice('ULTRON is ready again. Press Start listening to activate the microphone.'); }}><Radio size={17} /> Resume ULTRON</button> : status === 'LISTENING' ? <button className="mic-button active" onClick={() => { stopMic(); setMode('IDLE'); setNotice('Voice listening stopped.'); }}><CircleStop size={17} /> Stop listening</button> : <button className="mic-button" onClick={() => void startMic()} disabled={status === 'PROCESSING'}><Mic size={17} /> Start listening</button>}
          {status === 'IDLE' && <button className="pause-button" onClick={pauseAssistant} aria-label="Pause ULTRON"><Pause size={14} /></button>}
          <span className="separator-word">OR TYPE BELOW</span>
        </div>
        <div className="voice-guidance"><Mic size={13} /><span>Keep this page open and say “{settings.wakePhrase || 'Hey ULTRON'}” followed by your request. ULTRON replies aloud, then listens again.</span></div>
        <div className="screen-controls">
          {!screenShared ? <button className="secondary-action" onClick={() => void beginScreenShare()} disabled={!user}><Monitor size={15} /> Share screen</button> : <>
            <button className="secondary-action" onClick={() => void askAboutScreen()} disabled={!user || api.isPending}><Eye size={15} /> Ask about my screen</button>
            <button className="stop-button screen-stop" onClick={() => { stopScreenShare(); setNotice('Screen sharing stopped.'); }}><CircleStop size={14} /> Stop sharing</button>
          </>}
          {!user && <span className="screen-signin">Sign in to share a screen with ULTRON.</span>}
        </div>
        <div className="native-note"><ShieldAlert size={14} /><span>Wake listening works only while this page is open and the browser permits speech recognition. Screen review uses one still image only when you press Ask about my screen; sharing can be stopped anytime.</span></div>
      </section>

      <section className="conversation-panel" aria-label="Conversation">
        <div className="conversation-head"><div><span className="eyebrow">SESSION TRANSCRIPT</span><p>{conversationId ? 'Saved conversation' : 'New conversation'}</p></div><span className="backend-indicator"><i className={backendUp ? 'backend-dot up' : 'backend-dot'} />{health.isLoading ? 'CHECKING SERVICE' : backendUp ? 'SERVICE AVAILABLE' : 'SERVICE UNAVAILABLE'}</span></div>
        <div className="transcript" ref={feedRef} aria-live="polite">
          {turns.length === 0 ? <div className="transcript-empty"><div className="empty-mark"><AudioLines size={20} /></div><h2>Clear the air.</h2><p>Ask a question or give ULTRON a task. Responses are generated by the connected assistant service.</p><div className="suggestion-line"><span className="mono">01</span><span>“What should I focus on today?”</span><button onClick={() => setText('What should I focus on today?')} aria-label="Use suggested prompt"><ArrowUp size={14} /></button></div></div> : turns.map((turn, index) => <article className={`turn ${turn.role}`} key={`${index}-${turn.content.slice(0, 12)}`}><span className="turn-label">{turn.role === 'user' ? 'YOU' : settings.assistantName}</span><p>{turn.content}</p></article>)}
          {api.isPending && <div className="turn assistant pending"><span className="turn-label">{settings.assistantName}</span><p><LoaderCircle size={15} className="spin" /> Gathering a response</p></div>}
        </div>
        {notice && <div className="notice" role="status"><span>{notice}</span><button onClick={() => setNotice('')} aria-label="Dismiss notice"><X size={14} /></button></div>}
        <form className="composer" onSubmit={(event) => { event.preventDefault(); void send(); }}>
          <label className="sr-only" htmlFor="message">Message ULTRON</label><textarea id="message" data-testid="input-message" value={text} onChange={(event) => setText(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); void send(); } }} placeholder={user ? 'Ask ULTRON anything…' : 'Sign in to start a conversation…'} rows={2} maxLength={2000} />
          <div className="composer-bottom"><span><kbd>↵</kbd> send&nbsp; · &nbsp;<kbd>⇧ ↵</kbd> new line</span><button className="send-button" type="submit" aria-label="Send message" disabled={!text.trim() || api.isPending || !user || status === 'SHUTDOWN'} data-testid="button-send">{api.isPending ? <LoaderCircle className="spin" size={17} /> : <ArrowUp size={18} />}</button></div>
        </form>
        <p className="transcript-foot"><Volume2 size={13} /> {selectedVoice ? `Spoken with ${selectedVoice.name} · ${selectedVoice.lang}` : 'Device voice output unavailable'} <span>{turns.length}/—</span></p>
      </section>
    </div>
    <div className="under-console">
      <div className="under-item"><span className="micro-icon"><Mic size={15} /></span><div><b>Microphone</b><small>{status === 'LISTENING' ? 'Permission active this session' : 'Activates only when requested'}</small></div></div>
      <div className="under-item"><span className="micro-icon"><Radio size={15} /></span><div><b>Wake phrase</b><small>{settings.wakePhrase || 'Hey ULTRON'} · while page is open</small></div></div>
      <button type="button" className="stop-button" onClick={emergencyStop} disabled={status === 'SHUTDOWN'}><CircleStop size={15} /> Emergency stop</button>
    </div>
    {!user && <div className="sign-in-callout"><span>Conversation history syncs to your account.</span><Link href="/auth">Sign in <ArrowUp size={14} /></Link></div>}
  </div>;
}
