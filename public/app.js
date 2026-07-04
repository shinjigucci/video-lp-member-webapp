const els = {
  productInfo: document.querySelector("#productInfo"),
  customHook: document.querySelector("#customHook"),
  generateFromCustomHook: document.querySelector("#generateFromCustomHook"),
  keyPanel: document.querySelector(".key-panel"),
  apiKey: document.querySelector("#apiKey"),
  saveKey: document.querySelector("#saveKey"),
  keyStatus: document.querySelector("#keyStatus"),
  imageInput: document.querySelector("#imageInput"),
  previewWrap: document.querySelector("#previewWrap"),
  preview: document.querySelector("#preview"),
  removeImage: document.querySelector("#removeImage"),
  generateHooks: document.querySelector("#generateHooks"),
  sampleFill: document.querySelector("#sampleFill"),
  hooksPanel: document.querySelector("#hooksPanel"),
  extracted: document.querySelector("#extracted"),
  top10: document.querySelector("#top10"),
  byType: document.querySelector("#byType"),
  selectedHook: document.querySelector("#selectedHook"),
  generateMemo: document.querySelector("#generateMemo"),
  memoPanel: document.querySelector("#memoPanel"),
  memoOutput: document.querySelector("#memoOutput"),
  copyMemo: document.querySelector("#copyMemo"),
  downloadMemo: document.querySelector("#downloadMemo"),
  loading: document.querySelector("#loading")
};

let imageDataUrl = "";
let hooksData = null;
let memoText = "";

function setLoading(value) {
  els.loading.classList.toggle("hidden", !value);
  els.generateHooks.disabled = value;
  els.generateMemo.disabled = value;
  els.generateFromCustomHook.disabled = value;
}

function escapeHtml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function countTextChars(value = "") {
  return String(value).replace(/\s/g, "").length;
}

async function postJson(url, payload) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload)
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "生成に失敗しました。");
  return data;
}

async function refreshKeyStatus() {
  try {
    const res = await fetch("/api/key-status", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}"
    });
    const data = await res.json();
    els.keyStatus.textContent = data.hasKey ? "APIキー設定済み" : "APIキー未設定";
    if (data.serverManaged) {
      els.keyStatus.textContent = "サーバー側APIキー設定済み";
      els.keyPanel.classList.add("hidden");
    }
  } catch {
    els.keyStatus.textContent = "APIキー状態を確認できません";
  }
}

function renderExtracted(extracted = {}) {
  const items = [
    ["無料オファー", extracted.offerName],
    ["対象者", extracted.audience],
    ["悩み", extracted.pain],
    ["ベネフィット", extracted.benefit],
    ["CTA", extracted.cta]
  ];
  els.extracted.innerHTML = items.map(([label, value]) => `
    <div class="extract-item">
      <b>${escapeHtml(label)}</b>
      <span>${escapeHtml(value || "未抽出")}</span>
    </div>
  `).join("");
}

function hookCard(item, index, top = false) {
  return `
    <article class="hook-card">
      <div class="hook-meta">
        <span class="badge">${escapeHtml(top ? item.id || `TOP10-${index + 1}` : item.id)}</span>
        <span class="badge">${escapeHtml(item.type)}</span>
      </div>
      <p class="hook-text">${escapeHtml(item.hook)}</p>
      ${item.reason ? `<p class="reason">選定理由: ${escapeHtml(item.reason)}</p>` : ""}
      <button class="ghost select-hook" type="button" data-hook="${escapeHtml(item.hook)}">このフックを使う</button>
    </article>
  `;
}

function bindSelectButtons() {
  document.querySelectorAll(".select-hook").forEach((button) => {
    button.addEventListener("click", () => {
      els.selectedHook.value = button.dataset.hook || "";
      els.selectedHook.scrollIntoView({ behavior: "smooth", block: "center" });
    });
  });
}

function renderHooks(data) {
  renderExtracted(data.extracted || {});
  els.top10.innerHTML = (data.top10 || []).map((item, index) => hookCard(item, index, true)).join("");
  els.byType.innerHTML = (data.byType || []).map((typeBlock) => `
    <section class="type-block">
      <h4>${escapeHtml(typeBlock.typeNo)}. ${escapeHtml(typeBlock.type)}</h4>
      ${(typeBlock.items || []).map((item) => `
        <div class="mini-hook">
          <span class="badge">${escapeHtml(item.id)}</span>
          <p>${escapeHtml(item.hook)}</p>
          <button class="ghost select-hook" type="button" data-hook="${escapeHtml(item.hook)}">使う</button>
        </div>
      `).join("")}
    </section>
  `).join("");
  bindSelectButtons();
  els.hooksPanel.classList.remove("hidden");
  els.hooksPanel.scrollIntoView({ behavior: "smooth" });
}

