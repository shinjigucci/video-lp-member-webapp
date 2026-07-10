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
      setMessage("フックを選択しました。次に台本生成へ進めます。");
    });
    card.append(title, body, reason, btn);
    list.appendChild(card);
  }
}

$("generateHooksBtn").addEventListener("click", async () => {
  const btn = $("generateHooksBtn");
  btn.disabled = true;
  $("hooksList").innerHTML = '<p class="hint">100パターンのフックを生成中です...</p>';
  setMessage("フック生成中です。少し時間がかかります。");
  try {
    const result = await postJson("/api/generate-hooks", collectPayload());
    generatedHooks = result.hooks || [];
    renderHooks(generatedHooks);
    setMessage(`フック生成完了。${generatedHooks.length}件`);
  } catch (err) {
    $("hooksList").innerHTML = "";
    setMessage(err.message, true);
  } finally {
    btn.disabled = false;
  }
});

$("generateBtn").addEventListener("click", async () => {
  const btn = $("generateBtn");
  const hook = $("customHook").value.trim() || selectedHook;
  if (!hook) {
    setMessage("先に100フックから選ぶか、自作フックを入力してください。", true);
    return;
  }
  btn.disabled = true;
  $("output").textContent = "生成中です。強いフック、採点、改善案まで作っています...";
  setMessage("生成中です。長文なので少し時間がかかります。");
  try {
    const result = await postJson("/api/generate", collectPayload());
    $("output").textContent = result.text || "出力が空でした。";
    setMessage(`生成完了。${result.model || ""}`);
  } catch (err) {
    $("output").textContent = "";
    setMessage(err.message, true);
  } finally {
    btn.disabled = false;
  }
});

$("improveBtn").addEventListener("click", async () => {
  const btn = $("improveBtn");
  const currentText = $("output").textContent.trim();
  const improvePrompt = $("improvePrompt").value.trim();
  if (!currentText || currentText.includes("ここに台本")) {
    setMessage("先に台本を生成してから改善版を作ってください。", true);
    return;
  }
  if (!improvePrompt) {
    setMessage("改善指示プロンプトを入力してください。", true);
    return;
  }
  btn.disabled = true;
  $("output").textContent = `${currentText}\n\n---\n\n改善版を生成中です...`;
  setMessage("改善版を生成中です。元の台本と採点結果をもとに作り直しています。");
  try {
    const result = await postJson("/api/improve", {
      ...collectPayload(),
      currentText,
      improvePrompt
    });
    $("output").textContent = result.text || "改善版の出力が空でした。";
    setMessage(`改善版生成完了: ${result.model || ""}`);
  } catch (err) {
    $("output").textContent = currentText;
    setMessage(err.message, true);
  } finally {
    btn.disabled = false;
  }
});

$("copyBtn").addEventListener("click", async () => {
  await navigator.clipboard.writeText($("output").textContent);
  setMessage("コピーしました。");
});

$("downloadBtn").addEventListener("click", () => {
  const blob = new Blob([$("output").textContent], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `impact-video-lp-script-${new Date().toISOString().slice(0,10)}.md`;
  a.click();
  URL.revokeObjectURL(url);
});

$("sampleBtn").addEventListener("click", () => {
  $("productName").value = "10分動画LP広告マーケター養成講座";
  $("audience").value = "講座、コンサル、スクール、セミナー、個別相談型の商品を販売していて、広告やSNSからLINE登録・セミナー申込を増やしたい人";
  $("pain").value = "文字LPや静止画広告の反応が落ちている。LINE登録は取れても質が低い。セミナー申込が取れても当日来ない。個別相談につながっても成約しない。";
  $("future").value = "10分動画LPを使って、広告やSNSから本気度の高い見込み客を集め、LINE登録、セミナー申込、個別相談まで進む導線を作る。";
  $("destination").value = "LINE登録、無料セミナー申込、個別相談";
  $("bonusName").value = "2026年版 10分動画LPスターターキット";
  $("proof").value = "柳井社長のプロデュース実績として、Meta広告・YouTube広告の比較、広告費、CPA、ROAS、セミナー出席率などを使ってよい。数字は入力されたものだけ使う。";
  $("keywords").value = "10分動画LP, Claude Code, 動画LP, 広告, LINE登録, セミナー申込";
  $("analogy").value = "ジャパネットたかたのように、同じ商品でも文字ではなく動画で魅せると感情が動く。初めて入る美容室の案内不足の例。";
  $("avoid").value = "無料AIツールだけで全部完結、絶対に売れる、誰でも成功、実績の捏造、動画編集者を育てる講座という表現";
  $("memo").value = "赤間さん型のように、強い冒頭、数字、痛み、事例、反論処理、限定CTAを入れる。90点未満なら改善版も出す。";
  $("customHook").value = "";
  selectedHook = "";
  generatedHooks = [];
  $("selectedHookPreview").textContent = "選択中のフック: なし";
  $("hooksList").innerHTML = "";
  setMessage("サンプルを入力しました。");
});

refreshStatus();
