const SHEET_NAME = 'Vocabulary';
const DEFAULT_OWNER = 'student1';
const HEADERS = ['id', 'owner', 'lesson', 'word', 'pos', 'meaning', 'context', 'contextJa', 'createdAt', 'source', 'confidence'];

function doGet(e) {
  const params = (e && e.parameter) ? e.parameter : {};
  const action = (params.action || 'list').toLowerCase();
  const owner = normalizeOwner(params.owner || DEFAULT_OWNER);

  if (action === 'list') {
    return jsonResponse({ ok: true, items: listItems(owner) });
  }

  return jsonResponse({ ok: false, error: 'Unknown action' });
}

function doPost(e) {
  try {
    const body = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    const owner = normalizeOwner(body.owner || DEFAULT_OWNER);

    if (body.action === 'saveMany') {
      const saved = saveMany(body.items || [], owner);
      return jsonResponse({ ok: true, count: saved });
    }
    if (body.action === 'enrichMany') {
      return jsonResponse({ ok: true, items: enrichMany(body.items || []) });
    }
    if (body.action === 'save') {
      const saved = saveMany([body.item], owner);
      return jsonResponse({ ok: true, count: saved });
    }
    if (body.action === 'delete') {
      const deleted = deleteItem(body.id, owner);
      return jsonResponse({ ok: true, count: deleted });
    }
    if (body.action === 'update') {
      const updated = updateItem(body.item || {}, owner);
      return jsonResponse({ ok: true, count: updated });
    }
    if (body.action === 'clear') {
      const cleared = clearItems(owner);
      return jsonResponse({ ok: true, count: cleared });
    }

    return jsonResponse({ ok: false, error: 'Unknown action' });
  } catch (error) {
    return jsonResponse({ ok: false, error: String(error) });
  }
}