function buildMemoText(data) {
  return [
    "10分動画LP台本メーカー 完全版出力",
    "",
    `選択したフック: ${data.selectedHook || ""}`,
    `想定対象者: ${data.assumedAudience || ""}`,
    `動画の目的: ${data.videoGoal || ""}`,
    "",
    "【フル台本】",
    ...(Object.entries(data.fullScript || {}).flatMap(([key, value]) => [
      `## ${key}`,
      value || "",
      ""
    ])),
    "【AIアバター用原稿】",
    data.avatarScript || "",
    "",
    "【読み注意メモ】",
    ...((data.readingNotes || []).map((n) => `${n.word}: ${n.reading}`)),
    "",
    "【スライド構成と1枚ずつの生成プロンプト】",
    ...((data.slides || []).flatMap((s) => [
      `${s.no}. ${s.role} / ${s.headline} / ${s.displayText} / ${s.seconds}秒`,
      `ビジュアル: ${s.visualDirection || ""}`,
      `ナレーション: ${s.narration || ""}`,
      `コピペ用プロンプト: ${s.imagePrompt || ""}`,
      ""
    ])),
    "【全体用スライド生成プロンプト】",
    data.slideGenerationPrompt || "",
    "",
    "【動画化前チェックリスト】",
    ...((data.checklist || []).map((c) => `- ${c}`))
  ].join("\n");
}

