const $ = (id) => document.getElementById(id);

const fields = [
  "productName", "audience", "pain", "future", "destination", "bonusName",
  "proof", "keywords", "analogy", "avoid", "memo", "lengthMode"
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
      setMessage("フックを選択しました。次に台本生成・採点へ進めます。");
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
    setMessage("100パターンのフックを生成中です。30秒フックなので少し時間がかかります。");
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
    setMessage("台本と採点結果を生成中です。");
    $("generateBtn").disabled = true;
    const res = await postJson("/api/generate", payload);
    $("output").textContent = res.text || "";
    setMessage("台本と採点結果を生成しました。");
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
    if (!payload.currentText || payload.currentText.includes("ここに台本")) {
      setMessage("先に台本を生成してください。", true);
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
  $("productName").value = "10分動画LP広告マーケター養成講座";
  $("audience").value = "講座、コンサル、スクール、セミナー、個別相談型の商品を販売していて、広告やSNSからLINE登録・セミナー申込を増やしたい人";
  $("pain").value = "文字だけのLPでは反応が弱い。LINE登録は取れても質が低い。セミナー申込が取れても当日来ない。個別相談につながっても成約しない。広告費を増やす前に何を直せばいいか分からない。";
  $("future").value = "Claude CodeやAIを使って、10分動画LP、広告クリエイティブ、LINE登録、セミナー申込までの導線を作れるようになる。";
  $("destination").value = "LINE登録、無料セミナー申込、個別相談";
  $("bonusName").value = "2026年版 10分動画LPスターターキット";
  $("proof").value = "柳井社長のプロデュース実績として、年間広告費6000万円規模の検証、YouTube広告ROAS1000%、Meta広告ROAS600%、動画導線でセミナー出席率が1.5倍から2倍になった事例を使ってよい。";
  $("keywords").value = "10分動画LP, Claude Code, 動画LP, 広告, LINE登録, セミナー申込, AI, 自動化";
  $("analogy").value = "ジャパネットたかたのように、同じ商品でも文字ではなく動画で魅せると感情が動く。初めて入る美容室で案内がないと不安になる例。";
  $("avoid").value = "絶対に売れる、誰でも成功、実績の捏造、無料AIツールだけで全部完結、動画編集者を育てる講座という表現";
  $("memo").value = "冒頭に強い数字を出す。見込み客の本音をセリフで入れる。本当の問題は広告画像やLPデザインではなく、登録前の理解と信頼が足りないことだと伝える。";
  setMessage("サンプルを入力しました。100フック生成へ進めます。");
});

refreshStatus();
