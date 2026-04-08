export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const { text } = req.body;

  const prompt = `以下の会話・発言から要件を整理してください。

【発言内容】
${text}

以下の形式でMarkdownで出力してください：

## 📋 機能要件
- （必要な機能を箇条書き）

## ⚙️ 非機能要件
- （パフォーマンス・セキュリティ・UXなど）

## ✅ TODO / 次のアクション
- （具体的なタスク）

## 💡 メモ・懸念点
- （気になった点・未決定事項）`;

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
        }),
      }
    );

    const data = await response.json();
    if (!response.ok) throw new Error(data.error?.message || 'Gemini error');
    const result = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    res.status(200).json({ result });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
