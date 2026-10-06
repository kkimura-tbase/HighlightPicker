const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');
const OcrLayout = require('../ocr-layout.js');


const element = { getContext: () => ({}) };
const sandbox = {
  document: { getElementById: () => element, querySelectorAll: () => [] },
  window: { crypto: require('node:crypto') }, OcrLayout
};
const source = fs.readFileSync(path.join(__dirname, '../app.js'), 'utf8')
  .replace('  init();', '')
  .replace(/\}\)\(\);\s*$/, 'globalThis.api = {buildResults, lemmatize};})();');
vm.runInNewContext(source, sandbox);

test('seven highlights keep their sentences across two columns', () => {
  const entries = [
    ['attention', '名詞', 'Pay attention.', 0, 0],
    ['strange', '形容詞', 'A strange bird arrived.', 300, 0],
    ['imagine', '動詞', 'Please imagine a castle.', 300, 50],
    ['suddenly', '副詞', 'Rain suddenly stopped.', 0, 50],
    ['realized', '動詞', 'We realized our mistake.', 0, 100],
    ['wrong', '形容詞', 'That is wrong.', 0, 150],
    ['interesting', '形容詞', 'An interesting puzzle awaits.', 300, 100]
  ];
  const highlights = [];
  const blocks = entries.map(([word, pos, text, x, y]) => {
    const bbox = {x0:x, y0:y, x1:x+180, y1:y+20};
    highlights.push({x,y,width:180,height:20});
    return {paragraphs:[{lines:[{text,bbox,words:[{text:word,bbox,confidence:96}]}]}]};
  });
  // OCR block order follows the left column before the right column.
  const order = [0, 3, 4, 5, 1, 2, 6];
  const actual = sandbox.api.buildResults({blocks: order.map(i => blocks[i])}, highlights, []);
  assert.deepEqual(Array.from(actual, item => [item.word, item.pos, item.context]),
    order.map(i => entries[i]).map(([word,pos,text]) => [word === 'realized' ? 'realize' : word,pos,text]));
  assert.ok(actual.every(item => item.meaning && item.confidence >= 90));
});

test('confirmed forms convert; uncertain endings and adjectives stay intact', () => {
  for (const [input, expected] of Object.entries({
    interesting: 'interesting', amazing: 'amazing', news: 'news',
    realized: 'realize', played: 'play', stopped: 'stop', went: 'go',
    studies: 'study', building: 'building', suddenly: 'suddenly'
  })) assert.equal(sandbox.api.lemmatize(input), expected);
});

test('legacy flat OCR lines respect columns and paragraph spacing', () => {
  const target = { text: 'strange', bbox: { x: 310, y: 50, width: 40, height: 15 } };
  const lines = [
    {text: 'Heading', bbox: {x:300,y:0,width:100,height:15}},
    {text: 'Left column has attention.', bbox: {x:0,y:50,width:200,height:15}},
    {text: 'A strange bird arrived', bbox:{x:300,y:50,width:240,height:15}},
    {text: 'Left continuation.', bbox:{x:0,y:75,width:200,height:15}},
    {text: 'at noon!', bbox:{x:300,y:75,width:240,height:15}}
  ];
  assert.equal(OcrLayout.context([target], lines), 'A strange bird arrived at noon!');
});

test('the highlighted occurrence wins when the same word appears twice', () => {
  const bbox = {x0:0,y0:0,x1:230,y1:20};
  const words = [
    {text:'Imagine.',bbox:{x0:0,y0:0,x1:70,y1:20}},
    {text:'Please',bbox:{x0:80,y0:0,x1:140,y1:20}},
    {text:'imagine.',bbox:{x0:150,y0:0,x1:230,y1:20}}
  ];
  const lines = OcrLayout.lines({lines:[{text:'Imagine. Please imagine.', bbox, words}]});
  assert.equal(OcrLayout.context([{text:'imagine.',bbox:{x:150,y:0,width:80,height:20}}], lines), 'Please imagine.');
});

test('yellow background becomes white while dark text remains legible', () => {
  const pixels = new Uint8ClampedArray([255,255,150,255,100,105,40,255,0,0,0,255]);
  OcrLayout.removeHighlight(pixels);
  assert.deepEqual(Array.from(pixels), [255,255,255,255,11,11,11,255,0,0,0,255]);
});

test('no spatially matching line returns no unrelated page text', () => {
  assert.equal(OcrLayout.context([{text:'word',bbox:{x:0,y:0,width:10,height:10}}], [
    {text:'Unrelated.',bbox:{x:300,y:0,width:100,height:10}}
  ]), '');
});


test('same-line highlights sort left to right despite unequal marker heights', () => {
  const left = {x:10,y:55,width:50,height:20};
  const right = {x:80,y:50,width:50,height:25};
  const input = [right, left];
  assert.deepEqual(OcrLayout.orderHighlights(input,
    [{bbox:{x:0,y:55,width:200,height:20}}]), [left, right]);
  assert.deepEqual(input, [right, left]);
});

test('single-column lines retain top-to-bottom reading order', () => {
  const top = {x:100,y:0,width:30,height:20};
  const bottom = {x:10,y:40,width:30,height:20};
  assert.deepEqual(OcrLayout.orderHighlights([bottom, top], [
    {bbox:{x:0,y:0,width:200,height:20}},
    {bbox:{x:0,y:40,width:200,height:20}}
  ]), [top, bottom]);
});

test('unmatched highlights remain available in stable spatial order', () => {
  const a = {x:0,y:0,width:20,height:20};
  const b = {x:0,y:40,width:20,height:20};
  assert.deepEqual(OcrLayout.orderHighlights([b,a], []), [a,b]);
});
