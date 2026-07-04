import http from "node:http";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDirCandidates = [path.join(__dirname, "public"), path.join(__dirname, "公共")];
let publicDir = publicDirCandidates[0];
for (const candidate of publicDirCandidates) {
  try {
    await fs.access(candidate);
    publicDir = candidate;
    break;
  } catch {
    // Try the next candidate. GitHub's translated UI can create "公共".
  }
}
const port = Number(process.env.PORT || 8788);
const model = process.env.OPENAI_MODEL || "gpt-4.1";
const memberAccessCode = String(process.env.MEMBER_ACCESS_CODE || "").trim();
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

function htmlPage(title, body) {
  return `<!doctype html>
<html lang="ja">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${title}</title>
  <style>
    body{margin:0;background:#f4f7fb;color:#142033;font-family:"Yu Gothic","Meiryo",system-ui,sans-serif}
    main{min-height:100vh;display:grid;place-items:center;padding:24px}
    section{width:min(520px,100%);background:#fff;border:1px solid #d9e2ef;border-radius:10px;box-shadow:0 18px 45px rgba(16,27,45,.10);padding:30px}
    h1{font-size:26px;line-height:1.35;margin:0 0 12px}
    p{color:#667085;line-height:1.8}
    form{display:grid;gap:12px;margin-top:20px}
    input{border:1px solid #c9d5e6;border-radius:8px;padding:14px;font-size:16px}
    button{border:0;border-radius:8px;background:#1f6feb;color:#fff;font-weight:800;padding:14px 18px;cursor:pointer}
    .error{color:#b42318;background:#fff1f0;border:1px solid #ffccc7;border-radius:8px;padding:10px 12px}
  </style>
</head>
<body><main>${body}</main></body></html>`;
}

function parseCookies(req) {
  const header = req.headers.cookie || "";
  return Object.fromEntries(header.split(";").map((part) => {
    const [key, ...value] = part.trim().split("=");
    return [key, decodeURIComponent(value.join("=") || "")];
  }).filter(([key]) => key));
}

function hasMemberAccess(req) {
  if (!memberAccessCode) return true;
  const cookies = parseCookies(req);
  return cookies.video_lp_member === memberAccessCode;
}

function sendLoginPage(res, error = "") {
  const body = `<section>
    <h1>10分動画LP台本メーカー</h1>
    <p>会員限定アプリです。受講生用アクセスコードを入力してください。</p>
    ${error ? `<div class="error">${error}</div>` : ""}
    <form method="post" action="/api/login">
      <input name="code" type="password" placeholder="アクセスコード" autofocus>
      <button type="submit">ログイン</button>
    </form>
  </section>`;
  const html = htmlPage("会員ログイン", body);
  res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
  res.end(html);
}

const baseSystemPrompt = `
あなたは、講座、コンサル、スクール、セミナー、個別相談型ビジネスに強い「10分動画LP台本メーカー完全版」です。
目的は、広告やSNSから来た見込み客に、商品価値を約10分で伝え、LINE登録、セミナー申込、個別相談につながる動画LP制作物を作ることです。

重要ルール:
- 対象は成人向けのBtoBサービス、講座、コンサル、スクール、マーケター向けです。
- 未成年、子ども、学校児童向けの表現は扱わないでください。
- 誇大表現、断定保証、煽りすぎる表現は避けてください。
- 「必ず成果が出る」「絶対に売れる」「誰でも簡単に稼げる」は使わないでください。
- 出力は日本語のみ。
- 返答は必ずJSONだけ。Markdown、説明文、コードブロックは禁止です。

10分動画LPの7段階構造:
1. 冒頭30秒フック
2. 問題提起
3. 常識破壊
4. 新しい解決策
5. 根拠と信頼
6. 疑似体験
7. 登録CTA

冒頭30秒フックの型:
1. 常識破壊型
2. 失敗回避型
3. 問題の正体型
4. 未来提示型
5. ビフォーアフター型
6. 未経験者安心型
7. 数字具体化型
8. 対象者限定型
9. 誤解解除型
10. ツール活用型
`.trim();

