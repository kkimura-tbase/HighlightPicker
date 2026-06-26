(function () {
  "use strict";

  const STORAGE_KEY = "context-vocab-items-v1";
  const ENDPOINT_KEY = "context-vocab-gas-endpoint";
  // 教員・管琁E�E�E�E��E�E�E�E�E�E�E��E�E�E�ここにGASのWebApp URLを記�Eすると、生徒�E設定不要で自動連携されます、E
  const GAS_ENDPOINT = "https://script.google.com/macros/s/AKfycbwsob6egv26XAl64Xxiv4m5GWevAnHnHjMW6v1uCcb6DoXG1yg5j4JIeTs4OwyhOH4g2g/exec";

  const $ = (id) => document.getElementById(id);
  const els = {
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
    gasEndpoint: $("gasEndpoint"),
    saveAllBtn: $("saveAllBtn"),
    wordList: $("wordList"),
    searchInput: $("searchInput"),
    refreshListBtn: $("refreshListBtn"),
    exportCsvBtn: $("exportCsvBtn"),
    nextQuizBtn: $("nextQuizBtn"),
    quizBox: $("quizBox"),
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
  let savedItems = [];
  let quizItem = null;
  let inclusionZones = [];
  let inclusionModeActive = false;
  let inclusionDragStart = null;
  let inclusionDragCurrent = null;
  let lastHighlightRects = [];
  let canvasScale = 1;
  let rafId = null;
  
  // ソート状慁E
  let sortConfig = { key: "createdAt", asc: false };

  init();

  function init() {
    els.gasEndpoint.value = GAS_ENDPOINT || localStorage.getItem(ENDPOINT_KEY) || "";
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
    els.gasEndpoint.addEventListener("change", saveEndpoint);
    els.searchInput.addEventListener("input", renderWordList);
    els.refreshListBtn.addEventListener("click", loadSavedItems);
    els.exportCsvBtn.addEventListener("click", exportCsv);
    els.nextQuizBtn.addEventListener("click", showRandomQuiz);
    els.readingZoneBtn.addEventListener("click", toggleReadingMode);
    els.clearReadingBtn.addEventListener("click", clearReadingZone);
    els.clearImageBtn.addEventListener("click", clearImage);
    els.clearListBtn.addEventListener("click", clearSavedItems);
    els.canvas.addEventListener("mousedown", onCanvasMouseDown);
    els.canvas.addEventListener("mousemove", onCanvasMouseMove);
    els.canvas.addEventListener("mouseup", onCanvasMouseUp);
    els.canvas.addEventListener("mouseleave", onCanvasMouseLeave);
    els.canvas.addEventListener("touchstart", onCanvasMouseDown, { passive: false });
    els.canvas.addEventListener("touchmove", onCanvasMouseMove, { passive: false });
    els.canvas.addEventListener("touchend", onCanvasMouseUp, { passive: false });
    els.canvas.addEventListener("touchcancel", onCanvasMouseLeave, { passive: false });

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

    // ソート�Eタンのイベントリスナ�E
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

    loadSavedItems();
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
    return {
      x: (point.clientX - rect.left) * scaleX,
      y: (point.clientY - rect.top) * scaleY
    };
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
    imageBitmap = null;
    ctx.clearRect(0, 0, els.canvas.width, els.canvas.height);
    els.uploadPanel.classList.remove("has-image");
    els.runOcrBtn.disabled = true;
    els.readingZoneBtn.disabled = true;
    els.clearReadingBtn.hidden = true;
    els.clearImageBtn.hidden = true;
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

  function onCanvasMouseLeave() {
    if (!inclusionModeActive || !inclusionDragStart) return;
    inclusionDragStart = null;
    inclusionDragCurrent = null;
    if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
    drawImage(lastHighlightRects);
  }

  async function runExtraction() {
    if (!imageBitmap) return;
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
    // OCR用に枠なし�Eクリーンなオフスクリーンキャンバスを作�Eする
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
      const MIN_OVERLAP_RATIO = 0.3;
      const rectWords = words.filter((word) => {
        if (isInside(word.bbox, rect)) return true;
        const wordArea = word.bbox.width * word.bbox.height;
        if (wordArea <= 0) return false;
        return overlaps(word.bbox, rect) / wordArea >= MIN_OVERLAP_RATIO;
      });
      if (!rectWords.length) return;
      const sorted = rectWords.sort((a, b) => a.bbox.y - b.bbox.y || a.bbox.x - b.bbox.x);
      const text = cleanWord(sorted.map((word) => word.text).join(" "));
      if (!text) return;

      // 複数語が1つのハイライト内にある場合は連語としてそのまま保持（例: get away）
      // 単語1語の場合のみ原形に変換する
      const wordTokens = text.split(" ");
      const baseWord = wordTokens.length === 1 ? lemmatize(text) : text;
      
      const context = findBestContext(text, sorted, lines, fullText);
      found.push({
        id: makeId(),
        word: baseWord,
        pos: detectPos(baseWord),
        context,
        contextJa: "",
        meaning: "",
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
    return sourceLines.map((line) => ({
      text: line.text || "",
      bbox: normalizeBbox(line.bbox || line)
    })).filter((line) => line.text.trim());
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

  // OCR行の品質チェック（記号まみれのゴミ行を除外する）
  function isCleanLine(text) {
    const t = text.trim();
    if (!t || t.length < 3) return false;
    if (!/[a-zA-Z]{2,}/.test(t)) return false;
    const garbage = (t.match(/[|\\^~`<>{}\[\]@#\$%*=]/g) || []).length;
    if (garbage / t.length > 0.12) return false;
    return true;
  }
  // 簡易スチE�E�E�E��E�E�E�ング�E�E�E�E�E�E�E�原形復允E�E�E�E��E�E�E�E
  function lemmatize(word) {
    const w = word.toLowerCase();
    
    // 不規則変化�E�E�E�E�E�E�E�代表皁E�E�E�E��E�E�E�も�E�E�E�E�E�E�E�E�E
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
      "children": "child",
      "men": "man",
      "women": "woman",
      "mice": "mouse",
      "teeth": "tooth",
      "feet": "foot",
      "people": "person",
      "leaves": "leaf" // could be verb leave, but noun is common too
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

  function detectPos(word) {
    // 複数語（句）の場合
    const tokens = word.trim().split(/\s+/);
    if (tokens.length >= 2) {
      const first = tokens[0].toLowerCase().replace(/[^a-z]/g, "");
      if (/^(get|go|come|take|give|make|put|look|turn|run|fall|break|bring|keep|set|cut|let|hold|carry|pass|pick|pull|push|call|try|work|move|play|write|speak|think|feel|hear|see|find|use|show|send|read|grow|lose|build|locate|explore|discover|develop)$/.test(first)) return "動詞句";
      return "名詞句";
    }
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

  function renderResults() {
    els.resultsList.classList.toggle("empty-state", detectedResults.length === 0);
    els.resultsList.innerHTML = "";
    els.detectedCount.textContent = `${detectedResults.length}件`;
    els.saveAllBtn.disabled = detectedResults.length === 0;

    if (!detectedResults.length) {
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
        pos: item.pos || detectPos(item.word),
        contextJa: item.contextJa || "",
        meaning: item.meaning || ""
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
      return {
        ...item,
        pos: enriched.pos || item.pos || "",
        contextJa: enriched.contextJa || item.contextJa || "",
        meaning: enriched.meaning || item.meaning || ""
      };
    });
  }

  async function saveDetectedItems() {
    const items = detectedResults
      .map((item) => ({
        ...item,
        word: item.word.trim(),
        context: item.context.trim(),
        contextJa: (item.contextJa || "").trim(),
        meaning: (item.meaning || "").trim(),
        createdAt: item.createdAt || new Date().toISOString()
      }))
      .filter((item) => item.word);

    if (!items.length) return;

    setStatus("保存中");
    try {
      const endpoint = saveEndpoint();
      if (endpoint) {
        await postToGas(endpoint, { action: "saveMany", items });
      }
      saveLocalItems(items);
      detectedResults = [];
      renderResults();
      await loadSavedItems();
      setStatus("保存完了");
    } catch (error) {
      console.error(error);
      setStatus("保存失敗");
      alert("保存に失敗しました。GASのURLと公開設定を確認してください。");
    }
  }

  function saveEndpoint() {
    if (GAS_ENDPOINT) return GAS_ENDPOINT;
    const endpoint = els.gasEndpoint.value.trim();
    if (endpoint) localStorage.setItem(ENDPOINT_KEY, endpoint);
    else localStorage.removeItem(ENDPOINT_KEY);
    return endpoint;
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
        const response = await fetch(url.toString());
        const data = await response.json();
        if (data.ok && Array.isArray(data.items)) {
          savedItems = data.items;
          saveLocalSnapshot(savedItems);
        } else {
          savedItems = getLocalItems();
        }
      } else {
        savedItems = getLocalItems();
      }
    } catch (error) {
      console.warn(error);
      savedItems = getLocalItems();
    }
    savedItems = savedItems.map((item) => ({
      ...item,
      pos: item.pos || detectPos(item.word)
    }));
    renderWordList();
    showRandomQuiz(false);
  }

  function saveLocalItems(items) {
    const merged = uniqueByWordAndContext([...items, ...getLocalItems()]);
    saveLocalSnapshot(merged);
    savedItems = merged;
  }

  function getLocalItems() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
    } catch {
      return [];
    }
  }

  function saveLocalSnapshot(items) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  }


  async function clearSavedItems() {
    if (!confirm("GASおよびローカルのすべての単語データを削除します。本当によろしいですか？")) return;
    // ローカルは先に必ず削除
    localStorage.removeItem(STORAGE_KEY);
    savedItems = [];
    renderWordList();
    showRandomQuiz(false);
    // GASが設定されていれば同期（失敗してもローカルはすでに削除済み）
    const endpoint = saveEndpoint();
    if (endpoint) {
      try {
        await getToGas(endpoint, { action: "clear" });
      } catch (error) {
        console.error(error);
        alert(`ローカルデータは削除しました。GAS側の削除に失敗しました。URLを確認してください。\n\nエラー：${error.message}`);
        return;
      }
    }
    alert("すべてのデータを消去しました。");
  }

  async function deleteSavedItem(id) {
    if (!confirm("この単語を削除しますか？")) return;
    // ローカルは先に必ず削除
    savedItems = savedItems.filter(item => item.id !== id);
    saveLocalSnapshot(savedItems);
    renderWordList();
    showRandomQuiz(false);
    // GASが設定されていれば同期（失敗してもローカルはすでに削除済み）
    const endpoint = saveEndpoint();
    if (endpoint) {
      try {
        await getToGas(endpoint, { action: "delete", id });
      } catch (error) {
        console.error(error);
        alert(`ローカルから削除しました。GAS側の削除に失敗しました。URLを確認してください。\n\nエラー：${error.message}`);
      }
    }
  }

  function renderWordList() {
    const query = els.searchInput.value.trim().toLowerCase();
    let sortedItems = [...savedItems];

    // ソート�E琁E
    sortedItems.sort((a, b) => {
      let valA = a[sortConfig.key] || "";
      let valB = b[sortConfig.key] || "";
      
      // ID�E�E�E�E�E�E�E�通し番号用�E�E�E�E�E�E�E�また�E日付�E特別な処琁E
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
      const text = `${item.word} ${item.meaning} ${item.context} ${item.contextJa}`.toLowerCase();
      return !query || text.includes(query);
    });

    els.wordList.classList.toggle("empty-state", items.length === 0);
    els.wordList.innerHTML = "";

    if (!items.length) {
      els.wordList.innerHTML = `<tr><td colspan="7" class="empty-msg">保存した単語がありません${query ? "(検索結果ゼロ)" : ""}</td></tr>`;
      return;
    }

    items.forEach((item, index) => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td class="col-id">${index + 1}</td>
        <td class="col-word">${escapeHtml(item.word)}</td>
        <td class="col-pos">${escapeHtml(item.pos || "-")}</td>
        <td class="col-meaning">${escapeHtml(item.meaning || "")}</td>
        <td class="col-context">${highlightWord(escapeHtml(item.context || ""), item.word)}</td>
        <td class="col-date">${formatDate(item.createdAt)}</td>
        <td class="col-actions"><button class="btn-delete delete-btn" type="button">削除</button></td>
      `;

        const delBtn = tr.querySelector(".delete-btn");
        if (delBtn) {
          delBtn.addEventListener("click", () => deleteSavedItem(item.id));
        }
        els.wordList.appendChild(tr);
    });
  }

  function showRandomQuiz(forceNew = true) {
    if (!savedItems.length) {
      els.quizBox.className = "quiz-box empty-state";
      els.quizBox.innerHTML = "<p>単語を保存すると、文脈から意味を思い出すクイズができます</p>";
      return;
    }

    if (forceNew || !quizItem) {
      quizItem = savedItems[Math.floor(Math.random() * savedItems.length)];
    }

    els.quizBox.className = "quiz-box";
    els.quizBox.innerHTML = `
      <div class="quiz-card">
        <p class="quiz-word">${escapeHtml(quizItem.word)}</p>
        <p class="quiz-context">${highlightWord(escapeHtml(quizItem.context || ""), quizItem.word)}</p>
        <button id="showAnswerBtn" class="button secondary" type="button">答えを表示</button>
        <div id="quizAnswer" class="quiz-answer">
          <strong>日本語の意味</strong>
          <p>${escapeHtml(quizItem.meaning || "意味なし")}</p>
          <strong>英文の日本語訳</strong>
          <p>${escapeHtml(quizItem.contextJa || "日本語訳なし")}</p>
        </div>
      </div>
    `;
    $("showAnswerBtn").addEventListener("click", () => {
      $("quizAnswer").classList.toggle("is-open");
    });
  }

  function exportCsv() {
    const rows = [
      ["word", "meaning", "context", "contextJa", "createdAt", "source"],
      ...savedItems.map((item) => [
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
    const clean = escapeRegExp(word || "");
    if (!clean || !text) return text;
    return text.replace(new RegExp(`\\b(${clean})\\b`, "gi"), '<span class="highlighted-word">$1</span>');
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
