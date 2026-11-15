import { test } from 'node:test';
import { strictEqual, ok } from 'node:assert';
import { readFileSync } from 'node:fs';
import { indexedDB } from 'fake-indexeddb';
import { importFile, setDatabaseForTesting } from '../app.js';
import { installDOMParserMock } from './helpers/dom-parser.js';

const fixture = readFileSync(new URL('./fixtures/sample.xml', import.meta.url), 'utf8');
const STORE_NAMES = ['messages', 'attachments', 'stagingMessages', 'stagingAttachments'];

installDOMParserMock();

async function makeDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(`archive-test-${Math.random()}`, 1);
    request.onupgradeneeded = () => {
      for (const store of STORE_NAMES) request.result.createObjectStore(store, { keyPath: 'id' });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function getAll(database, storeName) {
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(storeName, 'readonly');
    const request = transaction.objectStore(storeName).getAll();
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    transaction.onabort = () => reject(transaction.error || new Error('Transaction annulée'));
  });
}

async function seedOldArchive(database) {
  await new Promise((resolve, reject) => {
    const transaction = database.transaction('messages', 'readwrite');
    transaction.objectStore('messages').put({ id: 'old-message', address: '+331', body: 'Archive préexistante', attachments: [] });
    transaction.oncomplete = resolve;
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error || new Error('Transaction annulée'));
  });
}

test('importFile importe complètement la fixture en staging puis remplace l’archive', async () => {
  const database = await makeDatabase();
  setDatabaseForTesting(database);
  await seedOldArchive(database);

  await importFile(new Blob([fixture]));

  const messages = await getAll(database, 'messages');
  strictEqual(messages.length, 7);
  strictEqual(messages.some(message => message.id === 'old-message'), false);
  strictEqual((await getAll(database, 'stagingMessages')).length, 0);
  strictEqual((await getAll(database, 'stagingAttachments')).length, 0);
  database.close();
});

test('importFile cancellation preserves the old archive and clears staged batches', async () => {
  const database = await makeDatabase();
  setDatabaseForTesting(database);
  await seedOldArchive(database);
  const controller = new AbortController();
  let chunksRead = 0;
  const largeXml = fixture.repeat(1000);

  await importFile(new Blob([largeXml]), {
    controller,
    onProgress(bytesRead) {
      if (bytesRead > chunksRead) chunksRead = bytesRead;
      if (bytesRead >= 2 * 1024 * 1024) controller.abort();
    }
  });

  const messages = await getAll(database, 'messages');
  strictEqual(messages.length, 1);
  strictEqual(messages[0].id, 'old-message');
  ok(chunksRead >= 2 * 1024 * 1024);
  strictEqual((await getAll(database, 'stagingMessages')).length, 0);
  strictEqual((await getAll(database, 'stagingAttachments')).length, 0);
  database.close();
});

test('importFile failure during a staging batch clears staging and preserves old archive', async () => {
  const database = await makeDatabase();
  setDatabaseForTesting(database);
  await seedOldArchive(database);
  const originalTransaction = database.transaction.bind(database);
  let stagingTransactionCount = 0;
  let shouldAbortBatch = true;
  database.transaction = (storeNames, mode, options) => {
    const transaction = originalTransaction(storeNames, mode, options);
    const names = Array.isArray(storeNames) ? storeNames : [storeNames];
    if (mode === 'readwrite' && names.includes('stagingMessages')) stagingTransactionCount++;
    if (shouldAbortBatch && stagingTransactionCount > 1 && mode === 'readwrite' && names.includes('stagingMessages')) {
      shouldAbortBatch = false;
      queueMicrotask(() => transaction.abort());
    }
    return transaction;
  };

  await importFile(new Blob([fixture.repeat(50)]));

  const messages = await getAll(database, 'messages');
  strictEqual(messages.length, 1);
  strictEqual(messages[0].id, 'old-message');
  strictEqual((await getAll(database, 'stagingMessages')).length, 0);
  strictEqual((await getAll(database, 'stagingAttachments')).length, 0);
  database.close();
});