const hookPrompt = `
入力された商品情報またはLP画像の内容から、10種類の型で各10案、合計100個の冒頭30秒フックを作成してください。

各フックは短いキャッチコピーではなく、実際に動画冒頭30秒で話せる180〜240文字程度のミニ台本にしてください。
各フックは3〜5文で構成してください。
同時に、100案の中からおすすめTOP10を選び、選定理由をつけてください。

必ず次のJSONだけを返してください。
{
  "extracted": {
    "offerName": "",
    "audience": "",
    "pain": "",
    "benefit": "",
    "cta": "",
    "missingInfo": []
  },
  "top10": [
    {"id": "TOP10-1", "sourceId": "1-1", "type": "常識破壊型", "hook": "", "reason": ""}
  ],
  "byType": [
    {
      "typeNo": 1,
      "type": "常識破壊型",
      "items": [
        {"id": "1-1", "hook": ""}
      ]
    }
  ]
}
`.trim();

const proPrompt = `
ユーザーが選んだフックをもとに、10分動画LPの完全版制作物を作ってください。

絶対条件:
- fullScriptの7項目合計を必ず3,500〜4,000文字にしてください。
- avatarScriptも3,500〜4,000文字にしてください。
- slidesは必ず50〜60枚にしてください。50枚未満は禁止です。
- 10分動画なので、1分5〜6枚を目安にしてください。
- 各スライドは8〜15秒にしてください。
- 各スライドに、1枚ずつGPTへコピペできるimagePromptを必ず入れてください。
- imagePromptは、その1枚だけを生成できる独立したプロンプトにしてください。
- ナレーション全文をスライドに載せず、表示テキストだけを載せる指示にしてください。
- 画像生成時に問題が起きやすいロゴ、商標、実在ブランド公式ロゴ、実在人物の顔再現は避けてください。

fullScriptの文字数目安:
- openingHook: 450〜550文字
- problem: 550〜650文字
- beliefShift: 500〜600文字
- solution: 650〜750文字
- proof: 450〜550文字
- simulation: 500〜600文字
- cta: 450〜550文字

スライド構成の目安:
- 1〜4枚: 冒頭フック
- 5〜13枚: 問題提起
- 14〜21枚: 常識破壊
- 22〜32枚: 新しい解決策
- 33〜39枚: 根拠と信頼
- 40〜47枚: 疑似体験
- 48〜55枚: 登録CTA

imagePromptの共通条件:
- 横長16:9のビジネスセミナー用スライド
- 白、濃紺、黒を基調に、青またはオレンジをアクセント
- スマホでも読める大きな文字
- 1スライド1メッセージ
- 図解、矢印、比較表、チェックリスト、アイコン風表現を活用
- 広告っぽすぎず、信頼感があり、AI活用と実践講座感が伝わる
- スライドに載せる文字はdisplayTextだけ
- ナレーション全文は載せない
- 公式ロゴ、商標ロゴ、実在人物の顔の再現は禁止

必ず次のJSONだけを返してください。
{
  "selectedHook": "",
  "assumedAudience": "",
  "videoGoal": "",
  "fullScript": {
    "openingHook": "",
    "problem": "",
    "beliefShift": "",
    "solution": "",
    "proof": "",
    "simulation": "",
    "cta": ""
  },
  "avatarScript": "",
  "readingNotes": [
    {"word": "10分動画LP", "reading": "じゅっぷん動画エルピー"}
  ],
  "slides": [
    {
      "no": 1,
      "role": "フック",
      "headline": "",
      "displayText": "",
      "visualDirection": "",
      "narration": "",
      "seconds": 10,
      "imagePrompt": ""
    }
  ],
  "slideGenerationPrompt": "",
  "checklist": []
}
`.trim();

const scriptPrompt = `
ユーザーが選んだフックをもとに、10分動画LPの「台本本文だけ」を作ってください。
このステップではスライド構成を作らないでください。台本の厚みを最優先してください。

絶対条件:
- fullScriptの7項目合計を必ず3,700〜4,200文字にしてください。
- avatarScriptも必ず3,700〜4,200文字にしてください。
- 短い要約、箇条書き、説明メモで終わらせないでください。
- すべて、実際にAIアバターがそのまま話せる自然な話し言葉で書いてください。
- 自己紹介から始めず、選択フックから自然に入ってください。
- 10分動画LPなので、問題提起、常識破壊、解決策、疑似体験、CTAを十分に展開してください。
- 返答はJSONだけです。

fullScriptの文字数目安:
- openingHook: 500〜650文字
- problem: 650〜800文字
- beliefShift: 550〜700文字
- solution: 700〜850文字
- proof: 500〜650文字
- simulation: 550〜700文字
- cta: 500〜650文字

必ず次のJSONだけを返してください。
{
  "selectedHook": "",
  "assumedAudience": "",
  "videoGoal": "",
  "fullScript": {
    "openingHook": "",
    "problem": "",
    "beliefShift": "",
    "solution": "",
    "proof": "",
    "simulation": "",
    "cta": ""
  },
  "avatarScript": "",
  "readingNotes": [
    {"word": "10分動画LP", "reading": "じゅっぷん動画エルピー"}
  ]
}
`.trim();

