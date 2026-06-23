const SHEET_NAME = 'Vocabulary';
const HEADERS = ['id', 'word', 'pos', 'meaning', 'context', 'contextJa', 'createdAt', 'source', 'confidence'];

function doGet(e) {
  const params = (e && e.parameter) ? e.parameter : {};
  const action = (params.action || 'list').toLowerCase();
  if (action === 'list') {
    return jsonResponse({ ok: true, items: listItems() });
  }
  if (action === 'delete') {
    const deleted = deleteItem(params.id || '');
    return jsonResponse({ ok: true, count: deleted });
  }
  if (action === 'clear') {
    const cleared = clearItems();
    return jsonResponse({ ok: true, count: cleared });
  }
  return jsonResponse({ ok: false, error: 'Unknown action' });
}

function doPost(e) {
  try {
    const body = JSON.parse(e.postData.contents || '{}');
    if (body.action === 'saveMany') {
      const saved = saveMany(body.items || []);
      return jsonResponse({ ok: true, count: saved });
    }
    if (body.action === 'enrichMany') {
      return jsonResponse({ ok: true, items: enrichMany(body.items || []) });
    }
    if (body.action === 'save') {
      const saved = saveMany([body.item]);
      return jsonResponse({ ok: true, count: saved });
    }
    if (body.action === 'delete') {
      const deleted = deleteItem(body.id);
      return jsonResponse({ ok: true, count: deleted });
    }
    if (body.action === 'clear') {
      const cleared = clearItems();
      return jsonResponse({ ok: true, count: cleared });
    }
    return jsonResponse({ ok: false, error: 'Unknown action' });
  } catch (error) {
    return jsonResponse({ ok: false, error: String(error) });
  }
}

function saveMany(items) {
  const sheet = getSheet();
  const existingKeys = getExistingKeys(sheet);
  const rows = [];

  items.forEach(function(item) {
    if (!item || !item.word) return;
    const word = String(item.word).trim();
    const context = String(item.context || '').trim();
    const pos = String(item.pos || '').trim();
    const meaning = String(item.meaning || '').trim() || (word ? translateText(word) : '');
    const contextJa = String(item.contextJa || '').trim() || (context ? translateText(context) : '');
    const key = makeKey(word, context);
    if (existingKeys[key]) return;
    existingKeys[key] = true;
    rows.push([
      item.id || Utilities.getUuid(),
      word,
      pos,
      meaning,
      context,
      contextJa,
      item.createdAt || new Date().toISOString(),
      item.source || 'OCR',
      item.confidence || ''
    ]);
  });

  if (rows.length) {
    sheet.getRange(sheet.getLastRow() + 1, 1, rows.length, HEADERS.length).setValues(rows);
  }
  return rows.length;
}

function listItems() {
  const sheet = getSheet();
  const lastRow = sheet.getLastRow();
  if (lastRow <= 1) return [];
  const values = sheet.getRange(2, 1, lastRow - 1, HEADERS.length).getValues();
  return values.map(function(row) {
    return {
      id: row[0],
      word: row[1],
      pos: row[2],
      meaning: row[3],
      context: row[4],
      contextJa: row[5],
      createdAt: row[6],
      source: row[7],
      confidence: row[8]
    };
  });
}

function enrichMany(items) {
  return items.map(function(item) {
    const word = String(item.word || '').trim();
    const context = String(item.context || '').trim();
    return {
      id: item.id || '',
      word: word,
      pos: word ? detectPos(word) : '',
      meaning: word ? getWordMeaning(word, context) : '',
      context: context,
      contextJa: context ? translateText(context) : ''
    };
  });
}

