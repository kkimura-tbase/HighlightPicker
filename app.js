(function () {
  "use strict";

  const STORAGE_KEY = "context-vocab-items-v1";
  const REVIEW_STORAGE_KEY = "context-vocab-review-v1";
  const OWNER_KEY = "context-vocab-owner";
  const LESSON_KEY = "context-vocab-current-lesson";
  const QUIZ_AUTO_NEXT_KEY = "context-vocab-quiz-auto-next";
  const DEFAULT_OWNER = "";
  const DEFAULT_LESSONS = ["Unit 1", "Unit 2", "Unit 3", "Unit 4", "Unit 5", "Unit 6", "Unit 7", "Unit 8"];
  const CUSTOM_LESSON_VALUE = "__custom__";
  const CONTEXTUAL_MEANINGS = {
    sort: {
      "動詞": "分類する、整理する",
      "名詞": "種類、分類"
    },
    work: {
      "動詞": "働く、機能する",
      "名詞": "仕事、作品"
    },
    play: {
      "動詞": "遊ぶ、演奏する",
      "名詞": "遊び、劇"
    },
    run: {
      "動詞": "走る、運営する",
      "名詞": "走ること、連続"
    },
    change: {
      "動詞": "変える、変わる",
      "名詞": "変化、変更"
    },
    use: {
      "動詞": "使う",
      "名詞": "使用、用途"
    },
    help: {
      "動詞": "助ける、役に立つ",
      "名詞": "助け、手伝い"
    },
    point: {
      "動詞": "指し示す",
      "名詞": "点、要点"
    },
    form: {
      "動詞": "形作る",
      "名詞": "形、形式"
    },
    object: {
      "動詞": "反対する",
      "名詞": "物、目的語"
    },
    present: {
      "動詞": "提示する",
      "名詞": "現在、贈り物",
      "形容詞": "出席している、現在の"
    },
    record: {
      "動詞": "記録する",
      "名詞": "記録"
    }
  };
  const CONTEXTUAL_POS_WORDS = new Set(Object.keys(CONTEXTUAL_MEANINGS));
  // 教師側で端末ごとに固定したい場合だけ、任意の氏名またはIDを入れます。
  const FIXED_OWNER = "";
  // 管理者が固定のGAS URLを配布したい場合だけ、ここに /exec のURLを入れます。
  const GAS_ENDPOINT = "https://script.google.com/macros/s/AKfycbwsob6egv26XAl64Xxiv4m5GWevAnHnHjMW6v1uCcb6DoXG1yg5j4JIeTs4OwyhOH4g2g/exec";

  const $ = (id) => document.getElementById(id);
  const els = {
    ownerLabel: $("ownerLabel"),
    ownerSetup: $("ownerSetup"),
    ownerSetupTitle: $("ownerSetupTitle"),
    ownerInput: $("ownerInput"),
    saveOwnerBtn: $("saveOwnerBtn"),
    changeOwnerBtn: $("changeOwnerBtn"),
    imageInput: $("imageInput"),
    chooseImageBtn: $("chooseImageBtn"),
    dropZone: $("dropZone"),
    previewWrap: $("previewWrap"),
    canvas: $("imageCanvas"),
    runOcrBtn: $("runOcrBtn"),
    ocrStatus: $("ocrStatus"),
    ocrLang: $("ocrLang"),
    highlightSensitivity: $("highlightSensitivity"),
    resultsList: $("resultsList"),
    detectedCount: $("detectedCount"),
    saveBar: $("saveBar"),
    lessonSelect: $("lessonSelect"),
    customLessonInput: $("customLessonInput"),
    lessonOptions: $("lessonOptions"),
    saveAllBtn: $("saveAllBtn"),
    wordList: $("wordList"),
    searchInput: $("searchInput"),
    refreshListBtn: $("refreshListBtn"),
    exportCsvBtn: $("exportCsvBtn"),
    quizMode: $("quizMode"),
    quizDirection: $("quizDirection"),
    quizScope: $("quizScope"),
    quizLesson: $("quizLesson"),
    quizAutoNext: $("quizAutoNext"),
    startQuizBtn: $("startQuizBtn"),
    nextQuizBtn: $("nextQuizBtn"),
    quizBox: $("quizBox"),
    quizModeButtons: document.querySelectorAll(".quiz-mode-btn"),
    quizDirectionButtons: document.querySelectorAll(".quiz-direction-btn"),
    resultTemplate: $("resultTemplate"),
    readingZoneBtn: $("readingZoneBtn"),
    clearReadingBtn: $("clearReadingBtn"),
    clearImageBtn: $("clearImageBtn"),
    clearListBtn: $("clearListBtn"),
    uploadPanel: $("uploadPanel")
  };

  const ctx = els.canvas.getContext("2d");
  let imageBitmap = null;
  let detectedResults = [];
  let saveNotice = null;
  let savedItems = [];
  let quizSession = null;
  let inclusionZones = [];
  let inclusionModeActive = false;
  let inclusionDragStart = null;
  let inclusionDragCurrent = null;
  let lastHighlightRects = [];
  let canvasScale = 1;
  let rafId = null;
  let editingSavedItemId = null;
  let quizAutoNextTimer = null;
  let quizAutoNextInterval = null;
  let quizTimerId = null;
  
  // ソート状態
  let sortConfig = { key: "createdAt", asc: false };

  init();

  function init() {
    setOwnerLabel();
    els.saveOwnerBtn.addEventListener("click", saveOwnerFromInput);
    if (els.changeOwnerBtn) els.changeOwnerBtn.addEventListener("click", startOwnerEdit);
    els.ownerInput.addEventListener("keydown", (event) => {
      if (event.key === "Enter") saveOwnerFromInput();
    });
    els.chooseImageBtn.addEventListener("click", () => els.imageInput.click());
    els.imageInput.addEventListener("change", (event) => {
      const file = event.target.files && event.target.files[0];
      if (file) loadImageFile(file);
    });
    els.dropZone.addEventListener("dragover", onDragOver);
    els.dropZone.addEventListener("dragleave", () => els.dropZone.classList.remove("is-active"));
    els.dropZone.addEventListener("drop", onDrop);
    els.dropZone.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        els.imageInput.click();
      }
    });
    window.addEventListener("paste", onPaste);
    els.runOcrBtn.addEventListener("click", runExtraction);
    els.saveAllBtn.addEventListener("click", saveDetectedItems);
    if (els.lessonSelect) {
      restoreLessonSelection(localStorage.getItem(LESSON_KEY) || "");
      els.lessonSelect.addEventListener("change", () => {
        updateCustomLessonVisibility(true);
        localStorage.setItem(LESSON_KEY, getCurrentLesson());
      });
    }
    if (els.customLessonInput) {
      els.customLessonInput.addEventListener("input", () => {
        localStorage.setItem(LESSON_KEY, getCurrentLesson());
      });
    }
    els.searchInput.addEventListener("input", renderWordList);
    els.refreshListBtn.addEventListener("click", loadSavedItems);
    els.exportCsvBtn.addEventListener("click", exportCsv);
    els.startQuizBtn.addEventListener("click", () => {
      if (els.startQuizBtn.dataset.quizAction === "home") {
        showRandomQuiz(false);
        return;
      }
      startQuizSession();
    });
    els.nextQuizBtn.addEventListener("click", () => advanceQuiz());
    if (els.quizMode) {
      setupQuizModeButtons();
      els.quizMode.addEventListener("change", () => {
        updateQuizModeButtons();
        showRandomQuiz(false);
      });
    }
    if (els.quizDirection) {
      setupQuizDirectionButtons();
      els.quizDirection.addEventListener("change", () => {
        updateQuizDirectionButtons();
        showRandomQuiz(false);
      });
    }
    els.quizScope.addEventListener("change", () => showRandomQuiz(false));
    if (els.quizLesson) els.quizLesson.addEventListener("change", () => showRandomQuiz(false));
    if (els.quizAutoNext) {
      els.quizAutoNext.checked = getQuizAutoNextPreference();
      els.quizAutoNext.addEventListener("change", () => {
        localStorage.setItem(QUIZ_AUTO_NEXT_KEY, els.quizAutoNext.checked ? "1" : "0");
        if (!els.quizAutoNext.checked) clearQuizAutoNext();
      });
    }
    els.readingZoneBtn.addEventListener("click", toggleReadingMode);
    els.clearReadingBtn.addEventListener("click", clearReadingZone);
    els.clearImageBtn.addEventListener("click", clearImage);
    els.clearListBtn.addEventListener("click", clearSavedItems);
    els.canvas.addEventListener("mousedown", onCanvasMouseDown);
    els.canvas.addEventListener("mousemove", onCanvasMouseMove);
    els.canvas.addEventListener("mouseup", onCanvasMouseUp);
    els.canvas.addEventListener("mouseleave", onCanvasMouseLeave);
    document.addEventListener("mousemove", onCanvasMouseMove);
    document.addEventListener("mouseup", onCanvasMouseUp);
    els.canvas.addEventListener("touchstart", onCanvasMouseDown, { passive: false });
    els.canvas.addEventListener("touchmove", onCanvasMouseMove, { passive: false });
    els.canvas.addEventListener("touchend", onCanvasMouseUp, { passive: false });
    els.canvas.addEventListener("touchcancel", onCanvasMouseLeave, { passive: false });
    document.addEventListener("touchmove", onCanvasMouseMove, { passive: false });
    document.addEventListener("touchend", onCanvasMouseUp, { passive: false });

    document.querySelectorAll(".tab-btn").forEach(btn => {
      btn.addEventListener("click", () => {
        document.querySelectorAll(".tab-btn").forEach(b => b.classList.remove("active"));
        document.querySelectorAll(".tab-pane").forEach(p => p.classList.remove("active"));
        btn.classList.add("active");
        const targetId = btn.getAttribute("data-target");
        if (targetId) {
          document.getElementById(targetId).classList.add("active");
        }
      });
    });

    // ソートボタンのイベントリスナー
    const tableHeaders = document.querySelectorAll("#wordTable th[data-sort]");
    if (tableHeaders) {
      tableHeaders.forEach(th => {
        th.addEventListener("click", () => {
          const key = th.getAttribute("data-sort");
          if (sortConfig.key === key) {
            sortConfig.asc = !sortConfig.asc;
          } else {
            sortConfig.key = key;
            sortConfig.asc = true;
          }
          // すべてのヘッダーからクラスを削除
          tableHeaders.forEach(h => {
             h.classList.remove("sort-asc", "sort-desc");
          });
          th.classList.add(sortConfig.asc ? "sort-asc" : "sort-desc");
          renderWordList();
        });
      });
      // 初期状態アイコン
      const initialTh = document.querySelector(`#wordTable th[data-sort="createdAt"]`);
      if (initialTh) initialTh.classList.add("sort-desc");
    }

    if (getCurrentOwner()) {
      hideOwnerSetup();
      loadSavedItems();
    } else {
      showOwnerSetup(false);
      renderWordList();
      showRandomQuiz(false);
    }
  }

  function getCurrentOwner() {
    return normalizeOwner(FIXED_OWNER || localStorage.getItem(OWNER_KEY) || DEFAULT_OWNER);
  }

  function normalizeOwner(value) {
    return String(value || "").trim().slice(0, 80);
  }

  function normalizeLesson(value) {
    return String(value || "").trim().slice(0, 80);
  }

  function getCurrentLesson() {
    let lesson = localStorage.getItem(LESSON_KEY) || "";
    if (els.lessonSelect) {
      lesson = els.lessonSelect.value === CUSTOM_LESSON_VALUE
        ? (els.customLessonInput ? els.customLessonInput.value : "")
        : els.lessonSelect.value;
    }
    lesson = normalizeLesson(lesson);
    if (lesson) localStorage.setItem(LESSON_KEY, lesson);
    return lesson;
  }

  function restoreLessonSelection(value) {
    const lesson = normalizeLesson(value);
    if (!els.lessonSelect) return;
    if (!lesson || DEFAULT_LESSONS.includes(lesson)) {
      els.lessonSelect.value = lesson;
      if (els.customLessonInput) els.customLessonInput.value = "";
    } else {
      els.lessonSelect.value = CUSTOM_LESSON_VALUE;
      if (els.customLessonInput) els.customLessonInput.value = lesson;
    }
    updateCustomLessonVisibility();
  }

  function updateCustomLessonVisibility(shouldFocus) {
    if (!els.lessonSelect || !els.customLessonInput) return;
    const isCustom = els.lessonSelect.value === CUSTOM_LESSON_VALUE;
    els.customLessonInput.hidden = !isCustom;
    if (isCustom && shouldFocus) window.setTimeout(() => els.customLessonInput.focus(), 0);
  }

  function setLessonEditControls(select, input, value) {
    const lesson = normalizeLesson(value);
    if (!select || !input) return;
    if (!lesson || DEFAULT_LESSONS.includes(lesson)) {
      select.value = lesson;
      input.value = "";
    } else {
      select.value = CUSTOM_LESSON_VALUE;
      input.value = lesson;
    }
    updateLessonEditCustomVisibility(select, input, false);
  }

  function updateLessonEditCustomVisibility(select, input, shouldFocus) {
    if (!select || !input) return;
    const isCustom = select.value === CUSTOM_LESSON_VALUE;
    input.hidden = !isCustom;
    if (isCustom && shouldFocus) window.setTimeout(() => input.focus(), 0);
  }

  function getLessonEditValue(select, input) {
    if (!select) return "";
    return normalizeLesson(select.value === CUSTOM_LESSON_VALUE ? (input ? input.value : "") : select.value);
  }

  function getCurrentOwnerLabel() {
    return getCurrentOwner() || "未登録";
  }

  function setOwnerLabel() {
    if (els.ownerLabel) els.ownerLabel.textContent = getCurrentOwnerLabel();
  }

  function showOwnerSetup(isEditing) {
    if (els.ownerSetupTitle) els.ownerSetupTitle.textContent = isEditing ? "利用者を変更" : "利用者を登録";
    if (els.saveOwnerBtn) els.saveOwnerBtn.textContent = isEditing ? "変更する" : "登録して始める";
    if (els.ownerInput) els.ownerInput.value = isEditing ? getCurrentOwner() : "";
    els.ownerSetup.hidden = false;
    window.setTimeout(() => {
      els.ownerInput.focus();
      if (isEditing) els.ownerInput.select();
    }, 0);
  }

  function hideOwnerSetup() {
    els.ownerSetup.hidden = true;
  }

  function startOwnerEdit() {
    if (FIXED_OWNER) {
      alert("この端末では利用者名が固定されています。");
      return;
    }
    showOwnerSetup(true);
  }

  async function saveOwnerFromInput() {
    const owner = normalizeOwner(els.ownerInput.value);
    if (!owner) {
      alert("氏名またはIDを入力してください。");
      els.ownerInput.focus();
      return;
    }
    localStorage.setItem(OWNER_KEY, owner);
    setOwnerLabel();
    hideOwnerSetup();
    await loadSavedItems();
  }

  function withCurrentOwner(item) {
    return { ...item, owner: item.owner || getCurrentOwner() };
  }

  function onDragOver(event) {
    event.preventDefault();
    els.dropZone.classList.add("is-active");
  }

  function onDrop(event) {
    event.preventDefault();
    els.dropZone.classList.remove("is-active");
    const file = Array.from(event.dataTransfer.files).find((item) => item.type.startsWith("image/"));
    if (file) loadImageFile(file);
  }

  function onPaste(event) {
    const clipboard = event.clipboardData;
    const files = Array.from(clipboard.files || []);
    const itemFiles = Array.from(clipboard.items || [])
      .filter((item) => item.type.startsWith("image/"))
      .map((item) => item.getAsFile())
      .filter(Boolean);
    const file = [...files, ...itemFiles].find((item) => item.type.startsWith("image/"));
    if (file) {
      event.preventDefault();
      loadImageFile(file);
    }
  }

  async function loadImageFile(file) {
    clearSaveNotice();
    setStatus("画像読込中");
    const url = URL.createObjectURL(file);
    try {
      imageBitmap = await loadImage(url);
      drawImage();
      els.previewWrap.hidden = false;
      els.runOcrBtn.disabled = false;
      els.readingZoneBtn.disabled = false;
      inclusionZones = [];
      lastHighlightRects = [];
      if (inclusionModeActive) {
        inclusionModeActive = false;
        els.readingZoneBtn.classList.remove("is-active");
        els.readingZoneBtn.textContent = "読み取りエリア設定";
        els.canvas.classList.remove("reading-mode");
      }
      els.clearReadingBtn.hidden = true;
      els.clearImageBtn.hidden = false;
      els.uploadPanel.classList.add("has-image");
      setStatus("読込完了");
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  function loadImage(src) {
    return new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = reject;
      image.src = src;
    });
  }

  function drawImage(rectangles) {
    if (!imageBitmap) return;
    const maxSide = 1800;
    canvasScale = Math.min(1, maxSide / Math.max(imageBitmap.naturalWidth, imageBitmap.naturalHeight));
    const scale = canvasScale;
    els.canvas.width = Math.round(imageBitmap.naturalWidth * scale);
    els.canvas.height = Math.round(imageBitmap.naturalHeight * scale);
    ctx.clearRect(0, 0, els.canvas.width, els.canvas.height);
    ctx.drawImage(imageBitmap, 0, 0, els.canvas.width, els.canvas.height);

    drawReadingOverlay();

    if (rectangles && rectangles.length) {
      ctx.save();
      ctx.lineWidth = 3;
      ctx.strokeStyle = "#2563eb";
      ctx.fillStyle = "rgba(37, 99, 235, 0.10)";
      rectangles.forEach((rect) => {
        ctx.fillRect(rect.x, rect.y, rect.width, rect.height);
        ctx.strokeRect(rect.x, rect.y, rect.width, rect.height);
      });
      ctx.restore();
    }
  }

  function drawReadingOverlay() {
    const hasZones = inclusionZones.length > 0;
    const hasDrag = inclusionDragStart !== null && inclusionDragCurrent !== null;
    if (!hasZones && !hasDrag) return;
    ctx.save();
    if (hasZones) {
      ctx.fillStyle = "rgba(0, 0, 0, 0.50)";
      ctx.fillRect(0, 0, els.canvas.width, els.canvas.height);
      inclusionZones.forEach((zone) => {
        ctx.drawImage(
          imageBitmap,
          zone.x / canvasScale, zone.y / canvasScale,
          zone.width / canvasScale, zone.height / canvasScale,
          zone.x, zone.y, zone.width, zone.height
        );
        ctx.strokeStyle = "#10b981";
        ctx.lineWidth = 2;
        ctx.setLineDash([]);
        ctx.strokeRect(zone.x, zone.y, zone.width, zone.height);
      });
    }
    if (hasDrag) {
      const rx = Math.min(inclusionDragStart.x, inclusionDragCurrent.x);
      const ry = Math.min(inclusionDragStart.y, inclusionDragCurrent.y);
      const rw = Math.abs(inclusionDragCurrent.x - inclusionDragStart.x);
      const rh = Math.abs(inclusionDragCurrent.y - inclusionDragStart.y);
      ctx.fillStyle = "rgba(16, 185, 129, 0.20)";
      ctx.strokeStyle = "#10b981";
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 3]);
      ctx.fillRect(rx, ry, rw, rh);
      ctx.strokeRect(rx, ry, rw, rh);
    }
    ctx.restore();
  }

  function getCanvasCoords(e) {
    const rect = els.canvas.getBoundingClientRect();
    const scaleX = els.canvas.width / rect.width;
    const scaleY = els.canvas.height / rect.height;
    const point = e.touches ? (e.touches[0] || e.changedTouches[0]) : e;
    const rawX = (point.clientX - rect.left) * scaleX;
    const rawY = (point.clientY - rect.top) * scaleY;
    return {
      x: clamp(rawX, 0, els.canvas.width),
      y: clamp(rawY, 0, els.canvas.height)
    };
  }

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function toggleReadingMode() {
    inclusionModeActive = !inclusionModeActive;
    els.readingZoneBtn.classList.toggle("is-active", inclusionModeActive);
    els.canvas.classList.toggle("reading-mode", inclusionModeActive);
    els.readingZoneBtn.textContent = inclusionModeActive ? "エリア設定中" : "読み取りエリア設定";
  }

  function clearReadingZone() {
    inclusionZones = [];
    inclusionDragStart = null;
    inclusionDragCurrent = null;
    els.clearReadingBtn.hidden = true;
    drawImage(lastHighlightRects);
  }

  function clearImage() {
    clearSaveNotice();
    imageBitmap = null;
    ctx.clearRect(0, 0, els.canvas.width, els.canvas.height);
    els.uploadPanel.classList.remove("has-image");
    els.runOcrBtn.disabled = true;
    els.readingZoneBtn.disabled = true;
    els.clearReadingBtn.hidden = true;
    els.clearImageBtn.hidden = true;
    els.previewWrap.hidden = true;
    inclusionZones = [];
    lastHighlightRects = [];
    detectedResults = [];
    renderResults();
    setStatus("画像クリア");
  }

  function onCanvasMouseDown(e) {
    if (!inclusionModeActive || !imageBitmap) return;
    e.preventDefault();
    inclusionDragStart = getCanvasCoords(e);
    inclusionDragCurrent = { ...inclusionDragStart };
  }

  function onCanvasMouseMove(e) {
    if (!inclusionModeActive || !inclusionDragStart) return;
    e.preventDefault();
    inclusionDragCurrent = getCanvasCoords(e);
    if (!rafId) {
      rafId = requestAnimationFrame(() => {
        rafId = null;
        drawImage(lastHighlightRects);
      });
    }
  }

  function onCanvasMouseUp(e) {
    if (!inclusionModeActive || !inclusionDragStart) return;
    e.preventDefault();
    const end = getCanvasCoords(e);
    const x = Math.min(inclusionDragStart.x, end.x);
    const y = Math.min(inclusionDragStart.y, end.y);
    const width = Math.abs(end.x - inclusionDragStart.x);
    const height = Math.abs(end.y - inclusionDragStart.y);
    inclusionDragStart = null;
    inclusionDragCurrent = null;
    if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
    if (width >= 5 && height >= 5) {
      inclusionZones.push({ x, y, width, height });
      els.clearReadingBtn.hidden = false;
    }
    drawImage(lastHighlightRects);
  }

  function onCanvasMouseLeave(e) {
    if (!inclusionModeActive || !inclusionDragStart) return;
    if (e && (e.touches || e.changedTouches)) e.preventDefault();
    inclusionDragCurrent = e ? getCanvasCoords(e) : inclusionDragCurrent;
    drawImage(lastHighlightRects);
  }

  async function runExtraction() {
    if (!imageBitmap) return;
    clearSaveNotice();
    if (!window.Tesseract) {
      setStatus("OCR未読込");
      alert("Tesseract.jsを読み込めませんでした。インターネット接続を確認してから再読み込みしてください。");
      return;
    }
    setStatus("ハイライト検出中");
    drawImage();
    const highlightRects = detectYellowHighlights();
    lastHighlightRects = highlightRects;
    drawImage(highlightRects);

    if (!highlightRects.length) {
      detectedResults = [];
      renderResults();
      setStatus("ハイライトなし");
      return;
    }

    setStatus("OCR中");
    els.runOcrBtn.disabled = true;
    // OCR用に枠なしのクリーンなオフスクリーンキャンバスを作成する
    const ocrCanvas = document.createElement("canvas");
    ocrCanvas.width = els.canvas.width;
    ocrCanvas.height = els.canvas.height;
    ocrCanvas.getContext("2d").drawImage(imageBitmap, 0, 0, ocrCanvas.width, ocrCanvas.height);
    try {
      const result = await Tesseract.recognize(ocrCanvas, els.ocrLang.value, {
        logger: (message) => {
          if (message.status === "recognizing text" && typeof message.progress === "number") {
            setStatus(`${Math.round(message.progress * 100)}%`);
          }
        }
      });
      detectedResults = buildResults(result.data, highlightRects, inclusionZones);
      renderResults();
      if (detectedResults.length) {
        try {
          await enrichDetectedItems();
          renderResults();
        } catch (translationError) {
          console.warn(translationError);
          setStatus("翻訳失敗");
          alert("OCRは完了しましたが、自動翻訳に失敗しました。GASのURLと公開設定を確認してください。");
        }
      }
      setStatus(detectedResults.length ? "抽出完了" : "該当なし");
    } catch (error) {
      console.error(error);
    setStatus("OCR失敗");
      alert("OCRに失敗しました。画像を少し拡大したスクリーンショットで再度お試しください。");
    } finally {
      els.runOcrBtn.disabled = false;
    }
  }

  function detectYellowHighlights() {
    const imageData = ctx.getImageData(0, 0, els.canvas.width, els.canvas.height);
    const data = imageData.data;
    const width = imageData.width;
    const height = imageData.height;
    const sensitivity = els.highlightSensitivity.value;
    const options = {
      strict: { sat: 0.38, val: 0.55, minPixels: 45 },
      normal: { sat: 0.25, val: 0.48, minPixels: 35 },
      loose: { sat: 0.16, val: 0.42, minPixels: 25 }
    }[sensitivity];

    const hasInclusionZone = inclusionZones.length > 0;
    const includeMask = new Uint8Array(width * height);
    if (hasInclusionZone) {
      inclusionZones.forEach((zone) => {
        const ix0 = Math.max(0, Math.floor(zone.x));
        const iy0 = Math.max(0, Math.floor(zone.y));
        const ix1 = Math.min(width, Math.ceil(zone.x + zone.width));
        const iy1 = Math.min(height, Math.ceil(zone.y + zone.height));
        for (let iy = iy0; iy < iy1; iy++) {
          for (let ix = ix0; ix < ix1; ix++) {
            includeMask[iy * width + ix] = 1;
          }
        }
      });
    } else {
      includeMask.fill(1);
    }

    const mask = new Uint8Array(width * height);
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        if (!includeMask[y * width + x]) continue;
        const i = (y * width + x) * 4;
        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];
        const hsv = rgbToHsv(r, g, b);
        const isYellowHue = hsv.h >= 38 && hsv.h <= 72;
        const hasYellowBias = r > b + 24 && g > b + 18 && Math.abs(r - g) < 95;
        if (isYellowHue && hasYellowBias && hsv.s >= options.sat && hsv.v >= options.val) {
          mask[y * width + x] = 1;
        }
      }
    }

    const visited = new Uint8Array(width * height);
    const rects = [];
    const queue = [];

    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const start = y * width + x;
        if (!mask[start] || visited[start]) continue;
        let minX = x;
        let maxX = x;
        let minY = y;
        let maxY = y;
        let pixels = 0;
        queue.length = 0;
        queue.push(start);
        visited[start] = 1;

        while (queue.length) {
          const point = queue.pop();
          const px = point % width;
          const py = Math.floor(point / width);
          pixels += 1;
          if (px < minX) minX = px;
          if (px > maxX) maxX = px;
          if (py < minY) minY = py;
          if (py > maxY) maxY = py;

          addNeighbor(px + 1, py);
          addNeighbor(px - 1, py);
          addNeighbor(px, py + 1);
          addNeighbor(px, py - 1);
        }

        const rectWidth = maxX - minX + 1;
        const rectHeight = maxY - minY + 1;
        if (pixels >= options.minPixels && rectWidth >= 8 && rectHeight >= 4) {
          rects.push(padRect({ x: minX, y: minY, width: rectWidth, height: rectHeight }, width, height, 2));
        }
      }
    }

    return mergeNearbyRects(rects).sort((a, b) => a.y - b.y || a.x - b.x);

    function addNeighbor(nx, ny) {
      if (nx < 0 || ny < 0 || nx >= width || ny >= height) return;
      const next = ny * width + nx;
      if (mask[next] && !visited[next]) {
        visited[next] = 1;
        queue.push(next);
      }
    }
  }

  function rgbToHsv(r, g, b) {
    const nr = r / 255;
    const ng = g / 255;
    const nb = b / 255;
    const max = Math.max(nr, ng, nb);
    const min = Math.min(nr, ng, nb);
    const delta = max - min;
    let h = 0;
    if (delta) {
      if (max === nr) h = ((ng - nb) / delta) % 6;
      else if (max === ng) h = (nb - nr) / delta + 2;
      else h = (nr - ng) / delta + 4;
      h *= 60;
      if (h < 0) h += 360;
    }
    return { h, s: max ? delta / max : 0, v: max };
  }

  function padRect(rect, maxWidth, maxHeight, padding) {
    const x = Math.max(0, rect.x - padding);
    const y = Math.max(0, rect.y - padding);
    const right = Math.min(maxWidth, rect.x + rect.width + padding);
    const bottom = Math.min(maxHeight, rect.y + rect.height + padding);
    return { x, y, width: right - x, height: bottom - y };
  }

  function mergeNearbyRects(rects) {
    const merged = [];
    rects.forEach((rect) => {
      const target = merged.find((item) => shouldMerge(item, rect));
      if (target) {
        const left = Math.min(target.x, rect.x);
        const top = Math.min(target.y, rect.y);
        const right = Math.max(target.x + target.width, rect.x + rect.width);
        const bottom = Math.max(target.y + target.height, rect.y + rect.height);
        target.x = left;
        target.y = top;
        target.width = right - left;
        target.height = bottom - top;
      } else {
        merged.push({ ...rect });
      }
    });
    return merged;
  }

  function shouldMerge(a, b) {
    // 同一行判定: 垂直方向に40%以上重なる（同一行のハイライトのみマージ）
    const vertOverlap = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);
    const minH = Math.min(a.height, b.height);
    const sameLine = minH > 0 && vertOverlap / minH >= 0.4;
    // 水平方向: 実際に重なっているときのみマージ（隣接する別ハイライトの誤結合を防ぐ）
    return sameLine && overlaps(a, b) > 0;
  }

  function centerX(rect) {
    return rect.x + rect.width / 2;
  }

  function centerY(rect) {
    return rect.y + rect.height / 2;
  }

  function overlaps(a, b) {
    const left = Math.max(a.x, b.x);
    const top = Math.max(a.y, b.y);
    const right = Math.min(a.x + a.width, b.x + b.width);
    const bottom = Math.min(a.y + a.height, b.y + b.height);
    return Math.max(0, right - left) * Math.max(0, bottom - top);
  }

  function buildResults(data, highlightRects, zones) {
    const words = normalizeWords(data);
    const allLines = normalizeLines(data).filter(line => isCleanLine(line.text));
    const lines = zones && zones.length
      ? allLines.filter((line) => zones.some((zone) => overlaps(line.bbox, zone) > 0))
      : allLines;
    const fullText = lines.map((line) => line.text).join("\n") || data.text || "";
    const found = [];

    highlightRects.forEach((rect) => {
      const rectWords = words.filter((word) => isInside(word.bbox, rect));
      if (!rectWords.length) return;
      const sorted = rectWords.sort((a, b) => a.bbox.y - b.bbox.y || a.bbox.x - b.bbox.x);
      const text = cleanWord(sorted.map((word) => word.text).join(" "));
      if (!text) return;

      // 複数語が1つのハイライト内にある場合は連語としてそのまま保持（例: get away）
      // 単語1語の場合のみ原形に変換する
      const wordTokens = text.split(" ");
      const baseWord = wordTokens.length === 1 ? lemmatize(text) : text;
      
      const context = findBestContext(text, sorted, lines, fullText);
      const pos = detectPos(baseWord, context);
      found.push({
        id: makeId(),
        word: baseWord,
        pos,
        context,
        contextJa: "",
        meaning: getContextualMeaning(baseWord, context, pos),
        confidence: Math.round(average(sorted.map((word) => word.confidence))),
        source: "OCR",
        createdAt: new Date().toISOString()
      });
    });

    return uniqueByWordAndContext(found);
  }

  function normalizeWords(data) {
    const sourceWords = Array.isArray(data.words) ? data.words : [];
    return sourceWords.map((word) => ({
      text: word.text || "",
      confidence: Number.isFinite(word.confidence) ? word.confidence : 0,
      bbox: normalizeBbox(word.bbox || word)
    })).filter((word) => cleanWord(word.text) && word.bbox.width > 0 && word.bbox.height > 0);
  }

  function normalizeLines(data) {
    const sourceLines = Array.isArray(data.lines) ? data.lines : [];
    return sourceLines.map((line) => {
      let text = line.text || "";
      // line.words が利用可能な場合、信頼度の低い単語（OCRゴミ）を除外して再構築する
      // 画像テクスチャの誤読は通常 confidence < 45% になる
      const lineWords = Array.isArray(line.words) ? line.words : [];
      if (lineWords.length > 0) {
        const filtered = lineWords
          .filter(w => !Number.isFinite(w.confidence) || w.confidence >= 45)
          .map(w => (w.text || "").trim())
          .filter(t => t.length > 0);
        if (filtered.length > 0) {
          text = filtered.join(" ");
        }
      }
      return { text, bbox: normalizeBbox(line.bbox || line) };
    }).filter((line) => line.text.trim());
  }

  function normalizeBbox(bbox) {
    const x0 = Number(bbox.x0 ?? bbox.left ?? bbox.x ?? 0);
    const y0 = Number(bbox.y0 ?? bbox.top ?? bbox.y ?? 0);
    const x1 = Number(bbox.x1 ?? (x0 + Number(bbox.width ?? 0)));
    const y1 = Number(bbox.y1 ?? (y0 + Number(bbox.height ?? 0)));
    return { x: x0, y: y0, width: x1 - x0, height: y1 - y0 };
  }

  function isInside(inner, outer) {
    const cx = centerX(inner);
    const cy = centerY(inner);
    return cx >= outer.x && cx <= outer.x + outer.width && cy >= outer.y && cy <= outer.y + outer.height;
  }

  function cleanWord(text) {
    return text
      .replace(/[^\p{L}\p{N}'’\- ]/gu, "")
      .replace(/\s+/g, " ")
      .trim();
  }

  // OCRゴミ文字を除去してテキストをクリーンにする
  function cleanOcrText(text) {
    return text
      .replace(/[|\\^~`<>{}\[\]@#\$%*=]+/g, " ")
      .replace(/\s{2,}/g, " ")
      .trim();
  }

  // 日本語の「意味」フィールドが文章になっていないか判定する
  function isSentenceLike(text) {
    if (!text) return false;
    if (/。.+/.test(text)) return true;                    // 句点の後にさらに文字あり → 確実に文章
    if (text.length > 30 && /。/.test(text)) return true;  // 長い文字列中の句点 → 文章
    if (text.length > 50 && /、/.test(text)) return true;  // 長い＋読点あり → 文章
    return false;
  }

  // OCR行の品質チェック（記号まみれのゴミ行を除外する）
  function isCleanLine(text) {
    const t = text.trim();
    if (!t || t.length < 3) return false;
    if (!/[a-zA-Z]{2,}/.test(t)) return false;
    const garbage = (t.match(/[|\\^~`<>{}\[\]@#\$%*=]/g) || []).length;
    if (garbage / t.length > 0.12) return false;
    return true;
  }
  // 簡易ステミング・原形復元
  function lemmatize(word) {
    const w = word.toLowerCase();
    
    // 代表的な不規則変化も補正する
    const irregulars = {
      "is": "be", "am": "be", "are": "be", "was": "be", "were": "be", "been": "be",
      "has": "have", "had": "have",
      "does": "do", "did": "do", "done": "do",
      "goes": "go", "went": "go", "gone": "go",
      "makes": "make", "made": "make",
      "takes": "take", "took": "take",
      "comes": "come", "came": "come", "coming": "come",
      "sees": "see", "saw": "see", "seen": "see", "seeing": "see",
      "knows": "know", "knew": "know", "known": "know",
      "gets": "get", "got": "get", "gotten": "get",
      "gives": "give", "gave": "give", "given": "give",
      "finds": "find", "found": "find",
      "thinks": "think", "thought": "think",
      "tells": "tell", "told": "tell",
      "becomes": "become", "became": "become",
      "shows": "show", "showed": "show", "shown": "show",
      "leaves": "leave", "left": "leave",
      "feels": "feel", "felt": "feel",
      "puts": "put", "put": "put", // past is same
      "brings": "bring", "brought": "bring",
      "begins": "begin", "began": "begin", "begun": "begin",
      "keeps": "keep", "kept": "keep",
      "holds": "hold", "held": "hold",
      "writes": "write", "wrote": "write", "written": "write",
      "stands": "stand", "stood": "stand",
      "hears": "hear", "heard": "hear",
      "lets": "let", // left is already in leave
      "means": "mean", "meant": "mean",
      "sets": "set",
      "meets": "meet", "met": "meet",
      "runs": "run", "ran": "run",
      "pays": "pay", "paid": "pay",
      "sits": "sit", "sat": "sit",
      "speaks": "speak", "spoke": "speak", "spoken": "speak",
      "lies": "lie", "lay": "lie", "lain": "lie",
      "leads": "lead", "led": "lead",
      "reads": "read", "read": "read",
      "grows": "grow", "grew": "grow", "grown": "grow",
      "loses": "lose", "lost": "lose",
      "falls": "fall", "fell": "fall",
      "sends": "send", "sent": "send",
      "builds": "build", "built": "build",
      "understands": "understand", "understood": "understand",
      "draws": "draw", "drew": "draw", "drawn": "draw",
      "breaks": "break", "broke": "break", "broken": "break",
      "spends": "spend", "spent": "spend",
      "cuts": "cut",
      "rises": "rise", "rose": "rise", "risen": "rise",
      "drives": "drive", "drove": "drive", "driven": "drive",
      "buys": "buy", "bought": "buy",
      "wears": "wear", "wore": "wear", "worn": "wear",
      "chooses": "choose", "chose": "choose", "chosen": "choose",
      "sorts": "sort", "sorted": "sort", "sorting": "sort",
      "children": "child",
      "men": "man",
      "women": "woman",
      "mice": "mouse",
      "teeth": "tooth",
      "feet": "foot",
      "people": "person"
    };

    if (irregulars[w]) return irregulars[w];

    // 単純な語尾変化の除去
    if (w.length > 4) {
      if (w.endsWith("ies")) return w.slice(0, -3) + "y";
      if (w.endsWith("es") && (w.endsWith("ches") || w.endsWith("shes") || w.endsWith("sses") || w.endsWith("xes"))) return w.slice(0, -2);
      if (w.endsWith("s") && !w.endsWith("ss") && !w.endsWith("us") && !w.endsWith("is")) return w.slice(0, -1);
      
      if (w.endsWith("ied")) return w.slice(0, -3) + "y";
      if (w.endsWith("ed")) {
        // e.g., stopped -> stop, played -> play. 
        // e.g., liked -> like
        if (w.match(/([bcdfghjklmnpqrstvwxyz])\1ed$/)) return w.slice(0, -3); // dropped -> drop
        if (w.endsWith("cked") || w.endsWith("shed") || w.endsWith("ched")) return w.slice(0, -2); // checked -> check
        return w.slice(0, -1); // changed -> change (it's hard to distinguish liked->like vs played->play without dict. fallback to removing 'd')
      }
      
      if (w.endsWith("ing")) {
        if (w.match(/([bcdfghjklmnpqrstvwxyz])\1ing$/)) return w.slice(0, -4); // dropping -> drop
        if (w.endsWith("ying")) return w.slice(0, -3); // playing -> play
        return w.slice(0, -3) + "e"; // making -> make (again, imperfect without dict)
      }
    }

    return w;
  }

  function findBestContext(text, words, lines, fullText) {
    if (!words.length || !lines.length) {
      const w = cleanWord(text).split(" ")[0];
      const s = findSentenceContaining(fullText.replace(/\n/g, " "), w);
      return (s && s.length <= 500) ? cleanOcrText(s) : cleanOcrText(fullText.trim().substring(0, 200));
    }

    // ハイライト語のbboxと重なる行を位置基準で特定する
    const sortedLines = [...lines].sort((a, b) => a.bbox.y - b.bbox.y);
    const avgY = average(words.map(w => centerY(w.bbox)));

    // ハイライト語の中心Yが含まれる行を探す
    let anchorIdx = sortedLines.findIndex(l =>
      words.some(w => centerY(w.bbox) >= l.bbox.y - 4 && centerY(w.bbox) <= l.bbox.y + l.bbox.height + 4)
    );
    if (anchorIdx === -1) {
      let minDist = Infinity;
      sortedLines.forEach((l, i) => {
        const d = Math.abs(centerY(l.bbox) - avgY);
        if (d < minDist) { minDist = d; anchorIdx = i; }
      });
    }

    // anchor行の前後3行を結合して段落テキストを作り、その中の1文を探す
    const winStart = Math.max(0, anchorIdx - 3);
    const winEnd = Math.min(sortedLines.length - 1, anchorIdx + 3);
    const paragraph = sortedLines.slice(winStart, winEnd + 1).map(l => cleanOcrText(l.text.trim())).join(" ");
    const targetWord = cleanWord(text).split(" ")[0];
    const sentence = findSentenceContaining(paragraph, targetWord);
    if (sentence && sentence.length <= 500) return cleanOcrText(sentence);

    return cleanOcrText(sortedLines[anchorIdx].text.trim()) || text;
  }
  function findSentenceContaining(text, word) {
    const normalized = text.replace(/\s+/g, " ").trim();
    if (!normalized) return "";
    const sentences = normalized.match(/[^.!?]+[.!?]?/g) || [normalized];
    const lowerWord = word.toLowerCase();
    const found = sentences.find((sentence) => sentence.toLowerCase().includes(lowerWord));
    return (found || normalized).trim();
  }

  function average(values) {
    const realValues = values.filter((value) => Number.isFinite(value));
    if (!realValues.length) return 0;
    return realValues.reduce((sum, value) => sum + value, 0) / realValues.length;
  }

  function uniqueByWordAndContext(items) {
    const seen = new Set();
    return items.filter((item) => {
      const key = `${item.word.toLowerCase()}|${item.context.toLowerCase()}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  function uniqueByOwnerWordAndContext(items) {
    const seenIds = new Set();
    const idDedupedItems = [];

    items.forEach((item) => {
      const owner = item.owner || DEFAULT_OWNER;
      const id = String(item.id || "").trim();
      const idKey = id ? `${owner}|${id}` : "";
      if (idKey && seenIds.has(idKey)) return;
      if (idKey) seenIds.add(idKey);
      idDedupedItems.push(item);
    });

    const resultByKey = new Map();
    const lessonByKey = new Map();
    const keysByBase = new Map();

    idDedupedItems.forEach((item) => {
      const owner = item.owner || DEFAULT_OWNER;
      const lesson = normalizeLesson(item.lesson || "");
      const word = String(item.word || "").trim().toLowerCase();
      const context = String(item.context || "").trim().toLowerCase();
      const baseKey = `${owner}|${word}|${context}`;
      const key = `${owner}|${lesson}|${word}|${context}`;
      const baseKeys = keysByBase.get(baseKey) || new Set();

      if (lesson) {
        baseKeys.forEach((existingKey) => {
          if (!lessonByKey.get(existingKey)) {
            resultByKey.delete(existingKey);
            lessonByKey.delete(existingKey);
            baseKeys.delete(existingKey);
          }
        });
        if (!resultByKey.has(key)) {
          resultByKey.set(key, { ...item, lesson });
          lessonByKey.set(key, lesson);
          baseKeys.add(key);
        }
      } else {
        const hasTaggedItem = [...baseKeys].some((existingKey) => Boolean(lessonByKey.get(existingKey)));
        if (!hasTaggedItem && !resultByKey.has(key)) {
          resultByKey.set(key, { ...item, lesson });
          lessonByKey.set(key, lesson);
          baseKeys.add(key);
        }
      }

      keysByBase.set(baseKey, baseKeys);
    });

    return [...resultByKey.values()];
  }

  function detectPos(word, context) {
    // 複数語（句）の場合
    const text = String(word || "").trim();
    if (!text) return "";
    const tokens = text.split(/\s+/);
    if (tokens.length >= 2) {
      const first = tokens[0].toLowerCase().replace(/[^a-z]/g, "");
      if (/^(get|go|come|take|give|make|put|look|turn|run|fall|break|bring|keep|set|cut|let|hold|carry|pass|pick|pull|push|call|try|work|move|play|write|speak|think|feel|hear|see|find|use|show|send|read|grow|lose|build|locate|explore|discover|develop)$/.test(first)) return "動詞句";
      return "名詞句";
    }
    const contextualPos = detectContextualPos(text, context);
    if (contextualPos) return contextualPos;
    return detectPosByWord(text);
  }

  function detectPosByWord(word) {
    const KNOWN = {
      "名詞": ["behavior","belief","chance","connection","definition","exam","example","fact","habit","luck","pattern","performance","superstition","world","brain","sport","athlete","score","question","object","time","day","pen","percent","result","place","point","thing","way","life","part","people","year","hand","name","group","idea","case","week","test","kind","mind","power","number","level","end","health","sense","effort","skill","rule","goal","term","role","risk","type","form","process","terrace","greenery","scenery","landscape","agriculture","economy","community","technology","nature","culture","society","environment","mountain","valley","river","forest","region","area","student","president","assistant","participant","element","moment","department","subject","project","impact","concept","aspect","account"],
      "形容詞": ["complex","difficult","irrational","lucky","professional","rational","simple","superstitious","careful","useful","different","important","special","good","bad","new","old","high","low","long","short","large","small","big","little","right","wrong","true","false","free","full","hard","soft","fast","slow","early","late","young","open","close","clear","dark","light","deep","real","strong","weak","sure","aware","able","ready","lush","vast","scenic","rural","urban","natural","local","global","ancient","modern","beautiful","amazing","traditional","significant","relevant","efficient","effective","appropriate","available","various","diverse","unique","typical","common","popular","current","recent","major","minor","primary","secondary"],
      "動詞": ["admit","believe","connect","involve","look","make","study","think","use","help","find","get","know","show","take","try","want","work","give","need","go","come","see","say","tell","ask","put","seem","feel","keep","let","begin","start","stop","move","play","run","set","turn","live","bring","hold","read","sit","stand","lose","pay","meet","include","continue","learn","change","lead","understand","watch","follow","create","build","send","spend","locate","explore","discover","develop","improve","support","protect","produce","cultivate","consider","provide","require","represent","describe","explain","suggest","indicate","allow","enable","prevent","promote","reduce","increase","achieve","maintain","establish","identify"],
      "副詞": ["actually","carefully","instead","also","even","just","only","really","very","well","always","never","often","usually","already","still","yet","again","away","back","here","there","now","then","today","soon","later","together","however","therefore","moreover","perhaps","probably","simply","clearly","directly","mostly","rather","quite","once","especially","particularly","generally","largely","mainly","rapidly","gradually","recently","currently","traditionally","typically"]
    };
    const w = word.toLowerCase().replace(/[^a-z]/g, "");
    if (!w) return "";
    for (const [label, list] of Object.entries(KNOWN)) {
      if (list.includes(w)) return label;
    }
    if (/ly$/.test(w) && w.length > 4) return "副詞";
    if (/(tion|sion|ment|ness|ity|ance|ence|hood|ship|ism|age|ery|ure|ture|ics|ogy|omy)$/i.test(w)) return "名詞";
    if (/(ist|er|or|ee|eer|ian|ess)$/i.test(w) && w.length > 4) return "名詞";
    if (/(ful|less|ous|ive|al|ic|ary|ible|able|ish|ular|esque|ant|ent)$/i.test(w) && w.length > 5) return "形容詞";
    if (/(ize|ise|ify|ate|ened|ening)$/i.test(w)) return "動詞";
    return "";
  }

  function detectContextualPos(word, context) {
    const base = normalizeLookupWord(lemmatize(word));
    if (!base || !CONTEXTUAL_POS_WORDS.has(base) || !context) return "";

    const contextTokens = tokenizeEnglish(context);
    let best = { label: "", score: 0 };
    contextTokens.forEach((token, index) => {
      if (!matchesTargetToken(token, base)) return;
      const scores = scoreContextualPos(contextTokens, index, base);
      Object.entries(scores).forEach(([label, score]) => {
        if (score > best.score) best = { label, score };
      });
    });

    return best.score >= 2 ? best.label : "";
  }

  function scoreContextualPos(tokens, index, base) {
    const prev2 = tokens[index - 2] || "";
    const prev = tokens[index - 1] || "";
    const current = tokens[index] || "";
    const next = tokens[index + 1] || "";
    const next2 = tokens[index + 2] || "";
    const scores = { "名詞": 0, "動詞": 0, "形容詞": 0 };
    const determiners = new Set(["a","an","the","this","that","these","those","my","your","his","her","its","our","their","each","every","another","any","some","no"]);
    const prepositions = new Set(["of","for","with","without","in","on","at","by","from","about","as","like","between","among","through","into","over","under","after","before"]);
    const modals = new Set(["will","would","can","could","should","may","might","must","shall"]);
    const auxiliaries = new Set(["do","does","did","be","am","is","are","was","were","been","being","have","has","had"]);
    const subjects = new Set(["i","you","we","they","he","she","it","who","that","which"]);
    const objectStarts = new Set(["a","an","the","this","that","these","those","my","your","his","her","its","our","their","me","you","him","her","it","us","them"]);
    const particles = new Set(["out","up","down","in","into","through","by","away","back"]);

    if (determiners.has(prev)) scores["名詞"] += 4;
    if (next === "of") scores["名詞"] += base === "sort" ? 4 : 2;
    if (prepositions.has(prev)) scores["名詞"] += 3;
    if (["same","different","other","another","common","special","important","main"].includes(prev)) scores["名詞"] += 2;

    if (prev === "to" || modals.has(prev) || auxiliaries.has(prev)) scores["動詞"] += 4;
    if (auxiliaries.has(prev2) && ["not","never"].includes(prev)) scores["動詞"] += 4;
    if (subjects.has(prev)) scores["動詞"] += 2;
    if (objectStarts.has(next) || particles.has(next)) scores["動詞"] += 2;
    if (base === "object" && next === "to") scores["動詞"] += 4;
    if (base === "sort" && next === "out") scores["動詞"] += 4;
    if ((current.endsWith("ed") || current.endsWith("ing")) && !determiners.has(prev)) scores["動詞"] += 2;
    if (index === 0 && (objectStarts.has(next) || particles.has(next))) scores["動詞"] += 1;

    if (base === "present" && auxiliaries.has(prev) && !objectStarts.has(next) && next2 !== "to") {
      scores["形容詞"] += 3;
    }

    return scores;
  }

  function getContextualMeaning(word, context, pos) {
    const base = normalizeLookupWord(lemmatize(word));
    const meanings = CONTEXTUAL_MEANINGS[base];
    if (!meanings) return "";
    const detectedPos = pos || detectPos(word, context);
    if (base === "sort" && /\bsort(?:s|ed|ing)?\s+out\b/i.test(String(context || ""))) {
      return "整理する、解決する";
    }
    return meanings[detectedPos] || "";
  }

  function tokenizeEnglish(text) {
    return (String(text || "").toLowerCase().match(/[a-z]+(?:'[a-z]+)?/g) || [])
      .map((token) => token.replace(/^'+|'+$/g, ""));
  }

  function matchesTargetToken(token, base) {
    const clean = normalizeLookupWord(token);
    if (!clean) return false;
    if (clean === base) return true;
    if (normalizeLookupWord(lemmatize(clean)) === base) return true;
    if (clean.endsWith("s") && clean.slice(0, -1) === base) return true;
    if (clean.endsWith("ed") && clean.slice(0, -2) === base) return true;
    if (clean.endsWith("ing") && clean.slice(0, -3) === base) return true;
    return false;
  }

  function normalizeLookupWord(word) {
    return String(word || "").toLowerCase().replace(/[^a-z]/g, "");
  }

  function clearSaveNotice() {
    saveNotice = null;
  }

  function renderResults() {
    const hasResults = detectedResults.length > 0;
    const hasSaveNotice = Boolean(saveNotice);
    els.resultsList.classList.toggle("empty-state", !hasResults && !hasSaveNotice);
    els.resultsList.classList.toggle("save-complete-list", !hasResults && hasSaveNotice);
    els.resultsList.innerHTML = "";
    els.detectedCount.textContent = !hasResults && hasSaveNotice ? "保存済み" : `${detectedResults.length}件`;
    els.saveAllBtn.disabled = !hasResults;

    if (!hasResults) {
      if (saveNotice) {
        const noticeClass = {
          complete: "is-complete",
          syncing: "is-syncing",
          warning: "is-warning"
        }[saveNotice.state] || "is-complete";
        const lessonText = saveNotice.lesson ? `レッスン: ${saveNotice.lesson}` : "レッスン未指定";
        els.resultsList.innerHTML = `
          <div class="save-complete-card ${noticeClass}" role="status">
            <strong>${escapeHtml(saveNotice.title)}</strong>
            <p>${escapeHtml(saveNotice.detail)}</p>
            <div class="save-complete-meta">
              <span>${Number(saveNotice.count) || 0}件</span>
              <span>${escapeHtml(lessonText)}</span>
            </div>
          </div>
        `;
        return;
      }
      els.resultsList.innerHTML = "<p>ハイライト上の単語が見つかりませんでした</p>";
      return;
    }

    detectedResults.forEach((item, index) => {
      const node = els.resultTemplate.content.firstElementChild.cloneNode(true);
      const wordInput = node.querySelector(".word-input");
      const posInput = node.querySelector(".pos-input");
      const contextInput = node.querySelector(".context-input");
      const contextJaInput = node.querySelector(".context-ja-input");
      const meaningInput = node.querySelector(".meaning-input");
      wordInput.value = item.word;
      if (posInput) posInput.value = item.pos || "";
      contextInput.value = item.context;
      contextJaInput.value = item.contextJa || "";
      meaningInput.value = item.meaning || "";
      node.querySelector(".confidence").textContent = `信頼度 ${item.confidence || 0}%`;
      node.querySelector(".source-note").textContent = item.source;
      node.querySelector(".remove-result").addEventListener("click", () => {
        detectedResults.splice(index, 1);
        renderResults();
      });
      wordInput.addEventListener("input", () => { item.word = wordInput.value.trim(); });
      if (posInput) posInput.addEventListener("input", () => { item.pos = posInput.value.trim(); });
      contextInput.addEventListener("input", () => { item.context = contextInput.value.trim(); });
      contextJaInput.addEventListener("input", () => { item.contextJa = contextJaInput.value.trim(); });
      meaningInput.addEventListener("input", () => { item.meaning = meaningInput.value.trim(); });
      els.resultsList.appendChild(node);
    });
  }

  async function enrichDetectedItems() {
    const endpoint = saveEndpoint();
    if (!endpoint) {
      detectedResults = detectedResults.map((item) => ({
        ...item,
        pos: item.pos || detectPos(item.word, item.context),
        contextJa: item.contextJa || "",
        meaning: item.meaning || getContextualMeaning(item.word, item.context, item.pos)
      }));
      setStatus("翻訳URLなし");
      return;
    }

    setStatus("自動翻訳中");
    const payloadItems = detectedResults.map((item) => ({
      id: item.id,
      word: item.word,
      context: item.context
    }));
    const data = await postToGas(endpoint, { action: "enrichMany", items: payloadItems });
    const enrichedById = new Map((data.items || []).map((item) => [item.id, item]));
    detectedResults = detectedResults.map((item) => {
      const enriched = enrichedById.get(item.id) || {};
      const pos = enriched.pos || item.pos || detectPos(item.word, item.context);
      const contextualMeaning = getContextualMeaning(item.word, item.context, pos);
      const rawMeaning = contextualMeaning || enriched.meaning || item.meaning || "";
      // 文章っぽい意味（句点あり、または50文字超かつ読点あり）はゴミとして除外する
      const meaning = isSentenceLike(rawMeaning) ? (contextualMeaning || "") : rawMeaning;
      return {
        ...item,
        pos,
        contextJa: enriched.contextJa || item.contextJa || "",
        meaning
      };
    });
  }

  async function saveDetectedItems() {
    try {
      const owner = getCurrentOwner();
      if (!owner) {
        showOwnerSetup(false);
        alert("先に氏名またはIDを登録してください。");
        return;
      }

      const lesson = getCurrentLesson();
      const items = detectedResults
        .map((item) => {
          const word = (item.word || "").trim();
          const context = (item.context || "").trim();
          const pos = (item.pos || "").trim() || detectPos(word, context);
          return {
            ...item,
            lesson,
            word,
            pos,
            context,
            contextJa: (item.contextJa || "").trim(),
            meaning: (item.meaning || "").trim() || getContextualMeaning(word, context, pos),
            createdAt: item.createdAt || new Date().toISOString(),
            owner
          };
        })
        .filter((item) => item.word);

      if (!items.length) {
        setStatus("保存対象なし");
        alert("保存できる単語がありません。抽出結果の英単語欄を確認してください。");
        return;
      }

      setStatus("保存中");
      els.saveAllBtn.disabled = true;
      const savedCount = items.length;
      const endpoint = saveEndpoint();

      // GAS同期に失敗しても、端末内の履歴は失わないよう先にローカル保存する。
      saveLocalItems(items);
      detectedResults = [];
      saveNotice = {
        state: endpoint ? "syncing" : "complete",
        title: endpoint ? "端末内に保存しました" : "単語帳に追加しました",
        detail: endpoint ? "クラウド同期を確認しています" : "端末内への保存が完了しました",
        count: savedCount,
        lesson
      };
      renderResults();
      renderWordList();
      showRandomQuiz(false);

      if (!endpoint) {
        setStatus("ローカル保存完了");
        alert("端末内に保存しました。");
        return;
      }

      try {
        await postToGas(endpoint, { action: "saveMany", owner, items });
        await loadSavedItems();
        setStatus("保存完了");
        saveNotice = {
          state: "complete",
          title: "単語帳に追加しました",
          detail: "保存と同期が完了しました",
          count: savedCount,
          lesson
        };
        renderResults();
      } catch (error) {
        console.error(error);
        setStatus("GAS同期失敗");
        saveNotice = {
          state: "warning",
          title: "端末内に保存しました",
          detail: "GASへの同期は未完了です",
          count: savedCount,
          lesson
        };
        renderResults();
        alert("端末内には保存しましたが、GASへの同期に失敗しました。\n\n理由：" + formatErrorMessage(error) + "\n\nGAS側のCode.gsを最新版に貼り替えて、Webアプリを再デプロイしてください。");
      }
    } catch (error) {
      console.error(error);
      setStatus("保存失敗");
      if (detectedResults.length) els.saveAllBtn.disabled = false;
      alert("保存処理でエラーが発生しました。\n\n理由：" + formatErrorMessage(error));
    }
  }
  function saveEndpoint() {
    return GAS_ENDPOINT;
  }

  function formatErrorMessage(error) {
    if (!error) return "不明なエラー";
    return error.message || String(error);
  }

  async function postToGas(endpoint, payload) {
    const response = await fetch(endpoint, {
      method: "POST",
      body: JSON.stringify(payload)
    });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status} ${response.statusText}`);
    }
    let data;
    try {
      data = await response.json();
    } catch {
      throw new Error(`GASからのレスポンスがJSON形式ではありません（HTMLが返された可能性があります）`);
    }
    if (!data.ok) {
      throw new Error(data.error || "GAS側でエラーが発生しました");
    }
    return data;
  }

  async function getToGas(endpoint, params) {
    const url = new URL(endpoint);
    Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, String(v)));
    const response = await fetch(url.toString(), { cache: "no-store" });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status} ${response.statusText}`);
    }
    let data;
    try {
      data = await response.json();
    } catch {
      throw new Error(`GASからのレスポンスがJSON形式ではありません（HTMLが返された可能性があります）`);
    }
    if (!data.ok) {
      throw new Error(data.error || "GAS側でエラーが発生しました");
    }
    return data;
  }

  async function loadSavedItems() {
    const endpoint = saveEndpoint();
    try {
      if (endpoint) {
        const url = new URL(endpoint);
        url.searchParams.set("action", "list");
        url.searchParams.set("owner", getCurrentOwner());
        const response = await fetch(url.toString());
        const data = await response.json();
        if (data.ok && Array.isArray(data.items)) {
          savedItems = mergeLocalItems(data.items.map(withCurrentOwner))
            .filter((item) => item.owner === getCurrentOwner());
        } else {
          savedItems = getLocalItemsForCurrentOwner();
        }
      } else {
        savedItems = getLocalItemsForCurrentOwner();
      }
    } catch (error) {
      console.warn(error);
      savedItems = getLocalItemsForCurrentOwner();
    }
    savedItems = savedItems.map((item) => ({
      ...item,
      lesson: normalizeLesson(item.lesson || ""),
      pos: item.pos || detectPos(item.word, item.context),
      meaning: item.meaning || getContextualMeaning(item.word, item.context, item.pos)
    }));
    refreshLessonChoices();
    renderWordList();
    showRandomQuiz(false);
  }

  function saveLocalItems(items) {
    const ownerItems = items.map(withCurrentOwner);
    savedItems = mergeLocalItems(ownerItems).filter((item) => item.owner === getCurrentOwner());
    refreshLessonChoices();
  }

  function mergeLocalItems(items) {
    const merged = uniqueByOwnerWordAndContext([...items.map(withCurrentOwner), ...getLocalItems()]);
    saveLocalSnapshot(merged);
    return merged;
  }

  function getLocalItemsForCurrentOwner() {
    const owner = getCurrentOwner();
    return uniqueByOwnerWordAndContext(getLocalItems()).filter((item) => (item.owner || DEFAULT_OWNER) === owner);
  }

  function getLocalItems() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]").map((item) => ({
        ...item,
        lesson: normalizeLesson(item.lesson || ""),
        owner: item.owner || DEFAULT_OWNER
      }));
    } catch {
      return [];
    }
  }

  function refreshLessonChoices() {
    const lessons = getKnownLessons();
    if (els.lessonOptions) {
      els.lessonOptions.innerHTML = lessons.map((lesson) => `<option value="${escapeHtml(lesson)}"></option>`).join("");
    }
    if (els.quizLesson) {
      const current = els.quizLesson.value || "all";
      els.quizLesson.innerHTML = [
        '<option value="all">すべて</option>',
        ...lessons.map((lesson) => `<option value="${escapeHtml(lesson)}">${escapeHtml(lesson)}</option>`)
      ].join("");
      els.quizLesson.value = lessons.includes(current) ? current : "all";
    }
  }

  function getKnownLessons() {
    const lessons = new Set(DEFAULT_LESSONS);
    getLocalItems().forEach((item) => {
      const lesson = normalizeLesson(item.lesson || "");
      if (lesson) lessons.add(lesson);
    });
    savedItems.forEach((item) => {
      const lesson = normalizeLesson(item.lesson || "");
      if (lesson) lessons.add(lesson);
    });
    return [...lessons].sort(compareLessonLabels);
  }

  function compareLessonLabels(a, b) {
    const unitA = /^Unit\s+(\d+)$/i.exec(a);
    const unitB = /^Unit\s+(\d+)$/i.exec(b);
    if (unitA && unitB) return Number(unitA[1]) - Number(unitB[1]);
    if (unitA) return -1;
    if (unitB) return 1;
    return a.localeCompare(b, "ja");
  }

  function saveLocalSnapshot(items) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  }


  async function clearSavedItems() {
    const ownerLabel = getCurrentOwnerLabel();
    if (!confirm(`${ownerLabel} の単語データを削除します。本当によろしいですか？`)) return;
    // 選択中の利用者分だけ先に削除
    const owner = getCurrentOwner();
    saveLocalSnapshot(getLocalItems().filter((item) => item.owner !== owner));
    savedItems = [];
    refreshLessonChoices();
    renderWordList();
    showRandomQuiz(false);
    // GASが設定されていれば同期（失敗してもローカルはすでに削除済み）
    const endpoint = saveEndpoint();
    if (endpoint) {
      try {
        await postToGas(endpoint, { action: "clear", owner: getCurrentOwner() });
      } catch (error) {
        console.error(error);
        alert(`ローカルデータは削除しました。GAS側の削除に失敗しました。URLを確認してください。\n\nエラー：${error.message}`);
        return;
      }
    }
    alert(`${ownerLabel} のデータを消去しました。`);
  }

  async function deleteSavedItem(id) {
    if (!confirm("この単語を削除しますか？")) return;
    // ローカルは先に必ず削除
    const owner = getCurrentOwner();
    const remaining = getLocalItems().filter(item => !(item.id === id && item.owner === owner));
    saveLocalSnapshot(remaining);
    savedItems = remaining.filter(item => item.owner === owner);
    refreshLessonChoices();
    renderWordList();
    showRandomQuiz(false);
    // GASが設定されていれば同期（失敗してもローカルはすでに削除済み）
    const endpoint = saveEndpoint();
    if (endpoint) {
      try {
        await postToGas(endpoint, { action: "delete", owner: getCurrentOwner(), id });
      } catch (error) {
        console.error(error);
        alert(`ローカルから削除しました。GAS側の削除に失敗しました。URLを確認してください。\n\nエラー：${error.message}`);
      }
    }
  }

  async function saveSavedItemEdit(id, values) {
    const owner = getCurrentOwner();
    const word = (values.word || "").trim();
    if (!word) {
      alert("英単語を入力してください。");
      return;
    }
    const context = (values.context || "").trim();
    const pos = (values.pos || "").trim() || detectPos(word, context);

    const updatedItem = {
      ...savedItems.find((item) => item.id === id),
      lesson: normalizeLesson(values.lesson || ""),
      word,
      pos,
      meaning: (values.meaning || "").trim() || getContextualMeaning(word, context, pos),
      context,
      contextJa: (values.contextJa || "").trim(),
      owner
    };

    const allItems = getLocalItems().map((item) => (
      item.id === id && item.owner === owner ? updatedItem : item
    ));
    saveLocalSnapshot(allItems);
    savedItems = allItems.filter((item) => item.owner === owner);
    editingSavedItemId = null;
    refreshLessonChoices();
    renderWordList();
    showRandomQuiz(false);

    const endpoint = saveEndpoint();
    if (endpoint) {
      try {
        await postToGas(endpoint, { action: "update", owner, item: updatedItem });
        await loadSavedItems();
      } catch (error) {
        console.error(error);
        alert(`端末内では更新しました。GAS側の更新に失敗しました。URLを確認してください。\n\nエラー：${error.message}`);
      }
    }
  }

  function renderWordList() {
    const query = els.searchInput.value.trim().toLowerCase();
    let sortedItems = [...savedItems];

    // ソート処理
    sortedItems.sort((a, b) => {
      let valA = a[sortConfig.key] || "";
      let valB = b[sortConfig.key] || "";
      
      // No. は現在の表示順を基準にする
      if (sortConfig.key === "id") {
         const idxA = savedItems.indexOf(a);
         const idxB = savedItems.indexOf(b);
         return (sortConfig.asc ? 1 : -1) * (idxA - idxB);
      }
      
      if (typeof valA === "string") valA = valA.toLowerCase();
      if (typeof valB === "string") valB = valB.toLowerCase();
      
      if (valA < valB) return sortConfig.asc ? -1 : 1;
      if (valA > valB) return sortConfig.asc ? 1 : -1;
      return 0;
    });

    const items = sortedItems.filter((item) => {
      const text = `${item.lesson || ""} ${item.word} ${item.meaning} ${item.context} ${item.contextJa} ${item.owner || ""}`.toLowerCase();
      return !query || text.includes(query);
    });

    els.wordList.classList.toggle("empty-state", items.length === 0);
    els.wordList.innerHTML = "";

    if (!items.length) {
      els.wordList.innerHTML = `<tr><td colspan="8" class="empty-msg">保存した単語がありません${query ? "(検索結果ゼロ)" : ""}</td></tr>`;
      return;
    }

    items.forEach((item, index) => {
      const tr = document.createElement("tr");
      if (editingSavedItemId === item.id) {
        tr.className = "is-editing";
        tr.innerHTML = `
          <td class="col-id">${index + 1}</td>
          <td class="col-lesson">
            <select class="table-input edit-lesson-select">
              <option value="">未指定</option>
              ${DEFAULT_LESSONS.map((lesson) => `<option value="${escapeHtml(lesson)}">${escapeHtml(lesson)}</option>`).join("")}
              <option value="${CUSTOM_LESSON_VALUE}">その他</option>
            </select>
            <input class="table-input edit-lesson-custom" type="text" list="lessonOptions" placeholder="レッスン名" hidden>
          </td>
          <td class="col-word"><input class="table-input edit-word" type="text"></td>
          <td class="col-pos"><input class="table-input edit-pos" type="text"></td>
          <td class="col-meaning"><textarea class="table-input table-textarea edit-meaning"></textarea></td>
          <td class="col-context">
            <textarea class="table-input table-textarea edit-context"></textarea>
            <textarea class="table-input table-textarea edit-context-ja" placeholder="例文の日本語訳"></textarea>
          </td>
          <td class="col-date">${formatDate(item.createdAt)}</td>
          <td class="col-actions">
            <div class="edit-actions">
              <button class="btn-save save-edit-btn" type="button">保存</button>
              <button class="btn-cancel cancel-edit-btn" type="button">取消</button>
            </div>
          </td>
        `;

        const lessonSelect = tr.querySelector(".edit-lesson-select");
        const customLessonInput = tr.querySelector(".edit-lesson-custom");
        setLessonEditControls(lessonSelect, customLessonInput, item.lesson || "");
        lessonSelect.addEventListener("change", () => updateLessonEditCustomVisibility(lessonSelect, customLessonInput, true));
        tr.querySelector(".edit-word").value = item.word || "";
        tr.querySelector(".edit-pos").value = item.pos || "";
        tr.querySelector(".edit-meaning").value = item.meaning || "";
        tr.querySelector(".edit-context").value = item.context || "";
        tr.querySelector(".edit-context-ja").value = item.contextJa || "";
        tr.querySelector(".save-edit-btn").addEventListener("click", () => {
          saveSavedItemEdit(item.id, {
            lesson: getLessonEditValue(lessonSelect, customLessonInput),
            word: tr.querySelector(".edit-word").value,
            pos: tr.querySelector(".edit-pos").value,
            meaning: tr.querySelector(".edit-meaning").value,
            context: tr.querySelector(".edit-context").value,
            contextJa: tr.querySelector(".edit-context-ja").value
          });
        });
        tr.querySelector(".cancel-edit-btn").addEventListener("click", () => {
          editingSavedItemId = null;
          renderWordList();
        });
        els.wordList.appendChild(tr);
        return;
      }

      tr.innerHTML = `
        <td class="col-id">${index + 1}</td>
        <td class="col-lesson">${escapeHtml(item.lesson || "-")}</td>
        <td class="col-word">${escapeHtml(item.word)}</td>
        <td class="col-pos">${escapeHtml(item.pos || "-")}</td>
        <td class="col-meaning">${escapeHtml(item.meaning || "")}</td>
        <td class="col-context">${highlightWord(escapeHtml(item.context || ""), item.word)}</td>
        <td class="col-date">${formatDate(item.createdAt)}</td>
        <td class="col-actions">
          <div class="row-actions">
            <button class="btn-edit edit-btn" type="button">編集</button>
            <button class="btn-delete delete-btn" type="button">削除</button>
          </div>
        </td>
      `;

        const editBtn = tr.querySelector(".edit-btn");
        if (editBtn) {
          editBtn.addEventListener("click", () => {
            editingSavedItemId = item.id;
            renderWordList();
          });
        }
        const delBtn = tr.querySelector(".delete-btn");
        if (delBtn) {
          delBtn.addEventListener("click", () => deleteSavedItem(item.id));
        }
        els.wordList.appendChild(tr);
    });
  }

  function showRandomQuiz() {
    clearQuizAutoNext();
    clearQuizTimer();
    quizSession = null;
    els.nextQuizBtn.hidden = true;
    setQuizHeaderAction("start");
    const scope = els.quizScope.value;
    const pool = getQuizPool(scope);

    if (!savedItems.length) {
      els.quizBox.className = "quiz-box empty-state";
      els.quizBox.innerHTML = "<p>単語を保存すると、4択クイズで復習できます</p>";
      return;
    }

    if (!pool.length) {
      els.quizBox.className = "quiz-box empty-state";
      els.quizBox.innerHTML = '<p>' + escapeHtml(getQuizRangeLabel(scope, getSelectedQuizLesson())) + 'に当てはまる単語はありません</p>';
      return;
    }

    const questionCount = pool.length;
    const totalTime = questionCount * 3;
    const isScoreMode = isQuizScoreMode();
    els.quizBox.className = "quiz-box";
    els.quizBox.innerHTML = `
      <div class="quiz-card quiz-start-card">
        <div class="quiz-summary">
          <span>${escapeHtml(getQuizRangeLabel(scope, getSelectedQuizLesson()))}</span>
          <strong>${isScoreMode ? formatQuizTime(totalTime) : `${questionCount}問`}</strong>
        </div>
        <p class="quiz-context">${isScoreMode
          ? `制限時間${formatQuizTime(totalTime)}のスコアチャレンジです。時間内は問題が繰り返し出ます。`
          : "保存した意味から正しい答えを選ぶ4択クイズです。時間を気にせず確認できます。"
        }</p>
        <button id="quizStartInlineBtn" class="button primary" type="button">この範囲で開始</button>
      </div>
    `;
    $("quizStartInlineBtn").addEventListener("click", () => startQuizSession());
  }

  function startQuizSession(retryItems) {
    clearQuizAutoNext();
    clearQuizTimer();
    const scope = els.quizScope.value;
    const pool = Array.isArray(retryItems) ? retryItems : getQuizPool(scope);
    const questions = shuffle(pool);
    const mode = getSelectedQuizMode();
    const direction = getSelectedQuizDirection();
    const totalTime = questions.length * 3;

    if (!questions.length) {
      showRandomQuiz(false);
      return;
    }

    quizSession = {
      scope,
      mode,
      direction,
      lesson: getSelectedQuizLesson(),
      questions,
      index: 0,
      answers: [],
      answered: false,
      choices: [],
      totalTime,
      timeRemaining: totalTime,
      deadline: Date.now() + (totalTime * 1000),
      timedOut: false
    };
    setQuizHeaderAction("home");
    els.nextQuizBtn.hidden = isQuizScoreMode(quizSession);
    renderQuizQuestion();
    if (isQuizScoreMode(quizSession)) startQuizTimer();
  }

  function renderQuizQuestion() {
    clearQuizAutoNext();
    if (!quizSession) {
      showRandomQuiz(false);
      return;
    }

    const item = quizSession.questions[quizSession.index];
    const promptLabel = getQuizPromptLabel(item, quizSession.direction);
    const contextLabel = getQuizContextLabel(item, quizSession.direction);
    quizSession.answered = false;
    quizSession.choices = buildAnswerChoices(item, quizSession.direction);
    els.nextQuizBtn.disabled = true;

    els.quizBox.className = "quiz-box";
    const progressHtml = isQuizScoreMode(quizSession)
      ? getScoreModeProgressHtml()
      : `
        <div class="quiz-progress">
          <span>${quizSession.index + 1} / ${quizSession.questions.length}</span>
          <span>${escapeHtml(getQuizRangeLabel(quizSession.scope, quizSession.lesson))}</span>
        </div>
      `;
    els.quizBox.innerHTML = `
      <div class="quiz-card">
        ${progressHtml}
        <p class="quiz-word">${escapeHtml(promptLabel)}</p>
        <p class="quiz-context">${contextLabel}</p>
        <div class="quiz-options">
          ${quizSession.choices.map((choice, index) => `
            <button class="quiz-option" type="button" data-index="${index}">${escapeHtml(choice)}</button>
          `).join("")}
        </div>
        <div id="quizFeedback" class="quiz-feedback" aria-live="polite"></div>
      </div>
    `;

    els.quizBox.querySelectorAll(".quiz-option").forEach((button) => {
      button.addEventListener("click", () => answerQuiz(Number(button.dataset.index)));
    });
    updateQuizScoreHud();
  }

  function getScoreModeProgressHtml() {
    const score = getQuizScoreSummary(quizSession);
    return `
      <div class="quiz-progress quiz-score-hud">
        <span id="quizTimer" class="quiz-timer">${formatQuizTime(quizSession.timeRemaining)}</span>
        <span>正解 <strong id="quizHudCorrect">${score.correctCount}</strong></span>
        <span>ミス <strong id="quizHudWrong">${score.wrongCount}</strong></span>
        <span>スコア <strong id="quizHudScore">${score.finalScore}</strong></span>
        <span class="quiz-range-label">${escapeHtml(getQuizRangeLabel(quizSession.scope, quizSession.lesson))}</span>
      </div>
    `;
  }

  function answerQuiz(choiceIndex) {
    if (!quizSession || quizSession.answered || (isQuizScoreMode(quizSession) && quizSession.timedOut)) return;

    const item = quizSession.questions[quizSession.index];
    const selected = quizSession.choices[choiceIndex];
    const correctAnswer = getQuizAnswerLabel(item, quizSession.direction);
    const isCorrect = selected === correctAnswer;
    quizSession.answered = true;
    quizSession.answers.push({ item, selected, correctAnswer, isCorrect });
    recordQuizResult(item, isCorrect);
    updateQuizScoreHud();

    if (isQuizScoreMode(quizSession)) {
      showScoreModeAnswerFlash(selected, correctAnswer, isCorrect);
      return;
    }

    els.quizBox.querySelectorAll(".quiz-option").forEach((button) => {
      const choice = quizSession.choices[Number(button.dataset.index)];
      button.disabled = true;
      if (choice === correctAnswer) button.classList.add("is-correct");
      if (choice === selected && !isCorrect) button.classList.add("is-wrong");
    });

    const feedback = $("quizFeedback");
    feedback.className = 'quiz-feedback ' + (isCorrect ? 'is-correct' : 'is-wrong');
    feedback.innerHTML = `
      <strong>${isCorrect ? "正解" : "不正解"}</strong>
      ${getQuizFeedbackLines(item, quizSession.direction)}
      <p>${escapeHtml(item.contextJa || "日本語訳なし")}</p>
    `;
    els.nextQuizBtn.disabled = false;
    scheduleQuizAutoNext(isCorrect);
  }

  function showScoreModeAnswerFlash(selected, correctAnswer, isCorrect) {
    if (!quizSession) return;

    els.quizBox.querySelectorAll(".quiz-option").forEach((button) => {
      const choice = quizSession.choices[Number(button.dataset.index)];
      button.disabled = true;
      if (choice === correctAnswer) button.classList.add("is-correct");
      if (choice === selected && !isCorrect) button.classList.add("is-wrong");
    });

    const feedback = $("quizFeedback");
    if (feedback) {
      feedback.className = 'quiz-flash ' + (isCorrect ? 'is-correct' : 'is-wrong');
      feedback.textContent = isCorrect ? "正解" : "不正解";
    }

    window.setTimeout(() => {
      if (!quizSession || quizSession.timedOut) return;
      advanceScoreModeQuestion();
      renderQuizQuestion();
    }, 360);
  }

  function advanceScoreModeQuestion() {
    if (!quizSession) return;
    if (quizSession.index >= quizSession.questions.length - 1) {
      quizSession.questions = shuffle(quizSession.questions);
      quizSession.index = 0;
      return;
    }
    quizSession.index += 1;
  }

  function advanceQuiz() {
    clearQuizAutoNext();
    if (!quizSession) {
      startQuizSession();
      return;
    }
    if (!quizSession.answered) return;

    if (quizSession.index >= quizSession.questions.length - 1) {
      renderQuizResults();
      return;
    }

    quizSession.index += 1;
    renderQuizQuestion();
  }

  function renderQuizResults() {
    if (!quizSession) return;
    clearQuizAutoNext();
    clearQuizTimer();

    const answers = quizSession.answers;
    const correctCount = answers.filter((answer) => answer.isCorrect).length;
    const wrongAnswers = answers.filter((answer) => !answer.isCorrect);
    const score = getQuizScoreSummary(quizSession);
    const isScoreMode = isQuizScoreMode(quizSession);
    els.nextQuizBtn.hidden = true;
    setQuizHeaderAction("start");

    els.quizBox.className = "quiz-box";
    els.quizBox.innerHTML = `
      <div class="quiz-card quiz-result-card">
        <div class="quiz-score">
          <span>${isScoreMode && quizSession.timedOut ? "時間切れ" : "結果"}</span>
          <strong>${isScoreMode ? score.finalScore : `${correctCount} / ${quizSession.questions.length}`}</strong>
        </div>
        ${isScoreMode ? `
          <div class="quiz-score-breakdown">
            <span>正解 ${correctCount}</span>
            <span>回答 ${answers.length}</span>
            <span>ミス ${score.wrongCount}</span>
            <span>制限時間 ${formatQuizTime(score.totalTime)}</span>
          </div>
        ` : `
          <div class="quiz-score-breakdown">
            <span>正解 ${correctCount} / ${quizSession.questions.length}</span>
            <span>ミス ${score.wrongCount}</span>
            <span>学習モード</span>
            <span>時間制限なし</span>
          </div>
        `}
        <div class="quiz-result-actions">
          <button id="retryWrongBtn" class="button secondary" type="button" ${wrongAnswers.length ? "" : "disabled"}>間違えた単語を再挑戦</button>
          <button id="restartQuizBtn" class="button primary" type="button">同じ範囲でもう一度</button>
        </div>
        <div class="quiz-review-list">
          ${answers.map((answer) => `
            <article class="quiz-review-item ${answer.isCorrect ? "is-correct" : "is-wrong"}">
              <strong>${escapeHtml(answer.item.word)}</strong>
              <span>${answer.isCorrect ? "正解" : "不正解"}</span>
              <p>${escapeHtml(answer.correctAnswer)}</p>
            </article>
          `).join("")}
        </div>
      </div>
    `;

    $("retryWrongBtn").addEventListener("click", () => {
      if (wrongAnswers.length) startQuizSession(wrongAnswers.map((answer) => answer.item));
    });
    $("restartQuizBtn").addEventListener("click", () => startQuizSession());
    renderWordList();
  }

  function startQuizTimer() {
    if (!quizSession || !isQuizScoreMode(quizSession)) return;
    updateQuizTimer();
    quizTimerId = window.setInterval(updateQuizTimer, 250);
  }

  function updateQuizTimer() {
    if (!quizSession || !isQuizScoreMode(quizSession)) {
      clearQuizTimer();
      return;
    }

    const remaining = Math.max(0, Math.ceil((quizSession.deadline - Date.now()) / 1000));
    quizSession.timeRemaining = remaining;
    const timer = $("quizTimer");
    if (timer) {
      timer.textContent = formatQuizTime(remaining);
      timer.classList.toggle("is-danger", remaining <= 5);
    }
    updateQuizScoreHud();

    if (remaining <= 0) {
      quizSession.timedOut = true;
      clearQuizAutoNext();
      renderQuizResults();
    }
  }

  function clearQuizTimer() {
    if (quizTimerId) {
      window.clearInterval(quizTimerId);
      quizTimerId = null;
    }
  }

  function getQuizScoreSummary(session) {
    const answers = session.answers || [];
    const correctCount = answers.filter((answer) => answer.isCorrect).length;
    const wrongCount = answers.filter((answer) => !answer.isCorrect).length;
    const totalTime = session.totalTime || ((session.questions || []).length * 3);
    const baseScore = (correctCount * 100) - (wrongCount * 50);
    const finalScore = totalTime > 0 ? Math.max(0, Math.round(baseScore * (60 / totalTime))) : 0;
    return { correctCount, wrongCount, totalTime, baseScore, finalScore };
  }

  function updateQuizScoreHud() {
    if (!quizSession || !isQuizScoreMode(quizSession)) return;
    const score = getQuizScoreSummary(quizSession);
    const correct = $("quizHudCorrect");
    const wrong = $("quizHudWrong");
    const scoreValue = $("quizHudScore");
    if (correct) correct.textContent = score.correctCount;
    if (wrong) wrong.textContent = score.wrongCount;
    if (scoreValue) scoreValue.textContent = score.finalScore;
  }

  function setupQuizModeButtons() {
    if (!els.quizMode || !els.quizModeButtons || !els.quizModeButtons.length) return;
    els.quizModeButtons.forEach((button) => {
      button.addEventListener("click", () => {
        const mode = button.dataset.quizMode;
        if (!mode) return;
        els.quizMode.value = mode;
        els.quizMode.dispatchEvent(new Event("change", { bubbles: true }));
      });
    });
    updateQuizModeButtons();
  }

  function updateQuizModeButtons() {
    if (!els.quizModeButtons || !els.quizModeButtons.length) return;
    const mode = getSelectedQuizMode();
    els.quizModeButtons.forEach((button) => {
      const isActive = button.dataset.quizMode === mode;
      button.classList.toggle("is-active", isActive);
      button.setAttribute("aria-pressed", isActive ? "true" : "false");
    });
  }

  function setupQuizDirectionButtons() {
    if (!els.quizDirection || !els.quizDirectionButtons || !els.quizDirectionButtons.length) return;
    els.quizDirectionButtons.forEach((button) => {
      button.addEventListener("click", () => {
        const direction = button.dataset.quizDirection;
        if (!direction) return;
        els.quizDirection.value = direction;
        els.quizDirection.dispatchEvent(new Event("change", { bubbles: true }));
      });
    });
    updateQuizDirectionButtons();
  }

  function updateQuizDirectionButtons() {
    if (!els.quizDirectionButtons || !els.quizDirectionButtons.length) return;
    const direction = getSelectedQuizDirection();
    els.quizDirectionButtons.forEach((button) => {
      const isActive = button.dataset.quizDirection === direction;
      button.classList.toggle("is-active", isActive);
      button.setAttribute("aria-pressed", isActive ? "true" : "false");
    });
  }

  function getSelectedQuizMode() {
    return els.quizMode ? els.quizMode.value : "study";
  }

  function isQuizScoreMode(session) {
    return (session ? session.mode : getSelectedQuizMode()) === "score";
  }

  function formatQuizTime(seconds) {
    const safeSeconds = Math.max(0, Math.floor(Number(seconds) || 0));
    const minutes = Math.floor(safeSeconds / 60);
    const rest = String(safeSeconds % 60).padStart(2, "0");
    return `${minutes}:${rest}`;
  }

  function setQuizHeaderAction(action) {
    if (!els.startQuizBtn) return;
    const isHome = action === "home";
    els.startQuizBtn.dataset.quizAction = isHome ? "home" : "start";
    els.startQuizBtn.textContent = isHome ? "ホームに戻る" : "開始";
    els.startQuizBtn.hidden = !isHome;
    els.startQuizBtn.classList.toggle("return-home-btn", isHome);
  }

  function getQuizAutoNextPreference() {
    return localStorage.getItem(QUIZ_AUTO_NEXT_KEY) !== "0";
  }

  function scheduleQuizAutoNext(isCorrect) {
    if (!els.quizAutoNext || !els.quizAutoNext.checked || !quizSession) return;

    const isLastQuestion = quizSession.index >= quizSession.questions.length - 1;
    const delayMs = isCorrect ? 3000 : 5200;
    const targetLabel = isLastQuestion ? "結果へ" : "次の問題へ";
    const feedback = $("quizFeedback");

    if (feedback) {
      const autoNote = document.createElement("div");
      autoNote.className = "quiz-auto-next-note";
      autoNote.innerHTML = `
        <div class="quiz-auto-countdown" aria-live="polite">
          <span class="quiz-countdown-number"></span>
          <span>秒後に${targetLabel}</span>
        </div>
        <button id="pauseAutoNextBtn" class="pause-auto-next-btn" type="button">停止</button>
      `;
      feedback.appendChild(autoNote);
      const pauseBtn = $("pauseAutoNextBtn");
      if (pauseBtn) pauseBtn.addEventListener("click", clearQuizAutoNext);

      const countdownNumber = autoNote.querySelector(".quiz-countdown-number");
      const deadline = Date.now() + delayMs;
      const updateCountdown = () => {
        const remainingSeconds = Math.max(1, Math.ceil((deadline - Date.now()) / 1000));
        if (countdownNumber) countdownNumber.textContent = String(remainingSeconds);
      };
      updateCountdown();
      quizAutoNextInterval = window.setInterval(updateCountdown, 250);
    }

    quizAutoNextTimer = window.setTimeout(() => {
      quizAutoNextTimer = null;
      advanceQuiz();
    }, delayMs);
  }

  function clearQuizAutoNext() {
    if (quizAutoNextTimer) {
      window.clearTimeout(quizAutoNextTimer);
      quizAutoNextTimer = null;
    }
    if (quizAutoNextInterval) {
      window.clearInterval(quizAutoNextInterval);
      quizAutoNextInterval = null;
    }
    const note = document.querySelector(".quiz-auto-next-note");
    if (note) {
      note.innerHTML = "<span>自動送りを停止しました</span>";
    }
  }

  function getQuizPool(scope) {
    const lesson = getSelectedQuizLesson();
    const items = savedItems.filter((item) => {
      if (!getMeaningLabel(item)) return false;
      return lesson === "all" || normalizeLesson(item.lesson || "") === lesson;
    });
    if (scope === "unreviewed") return items.filter((item) => getReviewStatsForItem(item).reviewCount === 0);
    if (scope === "wrong") return items.filter((item) => isWrongReviewItem(item));
    if (scope === "recent") return [...items].sort((a, b) => getTime(b.createdAt) - getTime(a.createdAt)).slice(0, 20);
    if (scope === "weak") return [...items]
      .filter((item) => getWeakScore(item) > 0)
      .sort((a, b) => getWeakScore(b) - getWeakScore(a));
    return items;
  }

  function getSelectedQuizLesson() {
    return els.quizLesson ? els.quizLesson.value : "all";
  }

  function getSelectedQuizDirection() {
    return els.quizDirection ? els.quizDirection.value : "word-to-meaning";
  }

  function isMeaningToWordDirection(direction) {
    return direction === "meaning-to-word";
  }

  function getQuizPromptLabel(item, direction) {
    return isMeaningToWordDirection(direction) ? getMeaningLabel(item) : String(item.word || "").trim();
  }

  function getQuizAnswerLabel(item, direction) {
    return isMeaningToWordDirection(direction) ? String(item.word || "").trim() : getMeaningLabel(item);
  }

  function getQuizContextLabel(item, direction) {
    const context = String(item.context || "").trim();
    if (isMeaningToWordDirection(direction)) {
      return context
        ? escapeHtml(maskWordInContext(context, item.word))
        : "日本語の意味に合う英単語を選びます";
    }
    return highlightWord(escapeHtml(context), item.word);
  }

  function getQuizFeedbackLines(item, direction) {
    if (isMeaningToWordDirection(direction)) {
      return `
        <p>英単語: ${escapeHtml(String(item.word || "").trim())}</p>
        <p>意味: ${escapeHtml(getMeaningLabel(item))}</p>
      `;
    }
    return `<p>意味: ${escapeHtml(getMeaningLabel(item))}</p>`;
  }

  function maskWordInContext(context, word) {
    const target = String(word || "").trim();
    if (!target) return context;
    return context.replace(new RegExp(`\\b${escapeRegExp(target)}\\b`, "gi"), "_____");
  }

  function buildAnswerChoices(item, direction = getSelectedQuizDirection()) {
    const correct = getQuizAnswerLabel(item, direction);
    const choices = [correct];
    const otherAnswers = shuffle(savedItems
      .map((savedItem) => getQuizAnswerLabel(savedItem, direction))
      .filter((answer) => answer && answer !== correct));

    otherAnswers.forEach((answer) => {
      if (choices.length < 4 && !choices.includes(answer)) choices.push(answer);
    });

    const fallbacks = direction === "meaning-to-word"
      ? ["review", "context", "example"]
      : ["文脈から判断する", "まだ意味が登録されていません", "別の意味"];
    fallbacks.forEach((fallback) => {
      if (choices.length < 4 && !choices.includes(fallback) && fallback !== correct) choices.push(fallback);
    });

    return shuffle(choices).slice(0, 4);
  }

  function recordQuizResult(item, isCorrect) {
    const stats = getAllReviewStats();
    const key = getReviewKey(item);
    const current = stats[key] || createEmptyReviewStats();
    const correctStreak = isCorrect ? current.correctStreak + 1 : 0;
    stats[key] = {
      ...current,
      reviewCount: current.reviewCount + 1,
      correctCount: current.correctCount + (isCorrect ? 1 : 0),
      wrongCount: current.wrongCount + (isCorrect ? 0 : 1),
      correctStreak,
      lastResult: isCorrect ? "correct" : "wrong",
      lastReviewedAt: new Date().toISOString(),
      needsReview: isCorrect ? current.needsReview && correctStreak < 2 : true,
      weakScore: Math.max(0, current.weakScore + (isCorrect ? -1 : 2))
    };
    saveAllReviewStats(stats);
  }

  function getAllReviewStats() {
    try {
      return JSON.parse(localStorage.getItem(REVIEW_STORAGE_KEY) || "{}");
    } catch {
      return {};
    }
  }

  function saveAllReviewStats(stats) {
    localStorage.setItem(REVIEW_STORAGE_KEY, JSON.stringify(stats));
  }

  function getReviewStatsForItem(item) {
    return getAllReviewStats()[getReviewKey(item)] || createEmptyReviewStats();
  }

  function createEmptyReviewStats() {
    return {
      reviewCount: 0,
      correctCount: 0,
      wrongCount: 0,
      correctStreak: 0,
      lastResult: "",
      lastReviewedAt: "",
      needsReview: false,
      weakScore: 0
    };
  }

  function getReviewKey(item) {
    const owner = item.owner || getCurrentOwner() || DEFAULT_OWNER;
    const id = item.id || (String(item.word || "") + "|" + String(item.context || ""));
    return owner + "|" + id;
  }

  function isWrongReviewItem(item) {
    const stats = getReviewStatsForItem(item);
    return stats.needsReview || stats.lastResult === "wrong";
  }

  function getWeakScore(item) {
    const stats = getReviewStatsForItem(item);
    return stats.weakScore + (stats.needsReview ? 1 : 0);
  }

  function getMeaningLabel(item) {
    return String(item.meaning || "").trim() || "意味なし";
  }

  function getScopeLabel(scope) {
    const labels = {
      all: "すべての単語",
      wrong: "間違えた単語だけ",
      unreviewed: "未復習の単語だけ",
      recent: "最近追加した単語",
      weak: "苦手度が高い単語"
    };
    return labels[scope] || labels.all;
  }

  function getQuizRangeLabel(scope, lesson) {
    const lessonLabel = lesson && lesson !== "all" ? lesson : "すべてのレッスン";
    return `${lessonLabel} / ${getScopeLabel(scope)}`;
  }

  function getTime(value) {
    const time = new Date(value || 0).getTime();
    return Number.isFinite(time) ? time : 0;
  }

  function shuffle(items) {
    const result = [...items];
    for (let i = result.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [result[i], result[j]] = [result[j], result[i]];
    }
    return result;
  }

  function exportCsv() {
    const rows = [
      ["lesson", "word", "meaning", "context", "contextJa", "createdAt", "source"],
      ...savedItems.map((item) => [
        item.lesson,
        item.word,
        item.meaning,
        item.context,
        item.contextJa,
        item.createdAt,
        item.source
      ])
    ];
    const csv = rows.map((row) => row.map(csvCell).join(",")).join("\r\n");
    const blob = new Blob(["\uFEFF", csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `context-vocab-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  function csvCell(value) {
    const text = String(value ?? "");
    return `"${text.replace(/"/g, '""')}"`;
  }

  function highlightWord(text, word) {
    const clean = String(word || "").trim().replace(/^[^A-Za-z0-9]+|[^A-Za-z0-9]+$/g, "");
    if (!clean || !text) return text;

    const rawParts = clean.split(/\s+/).filter(Boolean);
    const parts = rawParts.map(escapeRegExp);
    if (!parts.length) return text;

    const phrase = rawParts.length === 1
      ? buildHighlightWordForms(rawParts[0]).map(escapeRegExp).join("|")
      : parts.join("\\s+");
    const startsWithWord = /^[A-Za-z0-9]/.test(clean);
    const endsWithWord = /[A-Za-z0-9]$/.test(clean);
    const prefix = startsWithWord ? "(^|[^A-Za-z0-9])" : "";
    const suffix = endsWithWord ? "(?=$|[^A-Za-z0-9])" : "";
    const pattern = new RegExp(`${prefix}(${phrase})${suffix}`, "gi");

    return text.replace(pattern, (match, before, matchedWord) => {
      if (startsWithWord) return `${before}<span class="highlighted-word">${matchedWord}</span>`;
      return `<span class="highlighted-word">${match}</span>`;
    });
  }

  function buildHighlightWordForms(word) {
    const base = String(word || "").trim();
    if (!/^[A-Za-z]+$/.test(base)) return [base];

    const lower = base.toLowerCase();
    const forms = new Set([base]);
    const addWithCase = (suffixForm) => {
      forms.add(base === lower ? suffixForm : suffixForm.replace(lower, base));
    };

    addWithCase(lower + "s");
    addWithCase(lower + "es");
    addWithCase(lower + "ed");
    addWithCase(lower + "ing");

    if (lower.endsWith("y") && !/[aeiou]y$/.test(lower)) {
      addWithCase(lower.slice(0, -1) + "ies");
      addWithCase(lower.slice(0, -1) + "ied");
    }

    if (lower.endsWith("e")) {
      addWithCase(lower + "d");
      addWithCase(lower.slice(0, -1) + "ing");
    }

    return [...forms].sort((a, b) => b.length - a.length);
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function escapeRegExp(value) {
    return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  function formatDate(value) {
    if (!value) return "";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return new Intl.DateTimeFormat("ja-JP", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit"
    }).format(date);
  }

  function makeId() {
    if (window.crypto && window.crypto.randomUUID) return window.crypto.randomUUID();
    return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }

  function setStatus(text) {
    els.ocrStatus.textContent = text;
  }
})();