function saveMany(items, fallbackOwner) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);

  try {
    const sheet = getSheet();
    const existingKeys = getExistingKeys(sheet);
    const rows = [];

    items.forEach(function(item) {
      if (!item || !item.word) return;

      const owner = normalizeOwner(item.owner || fallbackOwner || DEFAULT_OWNER);
      const word = String(item.word).trim();
      const context = String(item.context || '').trim();
      const pos = String(item.pos || '').trim() || detectPos(word);
      const meaning = String(item.meaning || '').trim() || (word ? getWordMeaning(word) : '');
      const contextJa = String(item.contextJa || '').trim() || (context ? translateText(context) : '');
      const lesson = String(item.lesson || '').trim();
      const key = makeKey(owner, lesson, word, context);
      const blankLessonKey = makeKey(owner, '', word, context);

      if (existingKeys[key]) return;
      if (lesson && existingKeys[blankLessonKey]) {
        if (typeof existingKeys[blankLessonKey] === 'number') {
          sheet.getRange(existingKeys[blankLessonKey], 3).setValue(lesson);
        }
        existingKeys[key] = existingKeys[blankLessonKey];
        return;
      }
      existingKeys[key] = true;

      rows.push([
        item.id || Utilities.getUuid(),
        owner,
        lesson,
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
  } finally {
    lock.releaseLock();
  }
}

function listItems(owner) {
  const normalizedOwner = normalizeOwner(owner || DEFAULT_OWNER);
  const sheet = getSheet();
  const lastRow = sheet.getLastRow();
  if (lastRow <= 1) return [];

  const values = sheet.getRange(2, 1, lastRow - 1, HEADERS.length).getValues();
  return values.map(function(row) {
    return rowToItem(row);
  }).filter(function(item) {
    return item.owner === normalizedOwner;
  });
}

function rowToItem(row) {
  return {
    id: row[0],
    owner: normalizeOwner(row[1] || DEFAULT_OWNER),
    lesson: row[2],
    word: row[3],
    pos: row[4],
    meaning: row[5],
    context: row[6],
    contextJa: row[7],
    createdAt: row[8],
    source: row[9],
    confidence: row[10]
  };
}

function enrichMany(items) {
  return items.map(function(item) {
    const word = String(item.word || '').trim();
    const context = String(item.context || '').trim();

    return {
      id: item.id || '',
      word: word,
      pos: word ? detectPos(word) : '',
      meaning: word ? getWordMeaning(word) : '',
      context: context,
      contextJa: context ? translateText(context) : ''
    };
  });
}

function getWordMeaning(word) {
  const raw = translateText(word) || '';
  return raw
    .split(/[。．.;；]/)[0]
    .replace(/[、，,;；]+$/, '')
    .trim();
}

function testGetWordMeaning() {
  ['connect', 'believe', 'rational', 'superstitious', 'however'].forEach(function(word) {
    const raw = translateText(word) || '';
    const result = getWordMeaning(word);
    Logger.log('"' + word + '" raw="' + raw + '" -> result="' + result + '"');
  });
}

function detectPos(word) {
  const tokens = String(word || '').trim().split(/\s+/).filter(Boolean);
  if (tokens.length >= 2) {
    const first = tokens[0].toLowerCase().replace(/[^a-z]/g, '');
    if (/^(get|go|come|take|give|make|put|look|turn|run|fall|break|bring|keep|set|cut|let|hold|carry|pass|pick|pull|push|call|try|work|move|play|write|speak|think|feel|hear|see|find|use|show|send|read|grow|lose|build|locate|explore|discover|develop)$/.test(first)) {
      return '動詞句';
    }
    return '名詞句';
  }

  const known = {
    '名詞': ['behavior', 'belief', 'chance', 'connection', 'definition', 'exam', 'example', 'fact', 'habit', 'luck', 'pattern', 'performance', 'superstition', 'world'],
    '形容詞': ['complex', 'difficult', 'irrational', 'lucky', 'professional', 'rational', 'simple', 'superstitious', 'careful', 'useful', 'different', 'important'],
    '動詞': ['admit', 'believe', 'connect', 'involve', 'look', 'make', 'study', 'think', 'use', 'help', 'find', 'get', 'know', 'show', 'take', 'try'],
    '副詞': ['actually', 'carefully', 'instead', 'also', 'even', 'just', 'only', 'really', 'very', 'well', 'however', 'therefore']
  };
  const normalized = tokens[0] ? tokens[0].toLowerCase().replace(/[^a-z]/g, '') : '';
  if (!normalized) return '';

  for (const label in known) {
    if (known[label].indexOf(normalized) !== -1) return label;
  }

  if (/ly$/.test(normalized) && normalized.length > 4) return '副詞';
  if (/(tion|sion|ment|ness|ity|ance|ence|hood|ship|ism|age|ery|ure|ture|ics|ogy|omy)$/.test(normalized)) return '名詞';
  if (/(ist|er|or|ee|eer|ian|ess)$/.test(normalized) && normalized.length > 4) return '名詞';
  if (/(ful|less|ous|ive|al|ic|ary|ory|ible|able|ish|ular|esque|ant|ent)$/.test(normalized) && normalized.length > 5) return '形容詞';
  if (/(ize|ise|ify|ate|ened|ening)$/.test(normalized) && normalized.length > 4) return '動詞';

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
      if (oldIndex !== -1) return row[oldIndex];
      if (header === 'owner') return DEFAULT_OWNER;
      return '';
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

  const values = sheet.getRange(2, 1, lastRow - 1, HEADERS.length).getValues();
  values.forEach(function(row, index) {
    const item = rowToItem(row);
    keys[makeKey(item.owner, item.lesson, item.word, item.context)] = index + 2;
  });

  return keys;
}

function makeKey(owner, lesson, word, context) {
  return normalizeOwner(owner || DEFAULT_OWNER) + '|' + String(lesson || '').trim().toLowerCase() + '|' + String(word || '').trim().toLowerCase() + '|' + String(context || '').trim().toLowerCase();
}

function normalizeOwner(owner) {
  return String(owner || DEFAULT_OWNER).trim() || DEFAULT_OWNER;
}

function jsonResponse(payload) {
  return ContentService
    .createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}

function updateItem(item, owner) {
  if (!item || !item.id) return 0;

  const normalizedOwner = normalizeOwner(owner || item.owner || DEFAULT_OWNER);
  const sheet = getSheet();
  const lastRow = sheet.getLastRow();
  if (lastRow <= 1) return 0;

  const rows = sheet.getRange(2, 1, lastRow - 1, HEADERS.length).getValues();
  for (let i = 0; i < rows.length; i++) {
    const existing = rowToItem(rows[i]);
    if (String(existing.id) === String(item.id) && existing.owner === normalizedOwner) {
      const word = String(item.word || '').trim();
      const context = String(item.context || '').trim();
      const row = [
        item.id,
        normalizedOwner,
        String(item.lesson || '').trim(),
        word,
        String(item.pos || '').trim() || detectPos(word),
        String(item.meaning || '').trim(),
        context,
        String(item.contextJa || '').trim(),
        item.createdAt || existing.createdAt || new Date().toISOString(),
        item.source || existing.source || 'OCR',
        item.confidence || existing.confidence || ''
      ];
      sheet.getRange(i + 2, 1, 1, HEADERS.length).setValues([row]);
      return 1;
    }
  }

  return 0;
}

function deleteItem(id, owner) {
  if (!id) return 0;

  const normalizedOwner = normalizeOwner(owner || DEFAULT_OWNER);
  const sheet = getSheet();
  const lastRow = sheet.getLastRow();
  if (lastRow <= 1) return 0;

  const rows = sheet.getRange(2, 1, lastRow - 1, HEADERS.length).getValues();
  for (let i = 0; i < rows.length; i++) {
    const item = rowToItem(rows[i]);
    if (String(item.id) === String(id) && item.owner === normalizedOwner) {
      sheet.deleteRow(i + 2);
      return 1;
    }
  }

  return 0;
}

function clearItems(owner) {
  const normalizedOwner = normalizeOwner(owner || DEFAULT_OWNER);
  const sheet = getSheet();
  const lastRow = sheet.getLastRow();
  if (lastRow <= 1) return 0;

  const rows = sheet.getRange(2, 1, lastRow - 1, HEADERS.length).getValues();
  let cleared = 0;
  for (let i = rows.length - 1; i >= 0; i--) {
    const item = rowToItem(rows[i]);
    if (item.owner === normalizedOwner) {
      sheet.deleteRow(i + 2);
      cleared += 1;
    }
  }

  return cleared;
}
