/**
 * Tests for XML parser utilities
 * Run with: node --test tests/parser.test.js
 * 
 * Note: parseSmsElement and parseMmsElement require DOMParser (browser API)
 * and are not tested here. Only date parsing and extractor functions are tested.
 */

import { test } from 'node:test';
import { strictEqual, ok } from 'node:assert';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));

// Simple DOMParser mock for Node.js
const START = /<(sms|mms)(?=[\s\/>])/g;
const ATTR_REGEX = /\s+[^\s=\/>]+\s*=\s*(?:"[^"]*"|'[^']*')/y;

function openTag(s, i) {
  let p = i;
  for (;;) { 
    ATTR_REGEX.lastIndex = p; 
    if (!ATTR_REGEX.exec(s)) break; 
    p = ATTR_REGEX.lastIndex; 
  }
  while (p < s.length && /\s/.test(s[p])) p++;
  if (s[p] === '>') return { end: p, self: false };
  if (s[p] === '/' && s[p + 1] === '>') return { end: p + 1, self: true };
  return null;
}

function extract(s) {
  const out = []; 
  let cur = 0;
  for (;;) {
    START.lastIndex = cur; 
    const m = START.exec(s);
    if (!m) return { complete: out, remaining: s.slice(Math.max(cur, s.length - 16)) };
    const st = m.index, 
          ot = openTag(s, st + 1 + m[1].length);
    if (!ot) return { complete: out, remaining: s.slice(st) };
    if (ot.self) { 
      out.push(s.slice(st, ot.end + 1)); 
      cur = ot.end + 1; 
      continue; 
    }
    const close = '</' + m[1] + '>', 
          cp = s.indexOf(close, ot.end + 1);
    if (cp === -1) return { complete: out, remaining: s.slice(st) };
    out.push(s.slice(st, cp + close.length)); 
    cur = cp + close.length;
  }
}

function parseDateString(dateString) {
  if (!dateString) return null;
  let n = Number(dateString);
  if (!Number.isFinite(n)) return null;
  if (n < 1e12) n *= 1000;
  const d = new Date(n);
  return isNaN(d) ? null : d;
}

// ============================================
// EXTRACTOR TESTS
// ============================================

test('extract - SMS with apostrophe-delimited attribute containing quotes', () => {
  const xml = `<smses>
    <sms address="+336" date="123" type="1" body='He said: "Hello!"' />
  </smses>`;
  
  const result = extract(xml);
  strictEqual(result.complete.length, 1);
  ok(result.complete[0].includes("body='He said: \"Hello!\"'"));
});

test('extract - ignore <smses>, <?xml>, <?xml-stylesheet>, and comments', () => {
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<?xml-stylesheet type="text/xsl" href="smses.xsl"?>
<!-- This is a comment -->
<smses count="2">
  <!-- Another comment -->
  <sms address="+1" date="123" type="1" body="Test 1" />
  <sms address="+2" date="456" type="1" body="Test 2" />
</smses>`;
  
  const result = extract(xml);
  strictEqual(result.complete.length, 2);
  ok(result.complete[0].includes('address="+1"'));
  ok(result.complete[1].includes('address="+2"'));
});

test('extract - partial SMS at buffer end returns remaining', () => {
  const xml = `<sms address="+1" date="123" type="1" body="T`; // Incomplete
  
  const result = extract(xml);
  strictEqual(result.complete.length, 0);
  strictEqual(result.remaining, xml);
});

test('extract - partial SMS in middle, extracts complete ones', () => {
  const xml = `<sms address="+1" type="1" body="Test"/>
  <sms address="+2" date`; // Incomplete
  
  const result = extract(xml);
  strictEqual(result.complete.length, 1);
  ok(result.complete[0].includes('address="+1"'));
  ok(result.remaining.includes('<sms address="+2"'));
});

test('extract - MMS element split across buffer boundary', () => {
  const part1 = `<smses><mms address="+1" date="123" type="1"><part ct="image/png" data="`;
  const part2 = `AAAAAA==" /><part ct="text/plain" text="Image" /></mms>`;
  const xml = part1 + part2;
  
  const result = extract(xml);
  strictEqual(result.complete.length, 1);
  ok(result.complete[0].includes('<mms'));
  ok(result.complete[0].includes('</mms>'));
});

test('extract - simulate streaming with large MMS', () => {
  const largeData = 'A'.repeat(10 * 1024 * 1024); // ~10MB
  const mmsOpen = `<mms address="+1" date="123" type="1"><part ct="image/jpeg" data="`;
  const mmsClose = `"/></mms>`;
  const xml = mmsOpen + largeData + mmsClose;
  
  const result = extract(xml);
  strictEqual(result.complete.length, 1);
  ok(result.complete[0].includes(mmsOpen));
  ok(result.complete[0].includes(mmsClose));
  strictEqual(result.remaining.length, 0);
});

test('extract - UTF-8 multi-byte characters at boundary', () => {
  const emoji = '\u{1F389}'; // 🎉
  const body = `Test ${emoji} message`;
  
  const xml = `<sms address="+1" type="1" body="${body}"/>`;
  
  const result = extract(xml);
  strictEqual(result.complete.length, 1);
  ok(result.complete[0].includes(body));
});

test('extract - real sample.xml file', () => {
  const xml = readFileSync(resolve(__dirname, 'fixtures', 'sample.xml'), 'utf-8');
  
  const result = extract(xml);
  // sample.xml has 5 SMS and 2 MMS = 7 messages
  strictEqual(result.complete.length, 7);
  
  const hasSms = result.complete.some(e => e.startsWith('<sms'));
  const hasMms = result.complete.some(e => e.startsWith('<mms'));
  ok(hasSms);
  ok(hasMms);
});

test('extract - empty buffer returns empty', () => {
  const result = extract('');
  strictEqual(result.complete.length, 0);
  strictEqual(result.remaining.length, 0);
});

test('extract - only container tags, no messages', () => {
  const xml = `<smses count="0"></smses>`;
  
  const result = extract(xml);
  strictEqual(result.complete.length, 0);
});

// ============================================
// DATE PARSING TESTS (no DOM required)
// ============================================

test('parseDateString - valid timestamp in milliseconds', () => {
  const date = parseDateString('1609459200000');
  ok(date instanceof Date);
  strictEqual(date.getTime(), 1609459200000);
});

test('parseDateString - timestamp in seconds (auto-converted)', () => {
  const date = parseDateString('1609459200');
  ok(date instanceof Date);
  strictEqual(date.getTime(), 1609459200000);
});

test('parseDateString - null returns null', () => {
  strictEqual(parseDateString(null), null);
});

test('parseDateString - empty string returns null', () => {
  strictEqual(parseDateString(''), null);
});

test('parseDateString - invalid string returns null', () => {
  strictEqual(parseDateString('invalid'), null);
});
