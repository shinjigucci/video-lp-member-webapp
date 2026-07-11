const $ = (id) => document.getElementById(id);

const fields = [
  "seminarName", "optinBonus", "signupBonus", "audience", "currentState",
  "stuckReason", "promise", "agenda", "goodFit", "badFit", "objections",
  "proof", "urgency", "profile", "cta", "keywords", "avoid", "memo", "lengthMode"
];

let selectedHook = "";
let generatedHooks = [];

async function postJson(url, data) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(data)
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || "通信に失敗しました。");
  return json;
}

async function refreshStatus() {
  try {
    const res = await postJson("/api/key-status", {});
    $("keyStatus").textContent = res.hasKey ? "APIキー設定済み" : "APIキー未設定";
    $("modelStatus").textContent = `Model: ${res.model || ""}`;
  } catch {
    $("keyStatus").textContent = "APIキー確認不可";
  }
}

function collectPayload() {
  const payload = {};
  for (const id of fields) payload[id] = $(id).value.trim();
  payload.selectedHook = $("customHook").value.trim() || selectedHook;
  return payload;
}

function setMessage(text, isError = false) {
  $("message").textContent = text;
  $("message").style.color = isError ? "#b91c1c" : "#64748b";
}

function renderHooks(hooks) {
  const list = $("hooksList");
  list.innerHTML = "";
  if (!hooks.length) {
    list.innerHTML = '<p class="hint">フックを取得できませんでした。もう一度生成してください。</p>';
    return;
  }
  for (const item of hooks) {
    const card = document.createElement("div");
    card.className = "hookCard";

    const title = document.createElement("div");
    title.className = "hookMeta";
    title.textContent = `${item.id || ""} / ${item.type || ""}`;

    const body = document.createElement("p");
    body.textContent = item.hook || "";

    const reason = document.createElement("small");
    reason.textContent = item.reason || "";

    const btn = document.createElement("button");
    btn.type = "button";
    btn.textContent = "このフックを使う";
    btn.addEventListener("click", () => {
      selectedHook = item.hook || "";
      $("customHook").value = "";
      $("selectedHookPreview").textContent = `選択中のフック: ${selectedHook}`;
      document.querySelectorAll(".hookCard").forEach(el => el.classList.remove("active"));
      card.classList.add("active");
      setMessage("フックを選択しました。次にTP台本生成・採点へ進めます。");
    });

    card.append(title, body, reason, btn);
    list.appendChild(card);
  }
}

$("saveKeyBtn").addEventListener("click", async () => {
  try {
    const apiKey = $("apiKey").value.trim();
    await postJson("/api/set-key", { apiKey });
    $("apiKey").value = "";
    setMessage("APIキーを設定しました。");
    refreshStatus();
  } catch (err) {
    setMessage(err.message, true);
  }
});

$("generateHooksBtn").addEventListener("click", async () => {
  try {
    setMessage("TP用の冒頭フック100パターンを生成中です。");
    $("generateHooksBtn").disabled = true;
    const res = await postJson("/api/generate-hooks", collectPayload());
    generatedHooks = res.hooks || [];
    renderHooks(generatedHooks);
    if (!generatedHooks.length && res.raw) $("output").textContent = res.raw;
    setMessage(`${generatedHooks.length || 0}件のフックを生成しました。使いたいフックを選んでください。`);
  } catch (err) {
    setMessage(err.message, true);
  } finally {
    $("generateHooksBtn").disabled = false;
  }
});

$("generateBtn").addEventListener("click", async () => {
  try {
    const payload = collectPayload();
    if (!payload.selectedHook) {
      setMessage("先にフックを選ぶか、自作フックを入力してください。", true);
      return;
    }
    setMessage("TP動画台本と採点結果を生成中です。");
    $("generateBtn").disabled = true;
    const res = await postJson("/api/generate", payload);
    $("output").textContent = res.text || "";
    setMessage("TP動画台本と採点結果を生成しました。");
  } catch (err) {
    setMessage(err.message, true);
  } finally {
    $("generateBtn").disabled = false;
  }
});

