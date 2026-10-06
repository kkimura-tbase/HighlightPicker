(function (root) {
  "use strict";

  function box(value) {
    const x = Number(value.x0 ?? value.x ?? 0);
    const y = Number(value.y0 ?? value.y ?? 0);
    return { x, y, width: Number(value.x1 ?? x + value.width) - x,
      height: Number(value.y1 ?? y + value.height) - y };
  }

  // Keep OCR paragraph identity instead of joining lines by screen height.
  function lines(data) {
    const result = [];
    (data.blocks || []).forEach((block, b) => {
      (block.paragraphs || []).forEach((paragraph, p) => {
        (paragraph.lines || []).forEach(line => result.push({ ...line, group: `${b}:${p}` }));
      });
    });
    return (result.length ? result : data.lines || []).map(line => ({
      ...line, bbox: box(line.bbox), text: String(line.text || "").trim()
    }));
  }

  function words(data) {
    return data.words || lines(data).flatMap(line => line.words || []);
  }

  function intersection(a, b) {
    return Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x)) *
      Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y));
  }

  function orderHighlights(rects, readingLines) {
    // Tesseract's block/paragraph traversal already follows reading order.
    // Sorting all highlights by page Y would interleave separate columns.
    return rects.map((rect, originalIndex) => {
      let lineIndex = Infinity, bestOverlap = 0;
      readingLines.forEach((line, index) => {
        const overlap = intersection(rect, line.bbox);
        if (overlap > bestOverlap) {
          bestOverlap = overlap;
          lineIndex = index;
        }
      });
      return { rect, lineIndex, originalIndex };
    }).sort((a, b) => {
      if (a.lineIndex !== b.lineIndex) return a.lineIndex - b.lineIndex;
      if (Number.isFinite(a.lineIndex)) return a.rect.x - b.rect.x || a.originalIndex - b.originalIndex;
      return a.rect.y - b.rect.y || a.rect.x - b.rect.x || a.originalIndex - b.originalIndex;
    }).map(item => item.rect);
  }

  function context(targetWords, allLines) {
    if (!targetWords.length) return "";
    const target = targetWords[0];
    const anchor = allLines.reduce((best, line) => {
      const score = intersection(target.bbox, line.bbox);
      return score > best.score ? { line, score } : best;
    }, { line: null, score: 0 }).line;
    if (!anchor) return "";
    let paragraph;
    if (anchor.group !== undefined) {
      paragraph = allLines.filter(line => line.group === anchor.group);
    } else {
      // Older OCR outputs: require alignment and continuous line spacing.
      const aligned = allLines.filter(line => Math.abs(line.bbox.x - anchor.bbox.x) <= anchor.bbox.height * 1.5)
        .sort((a, b) => a.bbox.y - b.bbox.y);
      const index = aligned.indexOf(anchor);
      let start = index, end = index;
      const connected = (a, b) => b.bbox.y - a.bbox.y - a.bbox.height < Math.max(a.bbox.height, b.bbox.height) * 0.9;
      while (start > 0 && connected(aligned[start - 1], aligned[start])) start--;
      while (end + 1 < aligned.length && connected(aligned[end], aligned[end + 1])) end++;
      paragraph = aligned.slice(start, end + 1);
    }
    paragraph.sort((a, b) => a.bbox.y - b.bbox.y || a.bbox.x - b.bbox.x);
    let text = "", anchorStart = 0;
    for (const line of paragraph) {
      if (text) text += " ";
      if (line === anchor) {
        // Locate the actual occurrence, even if the word appears twice.
        const lineWords = line.words || [];
        const targetIndex = lineWords.findIndex(word => intersection(box(word.bbox), target.bbox) > 0);
        const prefix = targetIndex < 0 ? "" : lineWords.slice(0, targetIndex).map(word => word.text).join(" ");
        const offset = line.text.indexOf(target.text, prefix.length);
        anchorStart = text.length + Math.max(0, offset);
      }
      text += line.text;
    }
    for (const match of text.matchAll(/[^.!?]+[.!?]?[”’"']*/g)) {
      if (match.index <= anchorStart && match.index + match[0].length > anchorStart) {
        return match[0].trim().replace(/^[□☐]?\s*[a-z]\.\s*/i, "");
      }
    }
    return anchor.text;
  }

  // Yellow and pale panel backgrounds become white; dark glyphs stay dark.
  function removeHighlight(pixels) {
    for (let i = 0; i < pixels.length; i += 4) {
      const brightness = Math.max(pixels[i], pixels[i + 1], pixels[i + 2]);
      const value = Math.min(255, Math.max(0, (brightness - 100) * 255 / 120));
      pixels[i] = pixels[i + 1] = pixels[i + 2] = value;
    }
    return pixels;
  }

  const api = { lines, words, context, orderHighlights, removeHighlight };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.OcrLayout = api;
})(globalThis);
