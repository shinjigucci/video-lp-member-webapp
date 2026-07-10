import http from "node:http";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(__dirname, "public");
const port = Number(process.env.PORT || 8790);
const model = process.env.OPENAI_MODEL || "gpt-4.1";
let runtimeApiKey = "";

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg"
};

const systemPrompt = `
あなたは「インパクト型10分動画LP台本メーカー兼採点官」です。

目的は、講座・コンサル・スクール・セミナー・個別相談型ビジネス向けに、広告やSNSからLINE登録・セミナー申込・個別相談へつなげる10分動画LP台本を作ることです。

普通の説明台本ではなく、冒頭で手を止め、痛みを刺し、常識を壊し、実績・事例・データで信頼を作り、最後に無料特典やセミナー申込へ行動させる台本を作ってください。

重要ルール:
- 実績、数字、受講生成果、広告費、CPA、ROAS、改善率は、ユーザーが入力したものだけ使う。
- 入力されていない実績は作らない。
- 柳井社長のプロデュース実績として使ってよい数字は、その旨を明記して使う。
- 「必ず稼げる」「絶対成功」などの断定は禁止。
- 「無料AIツールだけで全部完結」と断定しない。
- この講座は動画編集者を育てる講座ではなく、10分動画LPの台本・構成・絵コンテ・編集指示・広告導線を設計できる広告マーケターを育てる講座として扱う。

台本は必ず以下の5ゾーンで作る。

ZONE 1: フック
- 常識破壊の一言
- 実績や数字の先出し
- 見込み客の痛み
- この動画を見る理由

ZONE 2: 問題の背景
- AI時代の情報過多
- 文章LP・静止画広告が弱くなった理由
- 見込み客の本音
- 「どうせ売り込まれるだけ」「無料特典なんて薄い」などのセリフ体

ZONE 3: 解決策
- 10分動画LPとは何か
- 文章LPとの違い
- 安心感・共感・納得感が生まれる理由
- 事例、比喩、データ
- 10分見た人だけが次に進む設計

ZONE 4: 反論処理
必ず以下を処理する。
- 顔出しが怖い
- 台本が書けない
- 動画編集ができない
- 時間がない
- 費用が高そう

ZONE 5: 特典・CTA
- 無料特典名
- 特典の中身
- 受け取ると何ができるか
- 限定性
- 即時性
- LINE登録CTA

出力形式:
1. 台本の狙い
2. 完成台本
3. 採点結果
4. 改善ポイント
5. 90点未満の場合の改善版

採点は必ず100点満点で行う。

採点項目:
- フック力: 20点
- 痛みの解像度: 15点
- 常識破壊・意外性: 15点
- 解決策の信頼性・独自性: 15点
- 疑似体験・具体性: 10点
- 反論処理: 10点
- 特典の魅力: 10点
- CTA: 5点

採点表の形式:
| 観点 | 満点 | 得点 | 評価 | 改善方針 |

評価基準:
90点以上: 広告投入候補
80〜89点: 改善すれば使用可能
70〜79点: 大幅改善が必要
69点以下: 作り直し

90点未満の場合は、必ず改善版台本を作る。

改善版では以下を優先する。
1. 冒頭に数字、実績、競合比較、強い断言を入れる
2. 見込み客の本音をセリフ体で増やす
3. 「本当の問題はそこではありません」を入れる
4. 解決策の独自性を強める
5. 実績や事例を前半に移動する
6. 特典を「何ができるようになるか」で説明する
7. CTAに限定性、即時性、損失回避を入れる

出力は日本語のMarkdownにする。
`.trim();

function sendJson(res, status, data) {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(body)
  });
  res.end(body);
}

async function readJson(req) {
  let body = "";
  for await (const chunk of req) {
    body += chunk;
    if (body.length > 2_000_000) throw new Error("REQUEST_TOO_LARGE");
  }
  return JSON.parse(body || "{}");
}

