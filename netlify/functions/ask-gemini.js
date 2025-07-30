const { GoogleGenerativeAI } = require("@google/generative-ai");
const admin = require('firebase-admin');

// (中略... 初期設定部分は変更なし)
if (admin.apps.length === 0) {
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
    });
}
const db = admin.firestore();
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const embeddingModel = genAI.getGenerativeModel({ model: "text-embedding-004" });


// ▼▼▼ メインの処理をNetlifyの形式に書き換え ▼▼▼
exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  try {
    const { question } = JSON.parse(event.body);
    if (!question) {
        return { statusCode: 400, body: JSON.stringify({ error: "質問がありません。" }) };
    }

    const questionEmbeddingResult = await embeddingModel.embedContent(question);
    const questionEmbedding = questionEmbeddingResult.embedding.values;

    const vectorQuery = db.collection('plot_vectors').findNearest('embedding', questionEmbedding, {
      limit: 5,
      distanceMeasure: 'COSINE'
    });
    const querySnapshot = await vectorQuery.get();

    const context = querySnapshot.docs.map(doc => doc.data().text).join("\n\n---\n\n");

    const prompt = `あなたはプロの漫画編集者です。提供された以下の「参考情報」にのみ基づいて、ユーザーからの「質問」に回答してください。\n\n# 参考情報\n---\n${context}\n---\n\n# 質問\n${question}`;
    
    const result = await genAI.getGenerativeModel({ model: "gemini-1.5-flash" }).generateContent(prompt);
    const response = await result.response;
    const text = response.text();

    return {
        statusCode: 200,
        body: JSON.stringify({ answer: text })
    };

  } catch (error) {
    console.error("サーバー機能エラー:", error);
    return {
        statusCode: 500,
        body: JSON.stringify({ error: "サーバー内部でエラーが発生しました。", details: error.message })
    };
  }
};