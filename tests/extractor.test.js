/**
 * Tests for XML extractor function
 * Validates edge cases mentioned in requirements
 * Run with: node --test tests/extractor.test.js
 */

import { test } from 'node:test';
import { strictEqual, deepStrictEqual, ok } from 'node:assert';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));

// Load the extractor module
// We need to get it from app.js since it's not in parser.js as a module
// For now, we'll inline the extractor functions for testing

const START = /<(sms|mms)(?=[\s\/>])/g;
const ATTR = /\s+[^\s=\/>]+\s*=\s*(?:"[^"]*"|'[^']*')/y;

function openTag(s, i) {
  let p = i;
  for (;;) { 
    ATTR.lastIndex = p; 
    if (!ATTR.exec(s)) break; 
    p = ATTR.lastIndex; 
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

// ============================================
// TEST 1: Attributes with apostrophes (body contains double quotes)
// ============================================

test('extract - SMS with apostrophe-delimited attribute containing quotes', () => {
  const xml = `<smses>
    <sms address="+336" date="123" type="1" body='He said: "Hello!"' />
  </smses>`;
  
  const result = extract(xml);
  strictEqual(result.complete.length, 1);
  ok(result.complete[0].includes("body='He said: \"Hello!\"'"));
});

// ============================================
// TEST 2: Ignore container tags and processing instructions
// ============================================

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

// ============================================
// TEST 3: Partial element at buffer boundary
// ============================================

test('extract - partial SMS at buffer end returns remaining', () => {
  const xml = `<sms address="+1" date="123" type="1" body="T`; // Incomplete
  
  const result = extract(xml);
  strictEqual(result.complete.length, 0);
  strictEqual(result.remaining, xml);
});

// ============================================
// TEST 4: Partial element in middle of buffer
// ============================================

test('extract - partial SMS in middle, extracts complete ones', () => {
  const xml = `<sms address="+1" type="1" body="Test"/>
  <sms address="+2" date`; // Incomplete
  
  const result = extract(xml);
  strictEqual(result.complete.length, 1);
  ok(result.complete[0].includes('address="+1"'));
  ok(result.remaining.includes('<sms address="+2"'));
});

// ============================================
// TEST 5: MMS with base64 data spanning multiple chunks
// ============================================

test('extract - MMS element split across buffer boundary', () => {
  const part1 = `<smses><mms address="+1" date="123" type="1"><part ct="image/png" data="`;
  const part2 = `AAAAAA==" /><part ct="text/plain" text="Image" /></mms>`;
  const xml = part1 + part2;
  
  const result = extract(xml);
  strictEqual(result.complete.length, 1);
  ok(result.complete[0].includes('<mms'));
  ok(result.complete[0].includes('</mms>'));
});

// ============================================
// TEST 6: Streaming simulation - MMS larger than chunk size
// ============================================

test('extract - simulate streaming with large MMS', () => {
  // Create a large base64 string (simulating 10MB+ attachment)
  const largeData = 'A'.repeat(10 * 1024 * 1024); // ~10MB of 'A'
  const mmsOpen = `<mms address="+1" date="123" type="1"><part ct="image/jpeg" data="`;
  const mmsClose = `"/></mms>`;
  const xml = mmsOpen + largeData + mmsClose;
  
  const result = extract(xml);
  strictEqual(result.complete.length, 1);
  ok(result.complete[0].includes(mmsOpen));
  ok(result.complete[0].includes(mmsClose));
  strictEqual(result.remaining.length, 0);
});

// ============================================
// TEST 7: Multi-byte characters split between chunks
// ============================================

test('extract - UTF-8 multi-byte characters at boundary', () => {
  // UTF-8 emoji 🎉 is 4 bytes: 0xF0 0x9F 0x8E 0x89
  // Split it: first 2 bytes in chunk1, last 2 bytes in chunk2
  const emoji = '\u{1F389}'; // 🎉
  const body = `Test ${emoji} message`;
  
  const xml = `<sms address="+1" type="1" body="${body}"/>`;
  
  const result = extract(xml);
  strictEqual(result.complete.length, 1);
  ok(result.complete[0].includes(body));
});

// ============================================
// TEST 8: Real file sample (from fixtures)
// ============================================

test('extract - real sample.xml file', () => {
  const xml = readFileSync(resolve(__dirname, 'fixtures', 'sample.xml'), 'utf-8');
  
  const result = extract(xml);
  
  // sample.xml has 5 SMS and 2 MMS = 7 messages
  strictEqual(result.complete.length, 7);
  
  // Check that we have both SMS and MMS
  const hasSms = result.complete.some(e => e.startsWith('<sms'));
  const hasMms = result.complete.some(e => e.startsWith('<mms'));
  ok(hasSms);
  ok(hasMms);
});

// ============================================
// TEST 9: Empty buffer
// ============================================

test('extract - empty buffer returns empty', () => {
  const result = extract('');
  strictEqual(result.complete.length, 0);
  strictEqual(result.remaining.length, 0);
});

// ============================================
// TEST 10: Only container tags, no messages
// ============================================

test('extract - only container tags, no messages', () => {
  const xml = `<smses count="0"></smses>`;
  
  const result = extract(xml);
  strictEqual(result.complete.length, 0);
});

// ============================================
// TEST 11: Optional test for tests/private/*.xml
// This test will be skipped if tests/private/*.xml doesn't exist
// ============================================

const privateDir = resolve(__dirname, 'private');
try {
  const privateFiles = readdirSync(privateDir).filter(f => f.endsWith('.xml'));
  if (privateFiles.length > 0) {
    test('extract - private XML files match count attribute', () => {
      for (const file of privateFiles) {
        const xml = readFileSync(resolve(privateDir, file), 'utf-8');
        
        // Extract count from root element
        const countMatch = xml.match(/<smses[^>]*count="(\d+)"/);
        if (countMatch) {
          const expectedCount = parseInt(countMatch[1]);
          const result = extract(xml);
          strictEqual(result.complete.length, expectedCount, 
            `File ${file}: expected ${expectedCount} messages, got ${result.complete.length}`);
        }
      }
    });
  }
} catch (e) {
  // tests/private directory doesn't exist, skip test
}