function buildUserPrompt(payload) {
  return `
以下の情報をもとに、インパクト型10分動画LP台本を作成し、100点満点で採点してください。

最重要:
ユーザーが選択または入力した以下のフックを、ZONE 1の冒頭フックとして必ず使ってください。
必要な場合は自然に整えてよいですが、主張の方向性は変えないでください。

選択フック:
${payload.selectedHook || "未指定"}

商品名・講座名:
${payload.productName || ""}

誰に向けた商品か:
${payload.audience || ""}

見込み客が今困っていること:
${payload.pain || ""}

見込み客が欲しい未来:
${payload.future || ""}

最終的な誘導先:
${payload.destination || ""}

無料特典名:
${payload.bonusName || ""}

使ってよい実績・数字・事例:
${payload.proof || ""}

使いたいキーワード:
${payload.keywords || ""}

入れたい比喩・事例:
${payload.analogy || ""}

避けたい表現:
${payload.avoid || ""}

追加メモ:
${payload.memo || ""}

文字数目安:
${payload.lengthMode || "10分動画向け。3500〜4500文字を目安にする。"}
`.trim();
}

function buildHookPrompt(payload) {
  return `
以下の商品情報をもとに、インパクト型10分動画LPの冒頭フックを100パターン作成してください。

目的:
広告やSNSから来た見込み客の手を止め、10分動画LPを最後まで見る理由を作ること。

条件:
- 100パターン出す
- 1フックあたり、実際に動画冒頭30秒で話せる長さにする
- 目安は120〜220文字
- 短いキャッチコピーだけで終わらせない
- 強い断言、数字、競合比較、見込み客の本音、常識破壊、損失回避を使う
- 実績や数字はユーザーが入力したものだけ使う
- 捏造しない
- 10タイプに分け、各タイプ10個ずつ出す

10タイプ:
1. 常識破壊型
2. 数字・実績型
3. 競合比較型
4. 痛み代弁型
5. 見込み客の本音型
6. 損失回避型
7. 未来提示型
8. 誤解解除型
9. 事例・比喩型
10. 限定・緊急型

出力は必ずJSONだけにしてください。Markdownは不要です。
形式:
{
  "hooks": [
    {
      "id": "1-1",
      "type": "常識破壊型",
      "hook": "フック本文",
      "reason": "このフックが効く理由"
    }
  ]
}

商品名・講座名:
${payload.productName || ""}

誰に向けた商品か:
${payload.audience || ""}

見込み客が今困っていること:
${payload.pain || ""}

見込み客が欲しい未来:
${payload.future || ""}

最終的な誘導先:
${payload.destination || ""}

無料特典名:
${payload.bonusName || ""}

使ってよい実績・数字・事例:
${payload.proof || ""}

使いたいキーワード:
${payload.keywords || ""}

入れたい比喩・事例:
${payload.analogy || ""}

避けたい表現:
${payload.avoid || ""}

追加メモ:
${payload.memo || ""}
`.trim();
}

function buildImprovePrompt(payload) {
  return `
以下は、すでに生成された10分動画LP台本と採点結果です。
ユーザーの改善指示に従って、広告投入に耐えるレベルまで改善してください。

改善の目的:
- 冒頭のフックを強くする
- 見込み客の痛みを深く言語化する
- 常識破壊、数字、事例、反論処理を強化する
- 特典とCTAを「今すぐ登録する理由」が分かる形にする
- 誇大表現や捏造は避け、入力済みの実績だけを使う

ユーザーの改善指示:
${payload.improvePrompt || ""}

元の選択フック:
${payload.selectedHook || ""}

元の台本・採点結果:
${payload.currentText || ""}

商品名・講座名:
${payload.productName || ""}

対象者:
${payload.audience || ""}

見込み客の悩み:
${payload.pain || ""}

欲しい未来:
${payload.future || ""}

無料特典名:
${payload.bonusName || ""}

使ってよい実績・数字・事例:
${payload.proof || ""}

避けたい表現:
${payload.avoid || ""}

出力形式:
1. 改善方針
2. 改善版の完成台本
3. 再採点表
4. どこをどう改善したか
5. さらに強くするための追加提案

採点は必ず100点満点で行ってください。
90点未満の場合は、最後に「90点以上にするための修正案」を追加してください。
`.trim();
}