function renderMemo(data) {
  const fullScriptString = Object.values(data.fullScript || {}).join("");
  const fullScriptLength = countTextChars(fullScriptString);
  const avatarLength = countTextChars(data.avatarScript || "");
  const slides = data.slides || [];
  memoText = buildMemoText(data);

  const scriptLabels = {
    openingHook: "1. 冒頭30秒フック",
    problem: "2. 問題提起",
    beliefShift: "3. 常識破壊",
    solution: "4. 新しい解決策",
    proof: "5. 根拠と信頼",
    simulation: "6. 疑似体験",
    cta: "7. 登録CTA"
  };

  els.memoOutput.innerHTML = `
    <div class="memo-lead">
      <p><b>選択したフック</b><br>${escapeHtml(data.selectedHook || "")}</p>
      <p><b>想定対象者</b><br>${escapeHtml(data.assumedAudience || "")}</p>
      <p><b>動画の目的</b><br>${escapeHtml(data.videoGoal || "")}</p>
      <p><b>フル台本文字数</b><br>${escapeHtml(fullScriptLength)}文字 / 目標 3,500〜4,000文字</p>
      <p><b>AIアバター原稿文字数</b><br>${escapeHtml(avatarLength)}文字 / 目標 3,500〜4,000文字</p>
      <p><b>スライド枚数</b><br>${escapeHtml(slides.length)}枚 / 最低50枚</p>
    </div>
    ${Object.entries(data.fullScript || {}).map(([key, value]) => `
      <section class="memo-section">
        <h3>${escapeHtml(scriptLabels[key] || key)}</h3>
        <p>${escapeHtml(value || "").replaceAll("\n", "<br>")}</p>
      </section>
    `).join("")}
    <section class="memo-section">
      <h3>AIアバター用原稿</h3>
      <p>${escapeHtml(data.avatarScript || "").replaceAll("\n", "<br>")}</p>
    </section>
    <section class="memo-section">
      <h3>読み注意メモ</h3>
      <ul>${(data.readingNotes || []).map((n) => `<li>${escapeHtml(n.word || "")}: ${escapeHtml(n.reading || "")}</li>`).join("")}</ul>
    </section>
    <section class="memo-section">
      <h3>スライド構成 50〜60枚</h3>
      <div class="slide-table">
        <table>
          <thead>
            <tr>
              <th>枚</th>
              <th>役割</th>
              <th>見出し</th>
              <th>表示テキスト</th>
              <th>ビジュアル</th>
              <th>秒</th>
              <th>1枚ずつのコピペ用プロンプト</th>
            </tr>
          </thead>
          <tbody>
            ${slides.map((s) => `
              <tr>
                <td>${escapeHtml(s.no)}</td>
                <td>${escapeHtml(s.role || "")}</td>
                <td>${escapeHtml(s.headline || "")}</td>
                <td>${escapeHtml(s.displayText || "")}</td>
                <td>${escapeHtml(s.visualDirection || "")}</td>
                <td>${escapeHtml(s.seconds || "")}</td>
                <td><textarea class="slide-prompt" readonly>${escapeHtml(s.imagePrompt || "")}</textarea></td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      </div>
    </section>
    <section class="memo-section">
      <h3>全体用スライド生成プロンプト</h3>
      <p>${escapeHtml(data.slideGenerationPrompt || "").replaceAll("\n", "<br>")}</p>
    </section>
    <section class="memo-section">
      <h3>動画化前チェックリスト</h3>
      <ul>${(data.checklist || []).map((c) => `<li>${escapeHtml(c)}</li>`).join("")}</ul>
    </section>
  `;
  els.memoPanel.classList.remove("hidden");
  els.memoPanel.scrollIntoView({ behavior: "smooth" });
}

function hooksSummary() {
  if (!hooksData) return "";
  return JSON.stringify({
    extracted: hooksData.extracted,
    top10: hooksData.top10
  });
}

els.imageInput.addEventListener("change", () => {
  const file = els.imageInput.files?.[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    imageDataUrl = String(reader.result || "");
    els.preview.src = imageDataUrl;
    els.previewWrap.classList.remove("hidden");
  };
  reader.readAsDataURL(file);
});

els.removeImage.addEventListener("click", () => {
  imageDataUrl = "";
  els.imageInput.value = "";
  els.preview.src = "";
  els.previewWrap.classList.add("hidden");
});

els.sampleFill.addEventListener("click", () => {
  els.productInfo.value = [
    "商品名: 2026年版 10分動画LPスターターキット",
    "対象者: 広告やSNSからLINE登録を増やしたい講座、コンサル、スクール、個別相談型ビジネスの提供者",
    "悩み: LPや無料オファーを用意しても登録や申込につながらない。広告画像や投稿を変えても原因が分からない。",
    "無料オファー: 10分動画LPとは何か、7段階構造、フック作成、商品情報整理、台本テンプレート、AIアバター・AI音声・スライド作成の全体マップ",
    "登録後の流れ: スターターキット提供後、無料セミナーへ案内",
    "提供者: 谷口慎治",
    "CTA: スターターキットを無料で受け取る"
  ].join("\n");
});

els.saveKey.addEventListener("click", async () => {
  try {
    els.saveKey.disabled = true;
    await postJson("/api/set-key", { apiKey: els.apiKey.value });
    els.apiKey.value = "";
    await refreshKeyStatus();
    els.saveKey.textContent = "設定しました";
    setTimeout(() => { els.saveKey.textContent = "APIキーを設定"; }, 1500);
  } catch (error) {
    alert(error.message);
  } finally {
    els.saveKey.disabled = false;
  }
});

els.generateHooks.addEventListener("click", async () => {
  try {
    setLoading(true);
    const data = await postJson("/api/generate-hooks", {
      productInfo: els.productInfo.value,
      imageDataUrl
    });
    hooksData = data;
    renderHooks(data);
  } catch (error) {
    alert(error.message);
  } finally {
    setLoading(false);
  }
});

els.generateFromCustomHook.addEventListener("click", async () => {
  try {
    if (!els.customHook.value.trim()) {
      alert("自作フックを入力してください。");
      return;
    }
    if (!els.productInfo.value.trim() && !imageDataUrl) {
      alert("商品情報またはLP画像も入力してください。");
      return;
    }
    setLoading(true);
    els.selectedHook.value = els.customHook.value.trim();
    const data = await postJson("/api/design-memo", {
      productInfo: els.productInfo.value,
      imageDataUrl,
      selectedHook: els.customHook.value.trim(),
      hooksSummary: "ユーザーが入力した自作フックを使用"
    });
    renderMemo(data);
  } catch (error) {
    alert(error.message);
  } finally {
    setLoading(false);
  }
});

els.generateMemo.addEventListener("click", async () => {
  try {
    setLoading(true);
    const data = await postJson("/api/design-memo", {
      productInfo: els.productInfo.value,
      imageDataUrl,
      selectedHook: els.selectedHook.value,
      hooksSummary: hooksSummary()
    });
    renderMemo(data);
  } catch (error) {
    alert(error.message);
  } finally {
    setLoading(false);
  }
});

els.copyMemo.addEventListener("click", async () => {
  await navigator.clipboard.writeText(memoText);
  els.copyMemo.textContent = "コピーしました";
  setTimeout(() => { els.copyMemo.textContent = "コピー"; }, 1500);
});

els.downloadMemo.addEventListener("click", () => {
  const blob = new Blob([memoText], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "10min-video-lp-complete-output.txt";
  a.click();
  URL.revokeObjectURL(url);
});

refreshKeyStatus();
