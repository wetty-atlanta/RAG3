const { GoogleGenerativeAI } = require("@google/generative-ai");
const admin = require('firebase-admin');

// --- 初期設定 ---

// 一度だけFirebase Admin SDKを初期化
if (admin.apps.length === 0) {
    // Vercelの環境変数からFirebaseの認証情報を読み込む
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
    });
}
const db = admin.firestore();
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const embeddingModel = genAI.getGenerativeModel({ model: "text-embedding-004" });


// --- メイン処理 ---
module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).send('Method Not Allowed');
  }

  try {
    const { question } = req.body;
    if (!question) { return res.status(400).json({ error: "質問がありません。" }); }

    // 1. 質問をベクトル化
    const questionEmbeddingResult = await embeddingModel.embedContent(question);
    const questionEmbedding = questionEmbeddingResult.embedding.values;

    // 2. Firestoreでベクトル類似度検索を実行
    const vectorQuery = db.collection('plot_vectors').findNearest('embedding', questionEmbedding, {
      limit: 5,
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
    res.status(200).json({ answer: text });

  } catch (error) {
    console.error("サーバー機能エラー:", error);
    res.status(500).json({ error: "サーバー内部でエラーが発生しました。", details: error.message });
  }
};
