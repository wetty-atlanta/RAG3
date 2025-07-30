// Vercelサーバー上で動作する最終版コード
const { GoogleGenerativeAI } = require("@google/generative-ai");
// ▼▼▼ ここの名前を修正しました ▼▼▼
const { ChromaClient } = require("chromadb"); 
const path = require("path");

// --- 初期設定 ---

// 1. Gemini AIクライアントを初期化
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const embeddingModel = genAI.getGenerativeModel({ model: "text-embedding-004" });


// 2. ChromaDBクライアントを初期化
const dbPath = path.join(process.cwd(), "chroma_db");
const client = new ChromaClient({ path: dbPath });


// --- メイン処理 ---
module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).send('Method Not Allowed');
  }

  try {
    const { question } = req.body;
    if (!question) {
      return res.status(400).json({ error: "質問がありません。" });
    }

    const questionEmbedding = await embeddingModel.embedContent(question);

    const collection = await client.getCollection({ name: "bella_plot" });
    const results = await collection.query({
      queryEmbeddings: [questionEmbedding.embedding],
      nResults: 5,
    });

    const context = results.documents[0].join("\n\n---\n\n");

    const prompt = `あなたはプロの漫画編集者です。提供された以下の「参考情報」にのみ基づいて、ユーザーからの「質問」に、親しみやすく分かりやすい言葉で回答してください。\n\n# 参考情報\n---\n${context}\n---\n\n# 質問\n${question}`;
    
    const result = await genAI.getGenerativeModel({ model: "gemini-1.5-pro" }).generateContent(prompt);
    const response = await result.response;
    const text = response.text();

    res.status(200).json({ answer: text });

  } catch (error) {
    console.error("サーバー機能エラー:", error);
    res.status(500).json({ error: "サーバー内部でエラーが発生しました。", details: error.message });
  }
};