$("improveBtn").addEventListener("click", async () => {
  try {
    const payload = collectPayload();
    payload.currentText = $("output").textContent;
    payload.improvePrompt = $("improvePrompt").value.trim();
    if (!payload.currentText || payload.currentText.includes("ここにTP動画台本")) {
      setMessage("先にTP台本を生成してください。", true);
      return;
    }
    setMessage("改善版を生成中です。");
    $("improveBtn").disabled = true;
    const res = await postJson("/api/improve", payload);
    $("output").textContent = res.text || "";
    setMessage("改善版を生成しました。");
  } catch (err) {
    setMessage(err.message, true);
  } finally {
    $("improveBtn").disabled = false;
  }
});

$("copyBtn").addEventListener("click", async () => {
  await navigator.clipboard.writeText($("output").textContent);
  setMessage("コピーしました。");
});

$("sampleBtn").addEventListener("click", () => {
  $("seminarName").value = "広告・SNSからLINE登録とセミナー申込を増やす 10分動画LP集客セミナー";
  $("optinBonus").value = "2026年版 10分動画LPスターターキット";
  $("signupBonus").value = "コンセプト設計アプリ、深層共感キャッチコピー作成アプリ、オプトイン特典メーカー体験版";
  $("audience").value = "講座、コンサル、スクール、セミナー、個別相談型の商品を販売していて、広告やSNSからLINE登録・セミナー申込につながる導線を作りたい人";
  $("currentState").value = "スターターキットを受け取った直後。10分動画LPの必要性は分かり始めているが、自分の商品にどう当てはめればいいかはまだ分からない。";
  $("stuckReason").value = "必要なのは分かったが、自分の商品だと何を言えばいいのか、どんなコンセプトにすればいいのか、LP原稿や動画台本にどう変換すればいいのか分からない。";
  $("promise").value = "スターターキットで理解した10分動画LPの考え方を、自分の商品に当てはめ、広告やSNSからLINE登録、セミナー申込へつながる導線の作り方を理解できる。";
  $("agenda").value = [
    "なぜ広告やSNSから直接セミナー申込ページに飛ばすと反応が弱くなるのか",
    "10分動画LPを講座・コンサル型商品に当てはめる方法",
    "Claude CodeやChatGPTを使ったコンセプト、キャッチコピー、LP原稿、動画台本の作り方",
    "冒頭30秒フックの作り方",
    "LINE登録後からセミナー申込までの導線設計"
  ].join("\n");
  $("goodFit").value = [
    "自分の商品に10分動画LPを当てはめたい人",
    "広告やSNSからLINE登録、セミナー申込につなげたい人",
    "AIに課金し、実際に手を動かして導線を作る意思がある人",
    "聞いて終わりではなく、自分の商品で試したい人"
  ].join("\n");
  $("badFit").value = [
    "オンラインビジネスで売上を作りたいのに、必要なAIツールに課金するのが嫌な人",
    "集客はお金も時間もかけず完全無料でできると思っている人",
    "セミナーを聞いて満足するだけで、実際に作るつもりがない人"
  ].join("\n");
  $("objections").value = "売り込まれるだけではないか\n自分の商品でも使えるのか\n動画編集ができないと無理ではないか\nAIを使いこなせないと難しいのではないか\n広告費が大きく必要なのではないか";
  $("proof").value = "柳井社長のプロデュース実績として、広告費、CPA、ROAS、セミナー出席率など入力した数字は使ってよい。入力されていない数字は作らない。";
  $("urgency").value = "日程を選んで席を確保してください。セミナー申込特典は申込者限定で案内します。";
  $("profile").value = "谷口慎治。AIと広告を活用した集客導線づくりを研究し、講座・コンサル・個別相談型ビジネス向けに10分動画LP、広告、LINE、セミナー導線の設計を支援。";
  $("cta").value = "下のボタンから日程を選んで、無料セミナーの席を確保してください。";
  $("keywords").value = "10分動画LP, Claude Code, 広告, SNS, LINE登録, セミナー申込, 集客導線, 自動化";
  $("avoid").value = "絶対に売れる、誰でも成功、実績の捏造、無料AIツールだけで全部完結、動画編集講座という表現";
  $("memo").value = "スターターキットは地図。無料セミナーは、その地図を自分の商品に当てはめる時間。セミナー申込特典の価値を強める。";
  setMessage("サンプルを入力しました。100フック生成へ進めます。");
});

refreshStatus();