// 文脈を使って単語の正確な日本語訳を返す
function getWordMeaning(word, context) {
  if (context) {
    // "word (context sentence)" 形式で翻訳するとGoogleが単語部分を正確に訳す
    const clue = context.slice(0, 120);
    const translated = translateText(word + ' (' + clue + ')');
    if (translated) {
      // 「合理的な（文章訳）」の形で返るので括弧前の単語部分だけ取り出す
      const cut = Math.min(
        translated.indexOf('（') >= 0 ? translated.indexOf('（') : Infinity,
        translated.indexOf('(')  >= 0 ? translated.indexOf('(')  : Infinity
      );
      if (cut > 0 && cut < Infinity) return translated.slice(0, cut).trim();
      return translated;
    }
  }
  return translateText(word) || '';
}

function detectPos(word) {
  const w = word.toLowerCase().replace(/[^a-z]/g, '');
  if (!w) return '';
  if (/ly$/.test(w) && w.length > 4) return '副詞';
  if (/(tion|sion|ment|ness|ity|ance|ence|hood|ship|ism|age)$/.test(w)) return '名詞';
  if (/(ist|er|or|ee|eer|ian|ant|ent|ess)$/.test(w)) return '名詞';
  if (/(ful|less|ous|ive|al|ic|ary|ory|ible|able|ish|ular)$/.test(w)) return '形容詞';
  if (/(ize|ise|ify|ate|ened|ening)$/.test(w)) return '動詞';
  return '';
}

function translateText(text) {
  try {
    return LanguageApp.translate(String(text || ''), 'en', 'ja');
  } catch (error) {
    return '';
  }
}

function getSheet() {
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = spreadsheet.getSheetByName(SHEET_NAME);
  if (!sheet) {
    sheet = spreadsheet.insertSheet(SHEET_NAME);
  }
  if (sheet.getLastRow() === 0) {
    sheet.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]);
    sheet.setFrozenRows(1);
  } else {
    migrateHeaders(sheet);
  }
  return sheet;
}

function migrateHeaders(sheet) {
  const lastColumn = Math.max(sheet.getLastColumn(), HEADERS.length);
  const current = sheet.getRange(1, 1, 1, lastColumn).getValues()[0].filter(String);
  const alreadyCurrent = HEADERS.every(function(header, index) {
    return current[index] === header;
  });
  if (alreadyCurrent) return;

  const lastRow = sheet.getLastRow();
  const values = lastRow > 1 ? sheet.getRange(2, 1, lastRow - 1, lastColumn).getValues() : [];
  const migrated = values.map(function(row) {
    return HEADERS.map(function(header) {
      const oldIndex = current.indexOf(header);
      return oldIndex === -1 ? '' : row[oldIndex];
    });
  });

  sheet.clearContents();
  sheet.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]);
  sheet.setFrozenRows(1);
  if (migrated.length) {
    sheet.getRange(2, 1, migrated.length, HEADERS.length).setValues(migrated);
  }
}

function getExistingKeys(sheet) {
  const keys = {};
  const lastRow = sheet.getLastRow();
  if (lastRow <= 1) return keys;
  const values = sheet.getRange(2, 2, lastRow - 1, 3).getValues();
  values.forEach(function(row) {
    keys[makeKey(row[0], row[2])] = true;
  });
  return keys;
}

function makeKey(word, context) {
  return String(word || '').trim().toLowerCase() + '|' + String(context || '').trim().toLowerCase();
}

function jsonResponse(payload) {
  return ContentService
    .createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}

function deleteItem(id) {
  if (!id) return 0;
  const sheet = getSheet();
  const lastRow = sheet.getLastRow();
  if (lastRow <= 1) return 0;
  const ids = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
  for (let i = 0; i < ids.length; i++) {
    if (String(ids[i][0]) === String(id)) {
      sheet.deleteRow(i + 2);
      return 1;
    }
  }
  return 0;
}

function clearItems() {
  const sheet = getSheet();
  const lastRow = sheet.getLastRow();
  if (lastRow <= 1) return 0;
  sheet.deleteRows(2, lastRow - 1);
  return lastRow - 1;
}
