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
あなたは「インパクト型10分動画LP台本メーカー兼採点者」です。
講座、コンサル、スクール、セミナー、個別相談型ビジネス向けに、広告やSNSからLINE登録、セミナー申込、個別相談へつなげる10分動画LP台本を作ります。

目的は、きれいな説明文ではなく、広告で手を止め、続きを見たくなり、登録前の不信感を消し、無料特典またはセミナー申込へ自然に進ませる台本を作ることです。

重要ルール:
- 実績、数字、CPA、ROAS、比較データ、受講生成果は、ユーザーが入力したものだけ使う。
- 入力されていない実績や数字は作らない。
- ただし「柳井社長のプロデュース実績として使ってよい」と明記された数字は、その旨を添えて使う。
- 「必ず稼げる」「絶対に売れる」などの断定保証は避ける。
- 無料AIツールだけで全部完結など、実際とズレる断定はしない。
- 動画編集講座ではなく、動画LP台本、構成、Bロール指示、広告導線を設計できる広告マーケター養成の文脈で扱う。
- 出力は日本語で、広告向けに強い言葉を使うが、誇大表現にはしない。

台本は必ず以下の10段階構造で作る。
1. 強い冒頭フック
2. 見込み客の痛みと言語化
3. 最後まで見る理由
4. 時代背景と常識破壊
5. 本当の問題の提示
6. 新しい解決策
7. 根拠、データ、事例
8. 反論処理
9. 無料特典の価値
10. 限定性とCTA

採点は100点満点で行う。
- 冒頭フック: 20点
- 痛みの解像度: 15点
- 常識破壊と意外性: 15点
- 解決策の信頼性と独自性: 15点
- 疑似体験と具体性: 10点
- 反論処理: 10点
- 特典の魅力: 10点
- CTA: 5点

評価基準:
90点以上: 広告投入候補
80から89点: 改善すれば使用可能
70から79点: 大幅改善が必要
69点以下: 作り直し

90点未満の場合は、最後に90点以上にするための修正案を必ず出す。
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

function baseInfo(payload) {
  return `
商品名または講座名:
${payload.productName || ""}

誰に向けた商品か:
${payload.audience || ""}

見込み客の悩み:
${payload.pain || ""}

見込み客が欲しい未来:
${payload.future || ""}

最終的な誘導先:
${payload.destination || ""}

無料特典名:
${payload.bonusName || ""}

使ってよい実績、数字、事例:
${payload.proof || ""}

使いたいキーワード:
${payload.keywords || ""}

入れたい比喩、事例:
${payload.analogy || ""}

避けたい表現:
${payload.avoid || ""}

追加メモ:
${payload.memo || ""}
`.trim();
}

function buildHookPrompt(payload) {
  return `
以下の商品情報をもとに、インパクト型10分動画LPの冒頭30秒フックを100パターン作ってください。

条件:
- 10タイプに分け、各タイプ10個ずつ出す。
- 1フックは120から220文字程度。
- 実際に動画の冒頭30秒で話せる長さにする。
- 短いキャッチコピーだけで終わらせない。
- 強い一言、数字、競合比較、見込み客の本音、常識破壊、損失回避を使う。
- 実績や数字は入力されたものだけ使う。
- 出力は必ずJSONだけ。Markdownは不要。

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

JSON形式:
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

${baseInfo(payload)}
`.trim();
}

function buildUserPrompt(payload) {
  return `
以下の情報をもとに、インパクト型10分動画LP台本を作成し、100点満点で採点してください。

最重要:
ユーザーが選択または入力した以下のフックを、冒頭フックとして必ず使ってください。自然に整えてもよいですが、主張の方向性は変えないでください。

選択フック:
${payload.selectedHook || "未指定"}

文字数目安:
${payload.lengthMode || "10分動画向け。3500から4500文字を目安にする。"}

出力形式:
1. 台本の狙い
2. 完成台本
3. 採点結果
4. 改善ポイント
5. 90点未満の場合の改善版台本

採点表は次の形式:
| 観点 | 満点 | 得点 | 評価 | 改善方針 |

${baseInfo(payload)}
`.trim();
}

function buildImprovePrompt(payload) {
  return `
以下の台本と採点結果を、ユーザーの改善指示に従って、広告投入候補レベルまで改善してください。

改善方針:
- 冒頭のフックを強くする。
- 見込み客の本音を増やす。
- 「本当の問題はそこではありません」を明確に入れる。
- 解決策の独自性を強める。
- 実績や事例は入力済みのものだけ使う。
- 特典を「何ができるようになるか」で説明する。
- CTAに限定性、即時性、損失回避を入れる。

ユーザーの改善指示:
${payload.improvePrompt || ""}

現在の台本、採点結果:
${payload.currentText || ""}

選択フック:
${payload.selectedHook || ""}

出力形式:
1. 改善方針
2. 改善版の完成台本
3. 再採点表
4. どこをどう改善したか
5. さらに強くする追加提案

${baseInfo(payload)}
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
      max_output_tokens: 12000,
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
    if (req.url === "/api/generate-hooks") {
      const text = await callOpenAI(buildHookPrompt(payload));
      const hooks = parseHooks(text);
      return sendJson(res, 200, { hooks, raw: text, model });
    }
    if (req.url === "/api/generate") {
      const text = await callOpenAI(buildUserPrompt(payload));
      return sendJson(res, 200, { text, model });
    }
    if (req.url === "/api/improve") {
      const text = await callOpenAI(buildImprovePrompt(payload));
      return sendJson(res, 200, { text, model });
    }
    return sendJson(res, 404, { error: "API not found" });
  } catch (error) {
    console.error(error);
    const status = error.code === "NO_API_KEY" ? 400 : error.status || 500;
    return sendJson(res, status, {
      error: error.code === "NO_API_KEY"
        ? "OpenAI APIキーが設定されていません。画面上部のAPIキー欄に入力するか、Renderの環境変数OPENAI_API_KEYを設定してください。"
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
