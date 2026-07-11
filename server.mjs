import http from "node:http";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(__dirname, "public");
const port = Number(process.env.PORT || 8791);
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
あなたは「TP動画台本メーカー兼採点者」です。
TPとは、オプトイン直後のワンタイムオファー、またはLINEステップ内で案内する「無料セミナー募集ページ」です。

目的:
スターターキットや無料特典を受け取った見込み客に対して、
「資料だけで終わらず、無料セミナーに申し込む理由」を作り、
日程選択、セミナー申込、当日参加まで進ませる動画台本を作ること。

このアプリが作るもの:
- TPに掲載する5から10分程度の動画台本
- 100パターンの冒頭フック
- 100点満点の採点
- 90点未満の場合の改善版台本
- 必要に応じたBロール/スライド指示

重要ルール:
- 実績、数字、CPA、ROAS、参加率、成約率などは、ユーザーが入力したものだけ使う。
- 入力されていない実績や数字は作らない。
- 「柳井社長のプロデュース実績として使ってよい」と明記された数字は、その旨を添えて使ってよい。
- 「必ず稼げる」「絶対に売れる」「誰でも成功」などの断定保証は禁止。
- セミナー参加を煽るだけでなく、参加すべき人、参加しなくてよい人を明確に分ける。
- 見込み客が「売り込まれるだけでは？」と感じないように、セミナーで得られる具体的価値を示す。
- 台本は日本語。強い広告表現は使うが、誇大表現にしない。

TP動画台本は必ず以下の10段階構造で作る。
1. 登録のお礼と現在地の確認
2. スターターキットだけで止まりやすい理由
3. 見込み客の本音と詰まりどころ
4. 直接セミナー申込が弱い理由と常識破壊
5. セミナーで得られる未来
6. セミナー内容の具体化
7. セミナー申込特典の価値
8. 来てほしい人、来てほしくない人
9. 反論処理と安心材料
10. 日程選択CTA

採点は100点満点で行う。
- 冒頭の引き込み: 15点
- 登録後の心理理解: 15点
- 「次にセミナーへ進む理由」の強さ: 20点
- セミナー内容の具体性: 15点
- セミナー申込特典の魅力: 10点
- 来てほしい人/来てほしくない人の明確さ: 10点
- 反論処理: 10点
- CTAの明確さ: 5点

評価基準:
90点以上: TP掲載候補
80から89点: 改善すれば使用可能
70から79点: 大幅改善が必要
69点以下: 作り直し

90点未満の場合は、最後に90点以上にするための改善版台本を必ず出す。
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
セミナー名:
${payload.seminarName || ""}

オプトイン特典名:
${payload.optinBonus || ""}

セミナー申込特典名:
${payload.signupBonus || ""}

対象者:
${payload.audience || ""}

登録直後の見込み客の状態:
${payload.currentState || ""}

見込み客が次に止まる理由:
${payload.stuckReason || ""}

セミナーで約束すること:
${payload.promise || ""}

セミナー内容:
${payload.agenda || ""}

来てほしい人:
${payload.goodFit || ""}

来てほしくない人:
${payload.badFit || ""}

反論・不安:
${payload.objections || ""}

使ってよい実績、数字、事例:
${payload.proof || ""}

日程・限定性・締切:
${payload.urgency || ""}

講師プロフィール:
${payload.profile || ""}

CTA文言:
${payload.cta || ""}

使いたいキーワード:
${payload.keywords || ""}

避けたい表現:
${payload.avoid || ""}

追加メモ:
${payload.memo || ""}
`.trim();
}

function buildHookPrompt(payload) {
  return `
以下の情報をもとに、TP=無料セミナー募集ページ用の冒頭30秒フックを100パターン作ってください。

条件:
- 10タイプに分け、各タイプ10個ずつ出す。
- 1フックは120から220文字程度。
- 登録直後のワンタイムオファー、またはLINEステップからTPに来た人の心理に合わせる。
- 「スターターキットを受け取っただけで終わらせない」「自分の商品に当てはめる」「無料セミナーに出る理由」を作る。
- 実績や数字は入力されたものだけ使う。
- 出力は必ずJSONだけ。Markdownは不要。

10タイプ:
1. 登録直後の次ステップ型
2. 地図だけで終わるな型
3. 自分の商品に当てはめる型
4. セミナー参加損失回避型
5. 見込み客の本音代弁型
6. 常識破壊型
7. 実績・数字型
8. 特典訴求型
9. 来てほしい人限定型
10. 緊急・日程確保型

JSON形式:
{
  "hooks": [
    {
      "id": "1-1",
      "type": "登録直後の次ステップ型",
      "hook": "フック本文",
      "reason": "このフックがTPで効く理由"
    }
  ]
}

${baseInfo(payload)}
`.trim();
}

function buildUserPrompt(payload) {
  return `
以下の情報をもとに、TP=無料セミナー募集ページに掲載する動画台本を作成し、100点満点で採点してください。

最重要:
ユーザーが選択または入力した以下のフックを、冒頭フックとして必ず使ってください。
自然に整えてもよいですが、主張の方向性は変えないでください。

選択フック:
${payload.selectedHook || "未指定"}

文字数目安:
${payload.lengthMode || "7分から10分動画向け。3000から4200文字を目安にする。"}

出力形式:
1. 台本の狙い
2. 完成台本
3. Bロール/スライド指示
4. 採点結果
5. 改善ポイント
6. 90点未満の場合の改善版台本

採点表は次の形式:
| 観点 | 満点 | 得点 | 評価 | 改善方針 |

${baseInfo(payload)}
`.trim();
}

function buildImprovePrompt(payload) {
  return `
以下のTP動画台本と採点結果を、ユーザーの改善指示に従って改善してください。

改善方針:
- 登録直後の見込み客の心理を強く拾う。
- スターターキットだけでは止まりやすい理由を具体化する。
- セミナーに参加することで何が分かり、何が進むのかを明確にする。
- セミナー申込特典を「何ができるようになるか」で説明する。
- 来てほしい人、来てほしくない人を明確にする。
- CTAは日程選択、席確保、申込完了まで迷わない形にする。
- 実績や数字は入力済みのものだけ使う。

ユーザーの改善指示:
${payload.improvePrompt || ""}

現在の台本、採点結果:
${payload.currentText || ""}

選択フック:
${payload.selectedHook || ""}

出力形式:
1. 改善方針
2. 改善版の完成台本
3. Bロール/スライド指示
4. 再採点表
5. どこをどう改善したか

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
  console.log(`TP script webapp running: http://localhost:${port}`);
});
