(function (root) {
  "use strict";
  const STORAGE_KEY = "context-vocab-corrections-v1";
  const normalize = (value) => String(value || "").trim().replace(/\s+/g, " ");
  function key(owner, lesson, item) {
    return JSON.stringify([owner, lesson, normalize(item.word).toLowerCase(), normalize(item.context)]);
  }
  function read(storage) {
    const entries = JSON.parse(storage.getItem(STORAGE_KEY) || "[]");
    if (!Array.isArray(entries)) throw new Error("Invalid correction storage");
    return new Map(entries);
  }
  function get(storage, owner, lesson, item) {
    return read(storage).get(key(owner, lesson, item));
  }
  function remember(storage, owner, lesson, item) {
    if (!owner || !normalize(item.word) || !normalize(item.context)) throw new Error("利用者・単語・英文を入力してください。");
    const entries = read(storage);
    entries.set(key(owner, lesson, item), {
      pos: normalize(item.pos), meaning: normalize(item.meaning), contextJa: normalize(item.contextJa)
    });
    storage.setItem(STORAGE_KEY, JSON.stringify([...entries]));
  }
  function forget(storage, owner, lesson, item) {
    const entries = read(storage);
    entries.delete(key(owner, lesson, item));
    storage.setItem(STORAGE_KEY, JSON.stringify([...entries]));
  }
  // Only bridge short horizontal breaks; never grow beyond the inclusion mask.
  function bridgeGaps(mask, allowed, width, height, maxGap = 2) {
    for (let y = 0; y < height; y++) {
      let previous = -1;
      for (let x = 0; x < width; x++) {
        const i = y * width + x;
        if (!allowed[i]) { previous = -1; continue; }
        if (!mask[i]) continue;
        if (previous >= 0 && x - previous - 1 <= maxGap) {
          for (let fill = previous + 1; fill < x; fill++) mask[y * width + fill] = 1;
        }
        previous = x;
      }
    }
    return mask;
  }
  const api = { get, remember, forget, bridgeGaps };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.LocalAccuracy = api;
})(globalThis);
