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


// --- Netlifyのサーバー機能のメイン処理 ---
exports.handler = async (event) => {
  const startTime = Date.now();
  console.log("サーバー機能開始");
  
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  try {
    const { question } = JSON.parse(event.body);
    if (!question) {
        return { statusCode: 400, body: JSON.stringify({ error: "質問がありません。" }) };
    }

    console.log(`[${Date.now() - startTime}ms] 1. 質問のベクトル化を開始...`);
    const questionEmbeddingResult = await embeddingModel.embedContent(question);
    const questionEmbedding = questionEmbeddingResult.embedding.values;
    console.log(`[${Date.now() - startTime}ms] ...ベクトル化完了`);

    console.log(`[${Date.now() - startTime}ms] 2. Firestoreでのベクトル検索を開始...`);
    const vectorQuery = db.collection('plot_vectors').findNearest('embedding', questionEmbedding, { limit: 5, distanceMeasure: 'COSINE' });
    const querySnapshot = await vectorQuery.get();
    console.log(`[${Date.now() - startTime}ms] ...ベクトル検索完了 (${querySnapshot.docs.length}件取得)`);
    
    const context = querySnapshot.docs.map(doc => doc.data().text).join("\n\n---\n\n");
    const prompt = `あなたはプロの漫画編集者です。提供された以下の「参考情報」にのみ基づいて、ユーザーからの「質問」に回答してください。\n\n# 参考情報\n---\n${context}\n---\n\n# 質問\n${question}`;
    
    console.log(`[${Date.now() - startTime}ms] 3. Gemini Flashでの回答生成を開始...`);
    const result = await genAI.getGenerativeModel({ model: "gemini-1.5-flash" }).generateContent(prompt);
    const response = await result.response;
    const text = response.text();
    console.log(`[${Date.now() - startTime}ms] ...回答生成完了`);

    return {
        statusCode: 200,
        body: JSON.stringify({ answer: text })
    };

  } catch (error) {
    console.error(`[${Date.now() - startTime}ms] サーバー機能エラー:`, error);
    return {
        statusCode: 500,
        body: JSON.stringify({ error: "サーバー内部でエラーが発生しました。", details: error.message })
    };
  } finally {
      console.log(`[${Date.now() - startTime}ms] サーバー機能終了`);
  }
};