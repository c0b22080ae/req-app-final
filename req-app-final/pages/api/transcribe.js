export const config = {
  api: { bodyParser: { sizeLimit: '25mb' } },
};

// 1チャンクをGroqに送って文字起こしする関数
async function transcribeChunk(base64Audio, index) {
  const base64Data = base64Audio.replace(/^data:audio\/\w+;base64,/, '');
  const buffer = Buffer.from(base64Data, 'base64');

  const formData = new FormData();
  const blob = new Blob([buffer], { type: 'audio/webm' });
  formData.append('file', blob, `chunk_${index}.webm`);
  formData.append('model', 'whisper-large-v3-turbo');
  formData.append('language', 'ja');

  const response = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.GROQ_API_KEY}` },
    body: formData,
  });

  const data = await response.json();
  if (!response.ok) throw new Error(data.error?.message || `Groq error on chunk ${index}`);
  return data.text;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  try {
    const { audio, chunks } = req.body;

    // 複数チャンクの場合（1時間録音モード）
    if (chunks && Array.isArray(chunks)) {
      const results = [];
      for (let i = 0; i < chunks.length; i++) {
        const text = await transcribeChunk(chunks[i], i);
        results.push(text);
        // Groqのレート制限対策：チャンク間に少し待つ
        if (i < chunks.length - 1) {
          await new Promise(r => setTimeout(r, 500));
        }
      }
      const combined = results.join(' ');
      return res.status(200).json({ text: combined, chunkCount: chunks.length });
    }

    // 単一音声の場合（従来モード）
    const text = await transcribeChunk(audio, 0);
    res.status(200).json({ text });

  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
