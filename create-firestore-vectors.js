// このファイルは、あなたのPC上で一度だけ実行します。

const { GoogleGenerativeAI } = require("@google/generative-ai");
const admin = require('firebase-admin');
const fs = require('fs').promises;

// --- ▼▼▼ ユーザー設定 ▼▼▼ ---

// 1. あなたのFirebaseプロジェクトの「サービスアカウント秘密鍵」をダウンロードし、
//    このファイルと同じフォルダに `firebase-adminsdk.json` という名前で保存してください。
//    取得方法：Firebase設定 > サービスアカウント > 新しい秘密鍵の生成
const serviceAccount = require('./firebase-adminsdk.json');

// 2. あなたのGoogle AI APIキーを設定
const API_KEY = "AIzaSyAfMoQirUiMbYHEsVYG17Khf0ZgOs9px8U"; // AIzaSy... で始まるキー

// 3. プロットのテキストファイルを、このファイルと同じフォルダに `plot.txt` という名前で保存
const PLOT_FILE_PATH = './plot.txt'; 

// 4. Firestoreに作成するコレクション名
const COLLECTION_NAME = 'plot_vectors';

// --- ▲▲▲ ユーザー設定 ▲▲▲ ---


// Firebase Admin SDKの初期化
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});
const db = admin.firestore();
const genAI = new GoogleGenerativeAI(API_KEY);
const model = genAI.getGenerativeModel({ model: "text-embedding-004" });

// テキストを指定したサイズのチャンクに分割する関数
function chunkText(text, chunkSize = 500, chunkOverlap = 100) {
    const chunks = [];
    let i = 0;
    while (i < text.length) {
        chunks.push(text.substring(i, i + chunkSize));
        i += chunkSize - chunkOverlap;
    }
    return chunks;
}

async function main() {
    console.log('1. プロットファイルを読み込んでいます...');
    const plotText = await fs.readFile(PLOT_FILE_PATH, 'utf-8');

    console.log('2. テキストをチャンクに分割しています...');
    const chunks = chunkText(plotText);
    console.log(`   ${chunks.length}個のチャンクが作成されました。`);

    console.log('3. 各チャンクをベクトル化し、Firestoreに保存しています...');
    const batchSize = 100; // 一度に処理するチャンク数
    for (let i = 0; i < chunks.length; i += batchSize) {
        const batchChunks = chunks.slice(i, i + batchSize);
        const batchResult = await model.batchEmbedContents({
            requests: batchChunks.map(chunk => ({ model: "models/text-embedding-004", content: { parts: [{ text: chunk }] } }))
        });
        
        const batch = db.batch();
        batchResult.embeddings.forEach((embedding, index) => {
            const docRef = db.collection(COLLECTION_NAME).doc();
            batch.set(docRef, {
                text: batchChunks[index],
                embedding: embedding.values
            });
        });
        
        await batch.commit();
        console.log(`   ${i + batchChunks.length} / ${chunks.length} 個のチャンクを処理しました。`);
    }

    console.log('✅ 完了！すべてのチャンクがFirestoreに保存されました。');
    console.log('次に、Firestoreコンソールでベクトルインデックスを作成してください。');
}

main().catch(console.error);
