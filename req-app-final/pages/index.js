import { useState, useRef, useEffect } from 'react';
import Head from 'next/head';

const CHUNK_INTERVAL_MS = 10 * 60 * 1000;

export default function Home() {
  const [phase, setPhase] = useState('idle');
  const [transcript, setTranscript] = useState('');
  const [result, setResult] = useState('');
  const [error, setError] = useState('');
  const [notionStatus, setNotionStatus] = useState('');
  const [elapsed, setElapsed] = useState(0);
  const [waveData, setWaveData] = useState(new Array(32).fill(2));
  const [chunkStatus, setChunkStatus] = useState([]);
  const [status, setStatus] = useState('');

  const mediaRef = useRef(null);
  const transcriptsRef = useRef([]);
  const currentChunkRef = useRef([]);
  const chunkIndexRef = useRef(0);
  const timerRef = useRef(null);
  const chunkTimerRef = useRef(null);
  const analyserRef = useRef(null);
  const animRef = useRef(null);
  const streamRef = useRef(null);
  const isRecordingRef = useRef(false);

  useEffect(() => () => {
    clearInterval(timerRef.current);
    clearTimeout(chunkTimerRef.current);
    cancelAnimationFrame(animRef.current);
  }, []);

  const transcribeBlob = async (blob, index) => {
    setChunkStatus(prev => { const next = [...prev]; next[index] = 'processing'; return next; });
    try {
      const base64 = await blobToBase64(blob);
      const res = await fetch('/api/transcribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ audio: base64 }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      transcriptsRef.current[index] = data.text;
      setChunkStatus(prev => { const next = [...prev]; next[index] = 'done'; return next; });
    } catch (e) {
      transcriptsRef.current[index] = '';
      setChunkStatus(prev => { const next = [...prev]; next[index] = 'error'; return next; });
    }
  };

  const startNewChunk = (stream) => {
    const index = chunkIndexRef.current;
    chunkIndexRef.current += 1;
    currentChunkRef.current = [];
    setChunkStatus(prev => [...prev, 'recording']);

    const mr = new MediaRecorder(stream);
    mr.ondataavailable = e => currentChunkRef.current.push(e.data);
    mr.onstop = () => {
      const blob = new Blob(currentChunkRef.current, { type: 'audio/webm' });
      transcribeBlob(blob, index);
    };
    mr.start();
    mediaRef.current = mr;

    if (isRecordingRef.current) {
      chunkTimerRef.current = setTimeout(() => {
        if (mediaRef.current && mediaRef.current.state === 'recording') {
          mediaRef.current.stop();
          setTimeout(() => { if (isRecordingRef.current) startNewChunk(stream); }, 300);
        }
      }, CHUNK_INTERVAL_MS);
    }
  };

  const startRecording = async () => {
    try {
      setError(''); setTranscript(''); setResult(''); setNotionStatus('');
      setChunkStatus([]); setStatus('');
      transcriptsRef.current = [];
      chunkIndexRef.current = 0;
      isRecordingRef.current = true;

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const audioCtx = new AudioContext();
      const source = audioCtx.createMediaStreamSource(stream);
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 64;
      source.connect(analyser);
      analyserRef.current = analyser;

      const drawWave = () => {
        const arr = new Uint8Array(analyser.frequencyBinCount);
        analyser.getByteFrequencyData(arr);
        setWaveData(Array.from(arr.slice(0, 32)).map(v => Math.max(2, v / 4)));
        animRef.current = requestAnimationFrame(drawWave);
      };
      drawWave();

      startNewChunk(stream);
      setPhase('recording');
      setElapsed(0);
      timerRef.current = setInterval(() => setElapsed(s => s + 1), 1000);
    } catch {
      setError('マイクへのアクセスが拒否されました');
    }
  };

  const stopRecording = async () => {
    isRecordingRef.current = false;
    clearInterval(timerRef.current);
    clearTimeout(chunkTimerRef.current);
    cancelAnimationFrame(animRef.current);
    setWaveData(new Array(32).fill(2));

    if (mediaRef.current && mediaRef.current.state === 'recording') mediaRef.current.stop();
    if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop());

    setPhase('waiting');
    setStatus('文字起こし完了を待っています...');

    const totalChunks = chunkIndexRef.current;
    await new Promise(resolve => {
      const check = setInterval(() => {
        const done = transcriptsRef.current.filter(t => t !== undefined).length;
        if (done >= totalChunks) { clearInterval(check); resolve(); }
      }, 1000);
    });

    const fullTranscript = transcriptsRef.current.filter(Boolean).join(' ');
    setTranscript(fullTranscript);
    setPhase('analyzing');
    setStatus('要件を整理中...');

    try {
      const res2 = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: fullTranscript }),
      });
      const data2 = await res2.json();
      if (data2.error) throw new Error(data2.error);
      setResult(data2.result);
      setPhase('done');
      setStatus('');
    } catch (e) {
      setError(e.message);
      setPhase('idle');
      setStatus('');
    }
  };

  const blobToBase64 = (blob) => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });

  const saveToNotion = async () => {
    setNotionStatus('saving');
    try {
      const res = await fetch('/api/save-notion', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transcript, result }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setNotionStatus('saved');
    } catch (e) {
      setNotionStatus('error');
    }
  };

  const fmt = s => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;

  const renderResult = (md) => {
    return md
      .replace(/^## (.+)$/gm, '<h2>$1</h2>')
      .replace(/^- (.+)$/gm, '<li>$1</li>')
      .replace(/(<li>.*<\/li>\n?)+/gs, m => `<ul>${m}</ul>`)
      .replace(/\n\n/g, '<br/>');
  };

  const chunkIcon = (s) => s === 'recording' ? '🔴' : s === 'processing' ? '⏳' : s === 'done' ? '✅' : s === 'error' ? '❌' : '○';

  return (
    <>
      <Head>
        <title>要件キャプチャー</title>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link href="https://fonts.googleapis.com/css2?family=Zen+Kaku+Gothic+New:wght@400;700;900&family=Space+Mono:wght@400;700&display=swap" rel="stylesheet" />
      </Head>
      <style jsx global>{`
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        :root { --bg: #0a0a0f; --surface: #12121a; --border: #1e1e2e; --accent: #e8ff47; --accent2: #47c8ff; --text: #e8e8f0; --muted: #5a5a7a; }
        body { background: var(--bg); color: var(--text); font-family: 'Zen Kaku Gothic New', sans-serif; min-height: 100vh; display: flex; flex-direction: column; align-items: center; padding: 40px 16px; }
        .mono { font-family: 'Space Mono', monospace; }
      `}</style>

      <div style={{ width: '100%', maxWidth: 720 }}>
        <div style={{ marginBottom: 48, borderLeft: '3px solid var(--accent)', paddingLeft: 16 }}>
          <div className="mono" style={{ color: 'var(--accent)', fontSize: 11, letterSpacing: 4, marginBottom: 8 }}>REQUIREMENTS CAPTURE</div>
          <h1 style={{ fontSize: 'clamp(28px, 5vw, 42px)', fontWeight: 900, lineHeight: 1.1 }}>話して<br /><span style={{ color: 'var(--accent)' }}>要件</span>にする</h1>
        </div>

        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16, padding: 32, marginBottom: 24 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 3, height: 60, marginBottom: 28 }}>
            {waveData.map((h, i) => (
              <div key={i} style={{ width: 4, height: `${h}px`, borderRadius: 2, background: phase === 'recording' ? `hsl(${70 + i * 2}, 90%, ${50 + h / 4}%)` : 'var(--border)', transition: 'height 0.05s ease' }} />
            ))}
          </div>

          {(phase === 'recording' || phase === 'waiting') && (
            <div style={{ textAlign: 'center', marginBottom: 8 }}>
              {phase === 'recording' && <div className="mono" style={{ fontSize: 32, color: 'var(--accent)' }}>{fmt(elapsed)}</div>}
              {chunkStatus.length > 0 && (
                <div className="mono" style={{ fontSize: 11, color: 'var(--muted)', marginTop: 8, display: 'flex', justifyContent: 'center', gap: 8, flexWrap: 'wrap' }}>
                  {chunkStatus.map((s, i) => <span key={i}>{chunkIcon(s)} {i + 1}</span>)}
                </div>
              )}
            </div>
          )}

          <div style={{ textAlign: 'center', marginBottom: 24, minHeight: 24 }}>
            {status && <span style={{ color: 'var(--accent2)', fontSize: 14 }}>🎙 {status}</span>}
            {phase === 'done' && <span style={{ color: '#6dff9a', fontSize: 14 }}>✅ 完了！</span>}
            {error && <span style={{ color: '#ff6d6d', fontSize: 14 }}>⚠ {error}</span>}
          </div>

          <div style={{ display: 'flex', justifyContent: 'center' }}>
            {phase === 'idle' || phase === 'done' ? (
              <button onClick={startRecording} style={{ background: 'var(--accent)', color: '#0a0a0f', border: 'none', borderRadius: 50, width: 80, height: 80, fontSize: 28, cursor: 'pointer', fontWeight: 700, transition: 'transform 0.15s' }}
                onMouseEnter={e => e.target.style.transform = 'scale(1.08)'} onMouseLeave={e => e.target.style.transform = 'scale(1)'}>●</button>
            ) : phase === 'recording' ? (
              <button onClick={stopRecording} style={{ background: '#ff4757', color: '#fff', border: 'none', borderRadius: 50, width: 80, height: 80, fontSize: 22, cursor: 'pointer', fontWeight: 700, animation: 'pulse 1.2s infinite' }}>■</button>
            ) : (
              <div style={{ width: 80, height: 80, borderRadius: 50, border: '3px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--muted)', fontSize: 14 }}>...</div>
            )}
          </div>

          <div className="mono" style={{ textAlign: 'center', marginTop: 12, fontSize: 11, color: 'var(--muted)' }}>
            {phase === 'idle' || phase === 'done' ? 'タップして録音開始（最大60分）' : phase === 'recording' ? 'タップして停止' : ''}
          </div>
        </div>

        {transcript && (
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 20, marginBottom: 16 }}>
            <div className="mono" style={{ fontSize: 10, color: 'var(--muted)', letterSpacing: 3, marginBottom: 12 }}>TRANSCRIPT</div>
            <p style={{ fontSize: 14, lineHeight: 1.8, color: '#a0a0c0' }}>{transcript}</p>
          </div>
        )}

        {result && (
          <div style={{ background: 'var(--surface)', border: '1px solid var(--accent)', borderRadius: 12, padding: 24 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <div className="mono" style={{ fontSize: 10, color: 'var(--accent)', letterSpacing: 3 }}>REQUIREMENTS</div>
              <div>
                <button onClick={() => navigator.clipboard.writeText(result)} style={{ background: 'transparent', border: '1px solid var(--border)', color: 'var(--muted)', borderRadius: 6, padding: '4px 12px', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' }}>コピー</button>
                <button onClick={saveToNotion} style={{ background: notionStatus === 'saved' ? '#2ecc71' : notionStatus === 'error' ? '#e74c3c' : '#000', color: '#fff', border: 'none', borderRadius: 6, padding: '4px 12px', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit', marginLeft: 8 }}>
                  {notionStatus === 'saving' ? '保存中...' : notionStatus === 'saved' ? '✅ 保存済み' : notionStatus === 'error' ? '❌ エラー' : 'Notionに保存'}
                </button>
              </div>
            </div>
            <div style={{ fontSize: 14, lineHeight: 2, color: 'var(--text)' }} dangerouslySetInnerHTML={{ __html: renderResult(result) }} />
          </div>
        )}
      </div>

      <style jsx global>{`
        @keyframes pulse { 0%, 100% { box-shadow: 0 0 0 0 rgba(255,71,87,0.4); } 50% { box-shadow: 0 0 0 12px rgba(255,71,87,0); } }
        h2 { color: var(--accent2); font-size: 15px; margin: 20px 0 8px; font-weight: 700; }
        ul { padding-left: 16px; }
        li { margin: 4px 0; color: #c0c0e0; }
      `}</style>
    </>
  );
}
