// ==UserScript==
// @name         CMS Extension (Extended Version)
// @version      1.1
// @description  CMS Extension
// @author       ttamx (creator), winzzwz (extended version)
// @match        https://c2.thailandoi.org/*
// @match        https://toi-coding.informatics.buu.ac.th/*
// @run-at       document-idle
// @grant        GM_addStyle
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        unsafeWindow
// @noframes
// ==/UserScript==

(function () {
  "use strict";

  GM_addStyle(`
    .cms-score-badge {
      border-radius: 4px;
      padding-left: 4px;
      padding-right: 4px;
      color: black;
    }

    .cms-extension-controls {
      position: fixed;
      bottom: 20px;
      right: 20px;
      z-index: 1000;
      display: none;
      flex-direction: column;
      align-items: stretch;
      gap: 10px;
      background: #fff;
      padding: 12px;
      border-radius: 8px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.25);
      max-height: 80vh;
      width: 320px;
    }

    .cms-extension-controls.visible {
      display: flex;
    }

    .cms-top-row {
      display: flex;
      align-items: center;
      gap: 10px;
    }

    .refresh-button {
      background-color: #4caf50;
      color: white;
      border: none;
      padding: 8px 10px;
      border-radius: 5px;
      cursor: pointer;
      font-weight: bold;
      flex: 1;
    }

    .refresh-button:hover {
      background-color: #45a049;
    }

    .refresh-button:disabled {
      background-color: #cccccc;
      cursor: not-allowed;
    }

    .total-score-container {
      background-color: #f0f0f0;
      padding: 8px;
      border-radius: 5px;
      font-weight: bold;
      text-align: center;
    }

    .cms-task-search {
      width: 100%;
      padding: 6px 8px;
      border: 1px solid #ccc;
      border-radius: 4px;
      box-sizing: border-box;
      font-size: 12px;
    }

    .cms-task-list {
      overflow-y: auto;
      max-height: 50vh;
      border: 1px solid #e0e0e0;
      border-radius: 4px;
      background: #fafafa;
    }

    .cms-task-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 6px 8px;
      border-bottom: 1px solid #eee;
      font-size: 12px;
      cursor: pointer;
      gap: 8px;
    }

    .cms-task-row:hover {
      background: #f0f0f0;
    }

    .cms-task-row:last-child {
      border-bottom: none;
    }

    .cms-task-name {
      flex: 1;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .cms-task-score {
      font-size: 11px;
      color: #666;
      min-width: 60px;
      text-align: right;
    }

    .cms-task-toggle {
      width: 36px;
      height: 18px;
      background: #ccc;
      border-radius: 9px;
      position: relative;
      transition: background 0.2s;
      flex-shrink: 0;
    }

    .cms-task-toggle.on {
      background: #4caf50;
    }

    .cms-task-toggle::after {
      content: "";
      position: absolute;
      top: 2px;
      left: 2px;
      width: 14px;
      height: 14px;
      background: white;
      border-radius: 50%;
      transition: left 0.2s;
    }

    .cms-task-toggle.on::after {
      left: 20px;
    }

    .cms-bulk-row {
      display: flex;
      gap: 6px;
    }

    .cms-bulk-btn {
      flex: 1;
      padding: 6px;
      border: 1px solid #ccc;
      background: #fff;
      border-radius: 4px;
      cursor: pointer;
      font-size: 11px;
    }

    .cms-bulk-btn:hover {
      background: #f0f0f0;
    }

    .cms-hint {
      position: fixed;
      bottom: 5px;
      right: 10px;
      font-size: 10px;
      color: #999;
      z-index: 999;
      pointer-events: none;
    }
  `);

  const CACHE_TTL = 5 * 60 * 1000;
  const FAKE_TASKS_KEY = "cms_fake_tasks";
  const TOGGLE_KEYBIND = { key: "h", ctrl: true, shift: true };

  const pageWindow = typeof unsafeWindow !== "undefined" ? unsafeWindow : window;

  const baseURL = window.location.href
    .split(/(\/tasks)|(\/communication)|(\/documentation)|(\/testing)/)[0]
    .replace(/\/+$/g, "");

  const user = document.querySelector("em")?.textContent || "unknown_user";
  const parser = new DOMParser();

  let score = new Map();
  let fullScore = new Map();
  let responseCache = new Map();
  let fakeTasks = new Set();
  let menuVisible = false;
  let taskOrder = [];

  let autoRefreshTimers = new Set();
  let autoRefreshInProgress = false;
  let lastSubmissionAt = 0;
  let lastRefreshBurstAt = 0;
  let suppressAutoRefreshObserver = false;

  function isCMSPage() {
    return !!document.querySelector(".navbar") && !!document.querySelector("em");
  }

  function fakeKey() {
    return `${baseURL}_${user}_${FAKE_TASKS_KEY}`;
  }

  async function loadStorageCache() {
    try {
      const count = GM_getValue("count", 0);
      GM_setValue("count", count + 1);
    } catch (e) {}

    try {
      fakeTasks = new Set(GM_getValue(fakeKey(), []));
    } catch (e) {}

    const responseCacheKey = `${baseURL}_${user}_responseCache`;

    try {
      const cachedData = GM_getValue(responseCacheKey, null);

      if (cachedData) {
        responseCache = new Map(Object.entries(cachedData));

        responseCache.forEach((value, key) => {
          score.set(key, value.score);
          fullScore.set(key, value.fullScore);
        });
      }
    } catch (e) {}
  }

  function saveFakeTasks() {
    try {
      GM_setValue(fakeKey(), Array.from(fakeTasks));
    } catch (e) {}
  }

  async function storeStorageCache() {
    const responseCacheKey = `${baseURL}_${user}_responseCache`;

    try {
      GM_setValue(responseCacheKey, Object.fromEntries(responseCache));
    } catch (e) {}
  }

  function scoreClass(current, max) {
    if (current >= max && max > 0) return "score_100";
    if (current > 0) return "score_0_100";
    return "score_0";
  }

  function calculateTotalScore() {
    let totalScore = 0;
    let totalFullScore = 0;

    score.forEach((v, task) => {
      const fs = fullScore.get(task) || 0;
      totalScore += fakeTasks.has(task) ? fs : v;
    });

    fullScore.forEach((v) => {
      totalFullScore += v;
    });

    return { totalScore, totalFullScore };
  }

  function updateTotalScore() {
    const { totalScore, totalFullScore } = calculateTotalScore();
    const el = document.getElementById("cms-extension-total-score");

    if (el) {
      const pct = totalFullScore > 0 ? Math.round((totalScore / totalFullScore) * 100) : 0;
      el.textContent = `Total: ${totalScore} / ${totalFullScore} (${pct}%)`;
    }
  }

  function collectTaskOrder() {
    const elements = document.querySelectorAll(".nav-list li");
    taskOrder = [];

    Array.from(elements).forEach((el) => {
      if (el.classList.contains("nav-header")) {
        const t = (el.querySelector("span") || el).textContent.trim();
        if (t) taskOrder.push(t);
      }
    });
  }

  function getScore(parsedHtml) {
    const el = parsedHtml.querySelector(".task_score_container .score");
    return el ? el.textContent.trim() : "0/0";
  }

  async function fetchAndParseTask(url, task) {
    if (!url || !task) return null;

    try {
      const now = Date.now();
      const cached = responseCache.get(task);

      let scoreValue;
      let fullScoreValue;

      if (cached && now - cached.timestamp < CACHE_TTL) {
        scoreValue = cached.score;
        fullScoreValue = cached.fullScore;
      } else {
        const response = await fetch(url, { cache: "no-store" });
        const html = await response.text();
        const parsed = parser.parseFromString(html, "text/html");
        const result = getScore(parsed).split("/").map((v) => parseInt(v, 10));

        scoreValue = Number.isFinite(result[0]) ? result[0] : 0;
        fullScoreValue = Number.isFinite(result[1]) ? result[1] : 0;

        responseCache.set(task, {
          score: scoreValue,
          fullScore: fullScoreValue,
          timestamp: now,
        });
      }

      return { task, scoreValue, fullScoreValue };
    } catch (e) {
      console.error("[CMS Extension] Failed to fetch task score:", e);
      return null;
    }
  }

  async function fetchAllScore(elements, force = false) {
    const promises = [];

    Array.from(elements).forEach((element, i) => {
      if (element.classList.contains("nav-header")) {
        try {
          const task = (element.querySelector("span") || element).textContent.trim();
          const url = elements[i + 2]?.querySelector("a")?.href;

          if (url) {
            if (force && responseCache.has(task)) {
              responseCache.delete(task);
            }

            promises.push(fetchAndParseTask(url, task));
          }
        } catch (e) {}
      }
    });

    const results = await Promise.allSettled(promises);

    results.forEach((r) => {
      if (r.status === "fulfilled" && r.value) {
        const { task, scoreValue, fullScoreValue } = r.value;
        score.set(task, scoreValue);
        fullScore.set(task, fullScoreValue);
      }
    });

    return results;
  }

  async function withButtonDisabled(asyncFn) {
    const button = document.querySelector(".refresh-button");

    if (button) {
      button.disabled = true;
      button.textContent = "Refreshing...";
    }

    try {
      await asyncFn();
    } catch (e) {
      console.error("[CMS Extension] Error during refresh:", e);
    } finally {
      if (button) {
        button.disabled = false;
        button.textContent = "↻ Refresh";
      }
    }
  }

  function updateSidebarElement(element) {
    try {
      const task = (element.querySelector("span") || element).textContent.trim();

      if (!score.has(task)) return;

      const realScore = score.get(task);
      const fs = fullScore.get(task);
      const isFake = fakeTasks.has(task);
      const displayScore = isFake ? fs : realScore;
      const cls = scoreClass(displayScore, fs);

      element.innerHTML = `
        <span>${task}</span>
        <span style="float:right">
          <div class="cms-score-badge task_score ${cls}">
            ${displayScore} / ${fs}
          </div>
        </span>`;
    } catch (e) {}
  }

  function updateSidebar() {
    document.querySelectorAll(".nav-list li").forEach((el) => {
      if (el.classList.contains("nav-header")) {
        updateSidebarElement(el);
      }
    });
  }

  function getCurrentTaskInfo() {
    const currentUrl = window.location.href.split("?")[0].replace(/\/+$/g, "");

    if (!currentUrl.includes("/tasks/")) {
      return null;
    }

    const task = currentUrl.split("/tasks/")[1]?.split("/")[0];

    if (!task) {
      return null;
    }

    const url = `${baseURL}/tasks/${task}/submissions`;

    return { url, task };
  }

  function applyFakeToCurrentPage() {
    const info = getCurrentTaskInfo();

    if (!info) return;

    const task = info.task;
    const isFake = fakeTasks.has(task);

    const realScore = score.get(task);
    const realFullScore = fullScore.get(task);

    const taskScoreEl = document.querySelector(".task_score_container .task_score");
    const scoreSpan = document.querySelector(".task_score_container .score");

    if (taskScoreEl && scoreSpan) {
      const visibleText = scoreSpan.textContent.trim();
      const visibleParts = visibleText.split("/").map((s) => parseInt(s, 10));

      const fallbackScore = Number.isFinite(visibleParts[0]) ? visibleParts[0] : 0;
      const fallbackFullScore = Number.isFinite(visibleParts[1]) ? visibleParts[1] : 100;

      const currentRealScore = Number.isFinite(realScore) ? realScore : fallbackScore;
      const currentFullScore = Number.isFinite(realFullScore) ? realFullScore : fallbackFullScore;
      const displayScore = isFake ? currentFullScore : currentRealScore;

      scoreSpan.textContent = `${displayScore} / ${currentFullScore}`;

      taskScoreEl.classList.remove("score_0", "score_0_100", "score_100", "undefined");
      taskScoreEl.classList.add(scoreClass(displayScore, currentFullScore));
    }

    const rows = document.querySelectorAll("#submission_list tbody tr");

    rows.forEach((row, idx) => {
      const cell = row.querySelector("td.public_score");

      if (!cell) return;

      const wasFakeTouched = cell.dataset.fakeTouched === "1";

      if (!wasFakeTouched) {
        cell.dataset.realText = cell.textContent.trim();
        cell.dataset.realClass =
          cell.classList.contains("score_100") ? "score_100" :
          cell.classList.contains("score_0_100") ? "score_0_100" :
          cell.classList.contains("score_0") ? "score_0" : "";
      }

      const realText = cell.dataset.realText || cell.textContent.trim();
      const parts = realText.split("/").map((s) => parseInt(s, 10));
      const max = Number.isFinite(parts[1]) ? parts[1] : 100;

      cell.classList.remove("score_0", "score_0_100", "score_100", "undefined");

      if (isFake && idx === 0) {
        cell.dataset.fakeTouched = "1";
        cell.classList.add("score_100");
        cell.textContent = `${max} / ${max}`;
      } else {
        delete cell.dataset.fakeTouched;

        if (cell.dataset.realClass) {
          cell.classList.add(cell.dataset.realClass);
        }

        cell.textContent = realText;
      }
    });
  }

  async function refreshScores(force = true) {
    const elements = document.querySelectorAll(".nav-list li");

    await fetchAllScore(elements, force);
    collectTaskOrder();

    suppressAutoRefreshObserver = true;

    try {
      updateSidebar();
      updateTotalScore();
      renderTaskList();
      applyFakeToCurrentPage();
    } finally {
      setTimeout(() => {
        suppressAutoRefreshObserver = false;
      }, 0);
    }

    await storeStorageCache();
  }

  async function refreshSingleTask(url, task) {
    if (!url || !task) return;

    if (responseCache.has(task)) {
      responseCache.delete(task);
    }

    const elements = document.querySelectorAll(".nav-list li");

    const taskElement = Array.from(elements).find((element, i) => {
      if (!element.classList.contains("nav-header")) return false;

      const taskName = (element.querySelector("span") || element).textContent.trim();
      const taskUrl = elements[i + 2]?.querySelector("a")?.href?.split("?")[0]?.replace(/\/+$/g, "");
      const wantedUrl = url.split("?")[0].replace(/\/+$/g, "");

      return taskName === task && taskUrl === wantedUrl;
    });

    const result = await fetchAndParseTask(url, task);

    if (result) {
      score.set(task, result.scoreValue);
      fullScore.set(task, result.fullScoreValue);

      suppressAutoRefreshObserver = true;

      try {
        if (taskElement) {
          updateSidebarElement(taskElement);
        } else {
          updateSidebar();
        }

        updateTotalScore();
        renderTaskList();
        applyFakeToCurrentPage();
      } finally {
        setTimeout(() => {
          suppressAutoRefreshObserver = false;
        }, 0);
      }

      await storeStorageCache();
    }
  }

  function renderTaskList() {
    const list = document.getElementById("cms-task-list");
    if (!list) return;

    const filter = (document.getElementById("cms-task-search")?.value || "").toLowerCase();

    list.innerHTML = "";

    taskOrder.forEach((task) => {
      if (filter && !task.toLowerCase().includes(filter)) return;

      const realScore = score.get(task) ?? 0;
      const fs = fullScore.get(task) ?? 0;
      const isFake = fakeTasks.has(task);

      const row = document.createElement("div");
      row.className = "cms-task-row";

      const name = document.createElement("div");
      name.className = "cms-task-name";
      name.textContent = task;

      const scoreSpan = document.createElement("div");
      scoreSpan.className = "cms-task-score";
      scoreSpan.textContent = `${isFake ? fs : realScore} / ${fs}`;

      const toggle = document.createElement("div");
      toggle.className = `cms-task-toggle ${isFake ? "on" : ""}`;

      row.appendChild(name);
      row.appendChild(scoreSpan);
      row.appendChild(toggle);

      row.addEventListener("click", () => {
        if (fakeTasks.has(task)) {
          fakeTasks.delete(task);
        } else {
          fakeTasks.add(task);
        }

        saveFakeTasks();

        suppressAutoRefreshObserver = true;

        try {
          updateSidebar();
          updateTotalScore();
          renderTaskList();
          applyFakeToCurrentPage();
        } finally {
          setTimeout(() => {
            suppressAutoRefreshObserver = false;
          }, 0);
        }
      });

      list.appendChild(row);
    });
  }

  function createControls() {
    if (document.querySelector(".cms-extension-controls")) return;

    const container = document.createElement("div");
    container.className = "cms-extension-controls";

    const totalScoreContainer = document.createElement("div");
    totalScoreContainer.className = "total-score-container";
    totalScoreContainer.id = "cms-extension-total-score";

    const topRow = document.createElement("div");
    topRow.className = "cms-top-row";

    const refreshButton = document.createElement("button");
    refreshButton.className = "refresh-button";
    refreshButton.textContent = "↻ Refresh";

    refreshButton.addEventListener("click", () =>
      withButtonDisabled(async () => {
        const info = getCurrentTaskInfo();

        if (info) {
          await refreshSingleTask(info.url, info.task);
        } else {
          await refreshScores(true);
        }
      })
    );

    topRow.appendChild(refreshButton);

    const search = document.createElement("input");
    search.type = "text";
    search.id = "cms-task-search";
    search.className = "cms-task-search";
    search.placeholder = "Search tasks...";
    search.addEventListener("input", renderTaskList);

    const bulkRow = document.createElement("div");
    bulkRow.className = "cms-bulk-row";

    const allBtn = document.createElement("button");
    allBtn.className = "cms-bulk-btn";
    allBtn.textContent = "Fake All";

    allBtn.addEventListener("click", () => {
      taskOrder.forEach((t) => fakeTasks.add(t));
      saveFakeTasks();

      suppressAutoRefreshObserver = true;

      try {
        updateSidebar();
        updateTotalScore();
        renderTaskList();
        applyFakeToCurrentPage();
      } finally {
        setTimeout(() => {
          suppressAutoRefreshObserver = false;
        }, 0);
      }
    });

    const noneBtn = document.createElement("button");
    noneBtn.className = "cms-bulk-btn";
    noneBtn.textContent = "Clear All";

    noneBtn.addEventListener("click", () => {
      fakeTasks.clear();
      saveFakeTasks();

      suppressAutoRefreshObserver = true;

      try {
        updateSidebar();
        updateTotalScore();
        renderTaskList();
        applyFakeToCurrentPage();
      } finally {
        setTimeout(() => {
          suppressAutoRefreshObserver = false;
        }, 0);
      }
    });

    bulkRow.appendChild(allBtn);
    bulkRow.appendChild(noneBtn);

    const list = document.createElement("div");
    list.className = "cms-task-list";
    list.id = "cms-task-list";

    container.appendChild(totalScoreContainer);
    container.appendChild(topRow);
    container.appendChild(search);
    container.appendChild(bulkRow);
    container.appendChild(list);

    document.body.appendChild(container);

    const hint = document.createElement("div");
    hint.className = "cms-hint";
    hint.textContent = "Ctrl+Shift+H";
    document.body.appendChild(hint);

    updateTotalScore();
  }

  function setMenuVisible(visible) {
    menuVisible = visible;

    const container = document.querySelector(".cms-extension-controls");

    if (container) {
      container.classList.toggle("visible", visible);
    }

    if (visible) {
      renderTaskList();
    }
  }

  function setupKeybind() {
    document.addEventListener("keydown", (e) => {
      if (
        e.key.toLowerCase() === TOGGLE_KEYBIND.key &&
        e.ctrlKey === TOGGLE_KEYBIND.ctrl &&
        e.shiftKey === TOGGLE_KEYBIND.shift
      ) {
        e.preventDefault();
        setMenuVisible(!menuVisible);
      }
    });
  }

  function scheduleCurrentTaskRefresh(delay = 3000) {
    const taskInfo = getCurrentTaskInfo();

    if (!taskInfo) return;

    const timer = setTimeout(async () => {
      autoRefreshTimers.delete(timer);

      if (autoRefreshInProgress) {
        scheduleCurrentTaskRefresh(1500);
        return;
      }

      autoRefreshInProgress = true;

      try {
        await withButtonDisabled(async () => {
          await refreshSingleTask(taskInfo.url, taskInfo.task);
        });
      } finally {
        autoRefreshInProgress = false;
      }
    }, delay);

    autoRefreshTimers.add(timer);
  }

  function scheduleRefreshBurst() {
    [800, 2500, 5000, 9000, 15000, 25000, 40000].forEach((delay) => {
      scheduleCurrentTaskRefresh(delay);
    });
  }

  function markSubmissionDetected(reason = "unknown") {
    const now = Date.now();

    lastSubmissionAt = now;

    if (now - lastRefreshBurstAt < 2000) return;

    lastRefreshBurstAt = now;

    console.log("[CMS Extension] Submission/update detected:", reason);

    scheduleRefreshBurst();
  }

  function syncCurrentTaskScoreFromPage(taskScoreValue, fullScoreValue) {
    const info = getCurrentTaskInfo();

    if (!info) return;

    let realScore = Number(taskScoreValue);
    let realFullScore = Number(fullScoreValue);

    if (!Number.isFinite(realScore) || !Number.isFinite(realFullScore)) {
      const text = document.querySelector(".task_score_container .score")?.textContent || "";
      const match = text.match(/(\d+)\s*\/\s*(\d+)/);

      if (!match) return;

      realScore = parseInt(match[1], 10);
      realFullScore = parseInt(match[2], 10);
    }

    if (!Number.isFinite(realScore) || !Number.isFinite(realFullScore)) return;

    score.set(info.task, realScore);
    fullScore.set(info.task, realFullScore);

    responseCache.set(info.task, {
      score: realScore,
      fullScore: realFullScore,
      timestamp: Date.now(),
    });

    suppressAutoRefreshObserver = true;

    try {
      updateSidebar();
      updateTotalScore();
      renderTaskList();
      applyFakeToCurrentPage();
    } finally {
      setTimeout(() => {
        suppressAutoRefreshObserver = false;
      }, 0);
    }

    storeStorageCache();
  }

  function setupNativeCmsScoreHook() {
    if (pageWindow.__cmsExtensionNativeHookInstalled) return;

    pageWindow.__cmsExtensionNativeHookInstalled = true;

    function tryInstallHooks() {
      try {
        if (
          typeof pageWindow.update_score === "function" &&
          !pageWindow.update_score.__cmsExtensionWrapped
        ) {
          const originalUpdateScore = pageWindow.update_score;

          const wrappedUpdateScore = function (
            score_elem,
            task_score_elem,
            submissionScore,
            submissionScoreMessage,
            taskScore,
            taskScoreMessage,
            taskScoreIsPartial,
            maxScore
          ) {
            const result = originalUpdateScore.apply(this, arguments);

            console.log("[CMS Extension] Native update_score() fired");

            syncCurrentTaskScoreFromPage(taskScore, maxScore);
            markSubmissionDetected("native update_score");

            return result;
          };

          wrappedUpdateScore.__cmsExtensionWrapped = true;
          pageWindow.update_score = wrappedUpdateScore;

          console.log("[CMS Extension] Hooked native update_score()");
        }

        if (
          typeof pageWindow.update_scores === "function" &&
          !pageWindow.update_scores.__cmsExtensionWrapped
        ) {
          const originalUpdateScores = pageWindow.update_scores;

          const wrappedUpdateScores = function (submissionId, data) {
            const result = originalUpdateScores.apply(this, arguments);

            console.log("[CMS Extension] Native update_scores() fired", data);

            if (data && data.status === 5) {
              syncCurrentTaskScoreFromPage(data.task_public_score, data.max_public_score);
              markSubmissionDetected("native update_scores status 5");
            } else {
              markSubmissionDetected("native update_scores pending");
            }

            return result;
          };

          wrappedUpdateScores.__cmsExtensionWrapped = true;
          pageWindow.update_scores = wrappedUpdateScores;

          console.log("[CMS Extension] Hooked native update_scores()");
        }
      } catch (e) {
        console.error("[CMS Extension] Failed to hook native CMS score updater:", e);
      }
    }

    tryInstallHooks();
    setTimeout(tryInstallHooks, 500);
    setTimeout(tryInstallHooks, 1500);
    setTimeout(tryInstallHooks, 3000);
  }

  function scanExistingPendingSubmissions() {
    const pendingRows = document.querySelectorAll(
      '#submission_list tbody tr[data-status]:not([data-status="2"]):not([data-status="5"])'
    );

    if (pendingRows.length > 0) {
      console.log("[CMS Extension] Found pending submissions on page load");
      markSubmissionDetected("pending rows on page load");
    }
  }

  function setupSubmissionListener() {
    if (!window.location.href.includes("/tasks/")) return;

    setupNativeCmsScoreHook();

    setTimeout(scanExistingPendingSubmissions, 500);
    setTimeout(scanExistingPendingSubmissions, 2000);

    document.addEventListener(
      "submit",
      (event) => {
        const form = event.target;

        if (!(form instanceof HTMLFormElement)) return;

        const text = `${form.action || ""} ${form.textContent || ""}`.toLowerCase();

        if (
          text.includes("submit") ||
          text.includes("submission") ||
          form.querySelector("input[type='file'], textarea, select")
        ) {
          markSubmissionDetected("form submit");
        }
      },
      true
    );

    document.addEventListener(
      "click",
      (event) => {
        const target = event.target instanceof Element ? event.target : null;

        const button = target?.closest?.(
          "button, input[type='submit'], input[type='button'], a.btn, .btn"
        );

        if (!button) return;

        const label = `${button.textContent || button.value || button.getAttribute("title") || ""}`.toLowerCase();
        const form = button.closest?.("form");
        const action = `${form?.action || ""}`.toLowerCase();

        if (
          label.includes("submit") ||
          label.includes("ส่ง") ||
          label.includes("upload") ||
          action.includes("submit") ||
          action.includes("submission")
        ) {
          markSubmissionDetected("submit button click");
        }
      },
      true
    );

    const observer = new MutationObserver((mutations) => {
      if (suppressAutoRefreshObserver) return;

      let scoreOrSubmissionChanged = false;

      for (const mutation of mutations) {
        if (
          mutation.type !== "childList" &&
          mutation.type !== "characterData" &&
          mutation.type !== "attributes"
        ) {
          continue;
        }

        const target =
          mutation.target instanceof Element
            ? mutation.target
            : mutation.target?.parentElement;

        if (
          target?.closest?.(
            "#submission_list, #task_score_public, .task_score_container, td.public_score, td.status"
          )
        ) {
          scoreOrSubmissionChanged = true;
          break;
        }

        for (const node of mutation.addedNodes || []) {
          if (
            node.nodeType === Node.ELEMENT_NODE &&
            (
              node.matches?.(
                "#submission_list, #submission_list *, #task_score_public, .task_score_container, td.public_score, td.status"
              ) ||
              node.querySelector?.(
                "#submission_list, #task_score_public, .task_score_container, td.public_score, td.status"
              )
            )
          ) {
            scoreOrSubmissionChanged = true;
            break;
          }
        }

        if (scoreOrSubmissionChanged) break;
      }

      if (scoreOrSubmissionChanged) {
        syncCurrentTaskScoreFromPage();
        markSubmissionDetected("score/submission DOM changed");
      }
    });

    setTimeout(() => {
      observer.observe(document.body, {
        childList: true,
        subtree: true,
        characterData: true,
        attributes: true,
        attributeFilter: ["class", "data-status"],
      });
    }, 500);
  }

  async function main() {
    if (!isCMSPage()) return;
    if (!user) return;

    await loadStorageCache();
    collectTaskOrder();

    const elements = document.querySelectorAll(".nav-list li");

    updateSidebar();
    createControls();
    setupKeybind();
    applyFakeToCurrentPage();

    setupSubmissionListener();

    await fetchAllScore(elements);

    collectTaskOrder();

    suppressAutoRefreshObserver = true;

    try {
      updateSidebar();
      updateTotalScore();
      renderTaskList();
      applyFakeToCurrentPage();
    } finally {
      setTimeout(() => {
        suppressAutoRefreshObserver = false;
      }, 0);
    }

    await storeStorageCache();
  }

  main();
})();