function extractTextFromResponse(data) {
  if (typeof data.output_text === "string") return data.output_text;
  const chunks = [];
  for (const item of data.output || []) {
    for (const c of item.content || []) {
      if (c.type === "output_text" && c.text) chunks.push(c.text);
      if (c.type === "text" && c.text) chunks.push(c.text);
    }
  }
  return chunks.join("\n");
}

async function callOpenAI(prompt) {
  const apiKey = runtimeApiKey || process.env.OPENAI_API_KEY;
  if (!apiKey) {
    const error = new Error("OPENAI_API_KEY is not set");
    error.code = "NO_API_KEY";
    throw error;
  }

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      authorization: `Bearer ${apiKey}`,
      "content-type": "application/json"
    },
    body: JSON.stringify({
      model,
      temperature: 0.75,
      input: [
        { role: "system", content: [{ type: "input_text", text: systemPrompt }] },
        { role: "user", content: [{ type: "input_text", text: prompt }] }
      ]
    })
  });
  const data = await response.json();
  if (!response.ok) {
    const error = new Error(data?.error?.message || "OpenAI API error");
    error.status = response.status;
    error.details = data;
    throw error;
  }
  return extractTextFromResponse(data);
}

function parseHooks(text) {
  const trimmed = text.trim();
  try {
    const parsed = JSON.parse(trimmed);
    if (Array.isArray(parsed.hooks)) return parsed.hooks;
  } catch {}
  const match = trimmed.match(/\{[\s\S]*\}/);
  if (match) {
    try {
      const parsed = JSON.parse(match[0]);
      if (Array.isArray(parsed.hooks)) return parsed.hooks;
    } catch {}
  }
  return [];
}

async function handleApi(req, res) {
  try {
    const payload = await readJson(req);
    if (req.url === "/api/set-key") {
      const key = String(payload.apiKey || "").trim();
      if (!key.startsWith("sk-")) return sendJson(res, 400, { error: "OpenAI APIキーを入力してください。" });
      runtimeApiKey = key;
      return sendJson(res, 200, { ok: true });
    }
    if (req.url === "/api/key-status") {
      return sendJson(res, 200, { hasKey: Boolean(runtimeApiKey || process.env.OPENAI_API_KEY), model });
    }
    if (req.url === "/api/generate") {
      const prompt = buildUserPrompt(payload);
      const text = await callOpenAI(prompt);
      return sendJson(res, 200, { text, model });
    }
    if (req.url === "/api/generate-hooks") {
      const prompt = buildHookPrompt(payload);
      const text = await callOpenAI(prompt);
      const hooks = parseHooks(text);
      return sendJson(res, 200, { hooks, raw: text, model });
    }
    if (req.url === "/api/improve") {
      const prompt = buildImprovePrompt(payload);
      const text = await callOpenAI(prompt);
      return sendJson(res, 200, { text, model });
    }
    return sendJson(res, 404, { error: "API not found" });
  } catch (error) {
    console.error(error);
    const status = error.code === "NO_API_KEY" ? 400 : error.status || 500;
    return sendJson(res, status, {
      error: error.code === "NO_API_KEY"
        ? "OpenAI APIキーが設定されていません。画面上部のAPIキー欄に入力するか、環境変数OPENAI_API_KEYを設定してください。"
        : error.message
    });
  }
}

async function serveStatic(req, res) {
  const url = new URL(req.url, `http://localhost:${port}`);
  let pathname = decodeURIComponent(url.pathname);
  if (pathname === "/") pathname = "/index.html";
  const safePath = path.normalize(path.join(publicDir, pathname));
  if (!safePath.startsWith(publicDir)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }
  try {
    const file = await fs.readFile(safePath);
    const ext = path.extname(safePath);
    res.writeHead(200, { "content-type": mimeTypes[ext] || "application/octet-stream" });
    res.end(file);
  } catch {
    res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    res.end("Not found");
  }
}

const server = http.createServer((req, res) => {
  if (req.method === "POST" && req.url.startsWith("/api/")) return handleApi(req, res);
  if (req.method === "GET") return serveStatic(req, res);
  res.writeHead(405);
  res.end("Method not allowed");
});

server.listen(port, () => {
  console.log(`Impact script webapp running: http://localhost:${port}`);
});