const slidesPrompt = `
以下の完成台本をもとに、10分動画LP用のスライド構成を作ってください。
台本本文を書き直す必要はありません。スライドだけを作ってください。

絶対条件:
- slidesは必ず50〜60枚にしてください。50枚未満は禁止です。
- 10分動画なので、1分5〜6枚を目安にしてください。
- 各スライドは8〜15秒にしてください。
- 各スライドに、1枚ずつGPTへコピペできるimagePromptを必ず入れてください。
- imagePromptは、その1枚だけを生成できる独立したプロンプトにしてください。
- スライドにナレーション全文を載せず、displayTextだけを載せる指示にしてください。
- ロゴ、商標、実在ブランド公式ロゴ、実在人物の顔再現は避けてください。

スライド構成の目安:
- 1〜4枚: 冒頭フック
- 5〜13枚: 問題提起
- 14〜21枚: 常識破壊
- 22〜32枚: 新しい解決策
- 33〜39枚: 根拠と信頼
- 40〜47枚: 疑似体験
- 48〜55枚: 登録CTA

imagePromptの共通条件:
- 横長16:9のビジネスセミナー用スライド
- 白、濃紺、黒を基調に、青またはオレンジをアクセント
- スマホでも読める大きな文字
- 1スライド1メッセージ
- 図解、矢印、比較表、チェックリスト、アイコン風表現を活用
- 広告っぽすぎず、信頼感があり、AI活用と実践講座感が伝わる
- スライドに載せる文字はdisplayTextだけ
- ナレーション全文は載せない
- 公式ロゴ、商標ロゴ、実在人物の顔の再現は禁止

必ず次のJSONだけを返してください。
{
  "slides": [
    {
      "no": 1,
      "role": "フック",
      "headline": "",
      "displayText": "",
      "visualDirection": "",
      "narration": "",
      "seconds": 10,
      "imagePrompt": ""
    }
  ],
  "slideGenerationPrompt": "",
  "checklist": []
}
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
    if (body.length > 12 * 1024 * 1024) {
      throw new Error("REQUEST_TOO_LARGE");
    }
  }
  return JSON.parse(body || "{}");
}

async function readBody(req) {
  let body = "";
  for await (const chunk of req) {
    body += chunk;
    if (body.length > 1024 * 1024) throw new Error("REQUEST_TOO_LARGE");
  }
  return body;
}

function buildContent({ productInfo, imageDataUrl, selectedHook, hooksSummary, extraText }) {
  const content = [];
  const textParts = [];
  if (productInfo) textParts.push(`商品情報:\n${productInfo}`);
  if (selectedHook) textParts.push(`選択フック:\n${selectedHook}`);
  if (hooksSummary) textParts.push(`生成済みフック情報:\n${hooksSummary}`);
  if (extraText) textParts.push(extraText);
  textParts.push("上記をもとに作成してください。");
  content.push({ type: "input_text", text: textParts.join("\n\n") });
  if (imageDataUrl) {
    content.push({ type: "input_image", image_url: imageDataUrl });
  }
  return content;
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

function parseJsonOutput(text) {
  const trimmed = text.trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    const match = trimmed.match(/\{[\s\S]*\}/);
    if (!match) throw new Error("NO_JSON_OUTPUT");
    return JSON.parse(match[0]);
  }
}

function countTextChars(value) {
  return String(value || "").replace(/\s/g, "").length;
}

function fullScriptText(result) {
  return Object.values(result?.fullScript || {}).join("");
}

function slideCount(result) {
  return Array.isArray(result?.slides) ? result.slides.length : 0;
}

function missingSlidePrompts(result) {
  return (result?.slides || []).filter((slide) => !String(slide.imagePrompt || "").trim()).length;
}

function proMetrics(result) {
  return {
    fullScriptChars: countTextChars(fullScriptText(result)),
    avatarScriptChars: countTextChars(result?.avatarScript || ""),
    slideCount: slideCount(result),
    missingSlidePrompts: missingSlidePrompts(result)
  };
}

function isProValid(result) {
  const metrics = proMetrics(result);
  return metrics.fullScriptChars >= 3600
    && metrics.avatarScriptChars >= 3600
    && metrics.slideCount >= 50
    && metrics.missingSlidePrompts === 0;
}

function isScriptValid(result) {
  const metrics = proMetrics(result);
  return metrics.fullScriptChars >= 3600 && metrics.avatarScriptChars >= 3600;
}

function isSlidesValid(result) {
  return slideCount(result) >= 50 && missingSlidePrompts(result) === 0;
}

async function callOpenAI({ taskPrompt, content }) {
  const apiKey = runtimeApiKey || process.env.OPENAI_API_KEY;
  if (!apiKey) {
    const err = new Error("OPENAI_API_KEY is not set");
    err.code = "NO_API_KEY";
    throw err;
  }

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "authorization": `Bearer ${apiKey}`,
      "content-type": "application/json"
    },
    body: JSON.stringify({
      model,
      temperature: 0.6,
      max_output_tokens: 30000,
      input: [
        { role: "system", content: [{ type: "input_text", text: `${baseSystemPrompt}\n\n${taskPrompt}` }] },
        { role: "user", content }
      ]
    })
  });

  const data = await response.json();
  if (!response.ok) {
    const err = new Error(data?.error?.message || "OpenAI API error");
    err.status = response.status;
    err.details = data;
    throw err;
  }
  return parseJsonOutput(extractTextFromResponse(data));
}

async function callScriptWithRepair({ productInfo, imageDataUrl, selectedHook, hooksSummary }) {
  let content = buildContent({ productInfo, imageDataUrl, selectedHook, hooksSummary });
  let result = await callOpenAI({ taskPrompt: scriptPrompt, content });

  for (let attempt = 1; attempt <= 3; attempt += 1) {
    if (isScriptValid(result)) return result;
    const metrics = proMetrics(result);
    content = buildContent({
      productInfo,
      imageDataUrl,
      selectedHook,
      hooksSummary,
      extraText: `
