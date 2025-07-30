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
        console.error("Firebase Admin SDKの初期化に失敗しました。", e);
        // 初期化に失敗した場合、ここで処理を中断させる
        throw new Error("Firebase Admin SDK initialization failed.");
    }
}
const db = admin.firestore();
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const embeddingModel = genAI.getGenerativeModel({ model: "text-embedding-004" });


// --- メイン処理 ---
module.exports = async (req, res) => {
  console.log("サーバー機能開始");
  try {
    const { question } = req.body;
    if (!question) { return res.status(400).json({ error: "質問がありません。" }); }
    
    console.log(`受け取った質問: ${question}`);

    // --- ▼▼▼ デバッグコード追加 ▼▼▼ ---
    console.log("ステップ1: コレクションへのアクセスを確認します...");
    const collectionRef = db.collection('plot_vectors');
    const sampleDoc = await collectionRef.limit(1).get();
    if (sampleDoc.empty) {
        console.error("致命的エラー: 'plot_vectors'コレクションにドキュメントが見つかりません。");
        return res.status(500).json({ error: "データベースにデータが見つかりません。" });
    }
    console.log(`...コレクションへのアクセス成功。サンプルドキュメントID: ${sampleDoc.docs[0].id}`);
    // --- ▲▲▲ デバッグコード追加 ▲▲▲ ---


    // 1. 質問をベクトル化
    console.log("ステップ2: 質問をベクトル化します...");
    const questionEmbeddingResult = await embeddingModel.embedContent(question);
    const questionEmbedding = questionEmbeddingResult.embedding.values;
    console.log("...ベクトル化成功。");

    // 2. Firestoreでベクトル類似度検索を実行
    console.log("ステップ3: Firestoreでベクトル検索を実行します...");
    const vectorQuery = collectionRef.findNearest('embedding', questionEmbedding, {
      limit: 5,
      distanceMeasure: 'COSINE'
    });
    const querySnapshot = await vectorQuery.get();
    console.log(`...ベクトル検索完了。${querySnapshot.docs.length}件のドキュメントが見つかりました。`);

    // 3. 取得したプロットの断片をコンテキストとして整理
    const context = querySnapshot.docs.map(doc => doc.data().text).join("\n\n---\n\n");
    if (!context) {
        console.log("コンテキストが空です。AIには参考情報なしで質問します。");
    }

    // 4. 最終的なプロンプトを組み立てて、Proモデルに質問
    const prompt = `あなたはプロの漫画編集者です。提供された以下の「参考情報」にのみ基づいて、ユーザーからの「質問」に回答してください。もし参考情報が空の場合は、「参考情報が提供されていませんので、〇〇（質問内容）について何もお答えできません。」と正確に回答してください。\n\n# 参考情報\n---\n${context}\n---\n\n# 質問\n${question}`;
    
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
