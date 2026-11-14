/**
 * Tests for XML parser
 * Run with: node --test tests/parser.test.js
 */

import { strictEqual, ok, deepStrictEqual } from 'node:assert';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));

// Simple DOMParser mock for Node.js
const DOMParser = class {
  parseFromString(xmlString, contentType) {
    // Simple mock that creates a basic document structure
    const match = xmlString.match(/<(\w+)([^>]*)\/?>/);
    if (!match) {
      return {
        documentElement: null,
        querySelector: () => null,
        getElementsByTagName: () => []
      };
    }
    const tagName = match[1];
    const attrsString = match[2];
    
    // Parse attributes
    const attrs = {};
    const attrRegex = /(\w+)="([^"]*)"/g;
    let attrMatch;
    while ((attrMatch = attrRegex.exec(attrsString)) !== null) {
      attrs[attrMatch[1]] = attrMatch[2];
    }
    
    // Create a mock element
    const element = {
      tagName,
      getAttribute: (name) => attrs[name] || null,
      querySelector: (selector) => {
        if (selector === 'parsererror') return null;
        return null;
      },
      getElementsByTagName: (tag) => {
        const results = [];
        const regex = new RegExp(`<${tag}([^>]*)>([\s\S]*?)<\/${tag}>`, 'g');
        let match;
        const content = xmlString;
        while ((match = regex.exec(content)) !== null) {
          results.push({
            getAttribute: (name) => {
              const itemMatch = match[1].match(new RegExp(`${name}="([^"]*)"`));
              return itemMatch ? itemMatch[1] : null;
            }
          });
        }
        return results;
      }
    };
    
    return { documentElement: element, querySelector: () => null };
  }
};

// Inline parser functions for testing
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

function parseSmsElement(elementString) {
  try {
    const doc = new DOMParser().parseFromString(elementString, 'application/xml');
    const parserError = doc.querySelector('parsererror');
    if (parserError) return null;

    const el = doc.documentElement;
    if (el.tagName.toLowerCase() !== 'sms') return null;

    const type = el.getAttribute('type');
    const address = (el.getAttribute('address') || 'Inconnu').trim().replace(/\s+/g, ' ');
    const date = parseDateString(el.getAttribute('date'));
    const body = el.getAttribute('body') || '';
    const isOutgoing = type === '2';

    return {
      id: `msg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      address,
      body,
      date,
      kind: 'sms',
      out: isOutgoing,
      attachments: []
    };
  } catch (e) {
    console.warn('SMS parse error:', e);
    return null;
  }
}

function parseMmsElement(elementString) {
  try {
    const doc = new DOMParser().parseFromString(elementString, 'application/xml');
    const parserError = doc.querySelector('parsererror');
    if (parserError) return null;

    const el = doc.documentElement;
    if (el.tagName.toLowerCase() !== 'mms') return null;

    const type = el.getAttribute('type');
    let address = (el.getAttribute('address') || 'Inconnu').trim().replace(/\s+/g, ' ');
    const date = parseDateString(el.getAttribute('date'));
    const isOutgoing = type === '2';

    let body = '';
    const rawAttachments = [];

    const parts = el.getElementsByTagName('part');
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      const ct = part.getAttribute('ct') || '';
      const text = part.getAttribute('text');
      const data = part.getAttribute('data');
      const cl = part.getAttribute('cl') || `piece-jointe-${i + 1}`;

      if (ct.startsWith('text/') && text) {
        body += (body ? '\n' : '') + text;
      } else if (data) {
        try {
          const cleanData = data.replace(/\s/g, '');
          const raw = atob(cleanData);
          const bytes = new Uint8Array(new ArrayBuffer(raw.length));
          for (let j = 0; j < raw.length; j++) {
            bytes[j] = raw.charCodeAt(j);
          }
          rawAttachments.push({ blob: new Blob([bytes], { type: ct }), type: ct, name: cl });
        } catch (e) {
          console.warn('Failed to decode MMS attachment:', e);
        }
      }
    }

    const addrs = Array.from(el.getElementsByTagName('addr'))
      .map(a => a.getAttribute('address'))
      .filter(Boolean);
    if (address === 'Inconnu' && addrs.length > 0) {
      address = addrs[0];
    }

    const attachmentIds = rawAttachments.map((_, idx) => `att-${Date.now()}-${idx}`);

    return {
      message: {
        id: `msg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        address,
        body: body || (rawAttachments.length ? 'Média' : ''),
        date,
        kind: 'mms',
        out: isOutgoing,
        attachments: attachmentIds
      },
      attachments: rawAttachments.map((att, idx) => ({
        id: attachmentIds[idx],
        blob: att.blob,
        type: att.type,
        name: att.name
      }))
    };
  } catch (e) {
    console.warn('MMS parse error:', e);
    return null;
  }
}

// ============================================
// DATE PARSING TESTS
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

// ============================================
// SMS PARSING TESTS
// ============================================