前回の台本は短すぎます。スライドは作らず、台本本文だけを厚く書き直してください。
現在のfullScript文字数: ${metrics.fullScriptChars}文字。最低3,600文字、目標3,700〜4,200文字。
現在のavatarScript文字数: ${metrics.avatarScriptChars}文字。最低3,600文字、目標3,700〜4,200文字。

修正ルール:
- 箇条書きではなく、実際に話せる本文として増やしてください。
- 各段階で、見込み客の心理、具体例、誤解の解除、次の行動理由を入れてください。
- 同じ文の繰り返しで増やさないでください。
- 返答はJSONだけです。

前回JSON:
${JSON.stringify(result)}
`.trim()
    });
    result = await callOpenAI({ taskPrompt: scriptPrompt, content });
  }

  if (!isScriptValid(result)) {
    const metrics = proMetrics(result);
    const err = new Error(`台本がまだ短すぎます。現在: フル台本${metrics.fullScriptChars}文字、AIアバター原稿${metrics.avatarScriptChars}文字。もう一度生成してください。`);
    err.status = 422;
    throw err;
  }
  return result;
}

async function callSlidesWithRepair({ scriptResult }) {
  let content = [{
    type: "input_text",
    text: `完成台本:\n${JSON.stringify(scriptResult)}`
  }];
  let result = await callOpenAI({ taskPrompt: slidesPrompt, content });

  for (let attempt = 1; attempt <= 2; attempt += 1) {
    if (isSlidesValid(result)) return result;
    const metrics = proMetrics(result);
    content = [{
      type: "input_text",
      text: `
前回のスライド出力は条件未達です。完成台本をもとに、スライド部分だけを作り直してください。
現在のスライド枚数: ${metrics.slideCount}枚。最低50枚、目標50〜60枚。
imagePrompt未入力スライド: ${metrics.missingSlidePrompts}枚。全スライド必須。

完成台本:
${JSON.stringify(scriptResult)}

