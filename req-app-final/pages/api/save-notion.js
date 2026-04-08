export const config = {
  api: { bodyParser: { sizeLimit: '50mb' } },
};

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const { transcript, result } = req.body;

  const now = new Date().toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' });

  const blocks = [
    {
      object: 'block',
      type: 'heading_2',
      heading_2: {
        rich_text: [{ type: 'text', text: { content: `🎙 録音メモ - ${now}` } }],
      },
    },
    {
      object: 'block',
      type: 'heading_3',
      heading_3: {
        rich_text: [{ type: 'text', text: { content: '📝 文字起こし' } }],
      },
    },
    {
      object: 'block',
      type: 'paragraph',
      paragraph: {
        rich_text: [{ type: 'text', text: { content: transcript || '' } }],
      },
    },
    {
      object: 'block',
      type: 'heading_3',
      heading_3: {
        rich_text: [{ type: 'text', text: { content: '📋 要件整理' } }],
      },
    },
    // 要件整理の内容を段落に分けて追加
    ...result.split('\n').filter(line => line.trim()).map(line => ({
      object: 'block',
      type: 'paragraph',
      paragraph: {
        rich_text: [{ type: 'text', text: { content: line } }],
      },
    })),
    {
      object: 'block',
      type: 'divider',
      divider: {},
    },
  ];

  try {
    const response = await fetch(`https://api.notion.com/v1/blocks/${process.env.NOTION_PAGE_ID}/children`, {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${process.env.NOTION_API_KEY}`,
        'Content-Type': 'application/json',
        'Notion-Version': '2022-06-28',
      },
      body: JSON.stringify({ children: blocks }),
    });

    const data = await response.json();
    if (!response.ok) throw new Error(data.message || 'Notion error');
    res.status(200).json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