test('parseSmsElement - simple incoming SMS', () => {
  const xml = '<sms protocol="0" address="+33612345678" date="1609459200000" type="1" subject="null" body="Bonjour !" toa="null" sc_toa="null" service_center="null" read="1" status="-1" locked="0" />';
  const msg = parseSmsElement(xml);
  
  ok(msg !== null);
  strictEqual(msg.kind, 'sms');
  strictEqual(msg.address, '+33612345678');
  strictEqual(msg.body, 'Bonjour !');
  strictEqual(msg.out, false);
  ok(msg.date instanceof Date);
  strictEqual(msg.date.getTime(), 1609459200000);
});

test('parseSmsElement - outgoing SMS', () => {
  const xml = '<sms protocol="0" address="+33612345678" date="1609459260000" type="2" subject="null" body="Je vais bien" toa="null" sc_toa="null" service_center="null" read="1" status="-1" locked="0" />';
  const msg = parseSmsElement(xml);
  
  ok(msg !== null);
  strictEqual(msg.out, true);
});

test('parseSmsElement - with emojis', () => {
  const xml = '<sms protocol="0" address="+33687654321" date="1609545600000" type="1" subject="null" body="Hello ! 👋 Voici un test 🎉" toa="null" sc_toa="null" service_center="null" read="1" status="-1" locked="0" />';
  const msg = parseSmsElement(xml);
  
  ok(msg !== null);
  strictEqual(msg.body, 'Hello ! 👋 Voici un test 🎉');
});

test('parseSmsElement - with escaped quotes', () => {
  const xml = '<sms protocol="0" address="+33699999999" date="1609632000000" type="1" subject="null" body="Il a dit : &quot;Bonjour !&quot;" toa="null" sc_toa="null" service_center="null" read="1" status="-1" locked="0" />';
  const msg = parseSmsElement(xml);
  
  ok(msg !== null);
  strictEqual(msg.body.includes('"'), true);
});

test('parseSmsElement - unknown contact', () => {
  const xml = '<sms protocol="0" address="" date="1609459200000" type="1" subject="null" body="Test" toa="null" sc_toa="null" service_center="null" read="1" status="-1" locked="0" />';
  const msg = parseSmsElement(xml);
  
  ok(msg !== null);
  strictEqual(msg.address, 'Inconnu');
});

// ============================================
// MMS PARSING TESTS
// ============================================

test('parseMmsElement - MMS with text and image', () => {
  const xml = `<mms protocol="0" address="+33611111111" date="1609718400000" type="1" subject="Photo" text_only="0" >
    <addr address="+33611111111" type="137"/>
    <part seq="0" ct="image/png" name="test-image.png" chset="" cd="" fn="test-image.png" text="" data="iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==" />
    <part seq="1" ct="text/plain" text="Voici une image !" />
  </mms>`;
  const result = parseMmsElement(xml);
  
  ok(result !== null);
  ok(result.message !== undefined);
  ok(result.attachments !== undefined);
  
  strictEqual(result.message.kind, 'mms');
  strictEqual(result.message.address, '+33611111111');
  ok(result.message.body.includes('image'));
  strictEqual(result.message.out, false);
  
  ok(result.attachments.length >= 1);
});

test('parseMmsElement - outgoing MMS', () => {
  const xml = `<mms protocol="0" address="+33622222222" date="1609804800000" type="2" subject="Vacances" text_only="0" >
    <addr address="+33622222222" type="137"/>
    <part seq="0" ct="image/jpeg" name="vacation.jpg" chset="" cd="" fn="vacation.jpg" text="" data="/9j/4AAQSkZJRgABAQAAAQABAAD/2wBD" />
    <part seq="1" ct="text/plain" text="Les photos de vacances !" />
  </mms>`;
  const result = parseMmsElement(xml);
  
  ok(result !== null);
  strictEqual(result.message.out, true);
});

// ============================================
// FIXTURE FILE TEST
// ============================================

test('parse full sample.xml file', () => {
  const xml = readFileSync(resolve(__dirname, 'fixtures', 'sample.xml'), 'utf-8');
  const result = extract(xml);
  
  ok(result.complete.length >= 5, 'Should have at least 5 messages');
});

// ============================================
// EDGE CASES
// ============================================

test('parseSmsElement - with > character in body', () => {
  const xml = '<sms protocol="0" address="+33633333333" date="1609891200000" type="1" subject="null" body="Test message with > character" toa="null" sc_toa="null" service_center="null" read="1" status="-1" locked="0" />';
  const msg = parseSmsElement(xml);
  
  ok(msg !== null);
  strictEqual(msg.body, 'Test message with > character');
});

test('parseSmsElement - with whitespace in address', () => {
  const xml = '<sms protocol="0" address="  +33 612 345 678  " date="1609459200000" type="1" subject="null" body="Test" toa="null" sc_toa="null" service_center="null" read="1" status="-1" locked="0" />';
  const msg = parseSmsElement(xml);
  
  ok(msg !== null);
  strictEqual(msg.address, '+33 612 345 678');
});