前回JSON:
${JSON.stringify(result)}
`.trim()
    }];
    result = await callOpenAI({ taskPrompt: slidesPrompt, content });
  }

  if (!isSlidesValid(result)) {
    const metrics = proMetrics(result);
    const err = new Error(`スライド条件がまだ未達です。現在: ${metrics.slideCount}枚、プロンプト未入力${metrics.missingSlidePrompts}枚。もう一度生成してください。`);
    err.status = 422;
    throw err;
  }
  return result;
}

async function callProWithRepair({ productInfo, imageDataUrl, selectedHook, hooksSummary }) {
  const scriptResult = await callScriptWithRepair({ productInfo, imageDataUrl, selectedHook, hooksSummary });
  const slideResult = await callSlidesWithRepair({ scriptResult });
  return {
    ...scriptResult,
    slides: slideResult.slides || [],
    slideGenerationPrompt: slideResult.slideGenerationPrompt || "",
    checklist: slideResult.checklist || []
  };
}

async function handleApi(req, res) {
  try {
    if (req.url === "/api/login") {
      const raw = await readBody(req);
      const params = new URLSearchParams(raw);
      const code = String(params.get("code") || "").trim();
      if (!memberAccessCode || code === memberAccessCode) {
        res.writeHead(302, {
          "set-cookie": `video_lp_member=${encodeURIComponent(code)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${60 * 60 * 24 * 30}`,
          "location": "/"
        });
        return res.end();
      }
      return sendLoginPage(res, "アクセスコードが違います。");
    }

    if (req.url === "/api/logout") {
      res.writeHead(302, {
        "set-cookie": "video_lp_member=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0",
        "location": "/"
      });
      return res.end();
    }

    if (!hasMemberAccess(req)) {
      return sendJson(res, 401, { error: "会員ログインが必要です。" });
    }

    const payload = await readJson(req);

    if (req.url === "/api/set-key") {
      const key = String(payload.apiKey || "").trim();
      if (!key.startsWith("sk-")) {
        return sendJson(res, 400, { error: "OpenAI APIキーを入力してください。" });
      }
      runtimeApiKey = key;
      return sendJson(res, 200, { ok: true });
    }

    if (req.url === "/api/key-status") {
      return sendJson(res, 200, {
        hasKey: Boolean(runtimeApiKey || process.env.OPENAI_API_KEY),
        serverManaged: Boolean(process.env.OPENAI_API_KEY)
      });
    }

    if (req.url === "/api/generate-hooks") {
      const { productInfo = "", imageDataUrl = "" } = payload;
      if (!productInfo.trim() && !imageDataUrl) {
        return sendJson(res, 400, { error: "商品情報またはLP画像を入力してください。" });
      }
      const result = await callOpenAI({
        taskPrompt: hookPrompt,
        content: buildContent({ productInfo, imageDataUrl })
      });
      return sendJson(res, 200, result);
    }

    if (req.url === "/api/design-memo") {
      const { productInfo = "", imageDataUrl = "", selectedHook = "", hooksSummary = "" } = payload;
      if (!selectedHook.trim()) {
        return sendJson(res, 400, { error: "使用するフックを選ぶか、自作フックを入力してください。" });
      }
      const result = await callProWithRepair({ productInfo, imageDataUrl, selectedHook, hooksSummary });
      return sendJson(res, 200, {
        ...result,
        metrics: proMetrics(result)
      });
    }

    return sendJson(res, 404, { error: "API not found" });
  } catch (error) {
    if (error.code === "NO_API_KEY") {
      return sendJson(res, 500, {
        error: "OPENAI_API_KEYが設定されていません。画面上部のAPIキー欄に入力してください。"
      });
    }
    if (error.message === "REQUEST_TOO_LARGE") {
      return sendJson(res, 413, { error: "画像または入力が大きすぎます。画像を軽くして再試行してください。" });
    }
    console.error(error);
    return sendJson(res, error.status || 500, { error: error.message || "Server error" });
  }
}

async function serveStatic(req, res) {
  if (!hasMemberAccess(req)) {
    return sendLoginPage(res);
  }
  const url = new URL(req.url, "http://localhost");
  const safePath = url.pathname === "/" ? "/index.html" : decodeURIComponent(url.pathname);
  const filePath = path.normalize(path.join(publicDir, safePath));
  if (!filePath.startsWith(publicDir)) {
    res.writeHead(403);
    return res.end("Forbidden");
  }
  try {
    const data = await fs.readFile(filePath);
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, { "content-type": mimeTypes[ext] || "application/octet-stream" });
    res.end(data);
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
  console.log(`10分動画LP台本メーカー完全版: http://localhost:${port}`);
});
