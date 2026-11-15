import { test } from 'node:test';
import { strictEqual, ok } from 'node:assert';
import { parseDateString, parseSmsElement, parseMmsElement } from '../src/parser.js';
import { installDOMParserMock } from './helpers/dom-parser.js';

installDOMParserMock();

test('parseDateString accepts milliseconds and seconds', () => {
  strictEqual(parseDateString('1609459200000').getTime(), 1609459200000);
  strictEqual(parseDateString('1609459200').getTime(), 1609459200000);
  strictEqual(parseDateString('invalid'), null);
});

test('parseSmsElement parses the same production module used by the app', () => {
  const message = parseSmsElement('<sms address=" +336 123 " contact_name="Marie" date="1609459200000" type="2" body="Bonjour &amp; salut"/>');
  strictEqual(message.address, '+336 123');
  strictEqual(message.contactName, 'Marie');
  strictEqual(message.body, 'Bonjour & salut');
  strictEqual(message.out, true);
  strictEqual(message.kind, 'sms');
});

test('parseSmsElement ignores unknown contact labels', () => {
  const message = parseSmsElement('<sms address="+336123" contact_name="(Unknown)" type="1" body="Hi"/>');
  strictEqual(message.contactName, null);
});

test('parseMmsElement extracts text and attachments', () => {
  const result = parseMmsElement('<mms address="+336" date="1609459200" type="1"><part ct="text/plain" text="Hello"/><part ct="image/png" cl="image.png" data="AQID"/></mms>');
  strictEqual(result.message.body, 'Hello');
  strictEqual(result.attachments.length, 1);
  strictEqual(result.attachments[0].name, 'image.png');
  strictEqual(result.attachments[0].blob.size, 3);
  ok(result.message.attachments.includes(result.attachments[0].id));
});
