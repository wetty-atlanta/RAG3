// このコードはVercelのサーバー上で動きます
const { GoogleGenerativeAI } = require("@google/generative-ai");

let genAI;
let initializationError = null;

// ★★★ 修正点 ★★★
// サーバー機能が起動する一番最初の段階で、APIキーの読み込みを試行します。
try {
  // 環境変数（APIキー）が存在しない場合は、エラーを発生させます。
  if (!process.env.GEMINI_API_KEY) {
    throw new Error("環境変数 'GEMINI_API_KEY' が設定されていません。");
  }
  // APIキーを使ってAIを初期化します。
  genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
} catch (e) {
  // もし初期化でエラーが起きたら、その内容を記録しておきます。
  initializationError = e;
  console.error("AI SDKの初期化エラー:", e);
}


// メインの処理
module.exports = async (req, res) => {
  // ★★★ 修正点 ★★★
  // もし初期化エラーが記録されていたら、その内容をすぐに返します。
  if (initializationError) {
    console.error("初期化エラーを返します:", initializationError.message);
    return res.status(500).json({ error: `AIの初期化に失敗しました: ${initializationError.message}` });
  }

  if (req.method !== 'POST') {
    return res.status(405).send('Method Not Allowed');
  }

  try {
    const { plot, question } = req.body;
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

    const prompt = `あなたはプロの漫画編集者です。提供されたプロットの内容にのみ基づいて、ユーザーからの質問に、親しみやすく分かりやすい言葉で回答してください。\n\n# 制約事項\n- 回答は必ずプロットの記述に基づいたものにしてください。\n- プロットに書かれていない情報については、推測で答えず、「プロット内では言及されていません」と明確に述べてください。\n\n# プロット\n---\n${plot}\n---\n# ユーザーからの質問\n${question}`;
    
    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = response.text();

    res.status(200).json({ answer: text });

  } catch (error) {
    console.error("Gemini API呼び出しエラー:", error);
    res.status(500).json({ error: "AIの呼び出し中にサーバーでエラーが発生しました。" });
  }
};
