const { GoogleGenerativeAI } = require("@google/generative-ai");
const admin = require('firebase-admin');

// --- 初期設定 ---
if (admin.apps.length === 0) {
    try {
        const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
        admin.initializeApp({
            credential: admin.credential.cert(serviceAccount)
        });
    } catch (e) {
        console.error("Firebase Admin SDKの初期化に失敗: ", e);
    }
}
const db = admin.firestore();
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const embeddingModel = genAI.getGenerativeModel({ model: "text-embedding-004" });


// --- メイン処理 ---
module.exports = async (req, res) => { // Vercelの場合
// exports.handler = async (event) => { // Netlifyの場合
  // ▼▼▼ Netlifyの場合は以下の2行のコメントを外してください ▼▼▼
  if (event.httpMethod !== 'POST') { return { statusCode: 405, body: 'Method Not Allowed' }; }
  const { question } = JSON.parse(event.body);

  // ▼▼▼ Vercelの場合は以下の2行を使用 ▼▼▼
  if (req.method !== 'POST') { return res.status(405).send('Method Not Allowed'); }
  const { question } = req.body;

  try {
    if (!question) {
        // Vercelの場合
        return res.status(400).json({ error: "質問がありません。" });
        // Netlifyの場合: return { statusCode: 400, body: JSON.stringify({ error: "質問がありません。" }) };
    }

    // 1. 質問をベクトル化
    //    ▼▼▼ ここに taskType を追加しました ▼▼▼
    const questionEmbeddingResult = await embeddingModel.embedContent(
        question,
        "RETRIEVAL_QUERY" // 検索用の質問（QUERY）であることを明記
    );
    const questionEmbedding = questionEmbeddingResult.embedding.values;

    // 2. Firestoreでベクトル類似度検索を実行
    const vectorQuery = db.collection('plot_vectors').findNearest('embedding', questionEmbedding, {
      limit: 10,
      distanceMeasure: 'COSINE'
    });
    const querySnapshot = await vectorQuery.get();

    // 3. 取得したプロットの断片をコンテキストとして整理
    const context = querySnapshot.docs.map(doc => doc.data().text).join("\n\n---\n\n");

    // 4. 最終的なプロンプトを組み立てて、Proモデルに質問
    const prompt = `あなたはプロの漫画編集者です。提供された以下の「参考情報」にのみ基づいて、ユーザーからの「質問」に回答してください。\n\n# 参考情報\n---\n${context}\n---\n\n# 質問\n${question}`;
    
    const result = await genAI.getGenerativeModel({ model: "gemini-1.5-pro" }).generateContent(prompt);
    const response = await result.response;
    const text = response.text();

    // 5. AIの回答を返す
    // Vercelの場合
    return res.status(200).json({ answer: text });
    // Netlifyの場合: return { statusCode: 200, body: JSON.stringify({ answer: text }) };

  } catch (error) {
    console.error("サーバー機能エラー:", error);
    // Vercelの場合
    return res.status(500).json({ error: "サーバー内部でエラーが発生しました。", details: error.message });
    // Netlifyの場合: return { statusCode: 500, body: JSON.stringify({ error: "サーバー内部でエラーが発生しました。", details: error.message }) };
  }
};
