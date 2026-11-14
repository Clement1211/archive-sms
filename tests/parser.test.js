/**
 * Tests for XML parser
 * Run with: node --test tests/parser.test.js
 */

import { strictEqual, ok, deepStrictEqual } from 'node:assert';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// Mock DOMParser for Node.js
const __dirname = fileURLToPath(new URL('.', import.meta.url));

// Load parser module
const parserPath = resolve(__dirname, '../parser.js');
const { parseSmsElement, parseMmsElement, parseDateString } = 
  await import('file://' + parserPath);

// Helper to read fixture file
function readFixture(name) {
  return readFileSync(resolve(__dirname, 'fixtures', name), 'utf-8');
}

// ============================================
// DATE PARSING TESTS
// ============================================

denojson({ name: 'Date Parsing Tests', async fn() {
  await fn();
}});

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
  // The quotes should be decoded
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
  
  // Should have attachments
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
  const xml = readFixture('sample.xml');
  
  // Count SMS and MMS elements
  const smsMatches = (xml.match(/<sms[^>]*\/>/g) || []).length;
  const mmsMatches = (xml.match(/<mms[^>]*>.*?<\/mms>/gs) || []).length;
  
  ok(smsMatches >= 3, 'Should have at least 3 SMS elements');
  ok(mmsMatches >= 2, 'Should have at least 2 MMS elements');
});

// ============================================
// EDGE CASES
// ============================================

test('parseSmsElement - with > character in body (from issue)', () => {
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
