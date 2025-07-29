// Vercelサーバー上で動作する最終版コード
const { GoogleGenerativeAI } = require("@google/generative-ai");
const { ChromaClient } = require("@chroma-ai/chroma");
const path = require("path");

// --- 初期設定 ---

// 1. Gemini AIクライアントを初期化
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
// テキストをベクトルに変換するためのEmbeddingモデルを指定
const embeddingModel = genAI.getGenerativeModel({ model: "text-embedding-004" });
// 最終的な回答を生成するためのProモデルを指定
const generativeModel = genAI.getGenerativeModel({ model: "gemini-1.5-pro-latest" });


// 2. ChromaDBクライアントを初期化
// Vercelのサーバー内にあるデータベースファイルのパスを指定
const dbPath = path.join(process.cwd(), "chroma_db");
const client = new ChromaClient({ path: dbPath });


// --- メイン処理 ---
module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).send('Method Not Allowed');
  }

  try {
    // 1. ユーザーからの質問を受け取る
    const { question } = req.body;
    if (!question) {
      return res.status(400).json({ error: "質問がありません。" });
    }

    // 2. 質問をベクトルに変換する
    const questionEmbedding = await embeddingModel.embedContent(question);

    // 3. ChromaDBから関連性の高い知識（プロットの断片）を検索する
    //    あなたのデータベース内のコレクション名に合わせてください (例: 'bella_plot_collection')
    const collection = await client.getCollection({ name: "bella_plot" });
    const results = await collection.query({
      queryEmbeddings: [questionEmbedding.embedding],
      nResults: 5, // 最も関連性の高い断片を5つ取得
    });

    // 4. 取得した知識をコンテキストとして整理する
    const context = results.documents[0].join("\n\n---\n\n");

    // 5. 最終的なプロンプトを組み立てて、Proモデルに質問する
    const prompt = `あなたはプロの漫画編集者です。提供された以下の「参考情報」にのみ基づいて、ユーザーからの「質問」に、親しみやすく分かりやすい言葉で回答してください。

# 参考情報
---
${context}
---

# 質問
${question}`;
    
    const result = await genAI.getGenerativeModel({ model: "gemini-1.5-pro" }).generateContent(prompt);
    const response = await result.response;
    const text = response.text();

    // 6. AIの回答を返す
    res.status(200).json({ answer: text });

  } catch (error) {
    console.error("サーバー機能エラー:", error);
    res.status(500).json({ error: "サーバー内部でエラーが発生しました。", details: error.message });
  }
};