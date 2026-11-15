/**
 * Archives SMS - Web App for reading SMS Backup & Restore XML files
 * 
 * Enhanced version with:
 * - Streaming XML parser for large files (200MB+)
 * - Proper attachment storage in IndexedDB
 * - Memory-efficient batch processing
 * - Compatible with iPhone 17 and Safari iOS
 * 
 * @author Clement1211
 * @license MIT
 */

// ============================================
// CONSTANTS
// ============================================

const DB_NAME = "archives-sms-db";
const DB_VERSION = 3;
const STORE_MESSAGES = "messages";
const STORE_ATTACHMENTS = "attachments";
const STORE_STAGING_MESSAGES = "stagingMessages";
const STORE_STAGING_ATTACHMENTS = "stagingAttachments";
const CHUNK_SIZE = 1 * 1024 * 1024; // 1MB keeps Safari iOS peak memory lower
const BATCH_SIZE = 300;
const BATCH_SIZE_BYTES = 8 * 1024 * 1024;

// ============================================
// STATE
// ============================================

let db;
let allMessages = [];
let chats = [];
let selected = null;
let importController = null;
let activeObjectUrls = new Set();

// ============================================
// DOM HELPERS
// ============================================

const $ = id => document.getElementById(id);

function toast(message, duration = 2600) {
  const el = $("status");
  if (!el) return;
  el.textContent = message;
  el.classList.add("show");
  setTimeout(() => el.classList.remove("show"), duration);
}

function updateProgress(bytesRead, totalBytes) {
  const progressBar = $("progressBar");
  const progressText = $("progressText");
  if (progressBar && progressText) {
    const percent = totalBytes > 0 ? Math.round((bytesRead / totalBytes) * 100) : 0;
    progressBar.style.width = `${percent}%`;
    progressText.textContent = `${formatBytes(bytesRead)} / ${formatBytes(totalBytes)}`;
  }
}

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function showLoader() {
  const loader = $("importLoader");
  if (loader) loader.hidden = false;
}

function hideLoader() {
  const loader = $("importLoader");
  if (loader) loader.hidden = true;
  updateProgress(0, 0);
}

// ============================================
// INDEXEDDB - Simple Promise-based wrapper
// ============================================

function dbOpen() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onerror = () => reject(req.error);
    req.onsuccess = () => resolve(req.result);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      // Create stores if they don't exist
      if (!db.objectStoreNames.contains(STORE_MESSAGES)) {
        db.createObjectStore(STORE_MESSAGES, { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains(STORE_ATTACHMENTS)) {
        db.createObjectStore(STORE_ATTACHMENTS, { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains(STORE_STAGING_MESSAGES)) {
        db.createObjectStore(STORE_STAGING_MESSAGES, { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains(STORE_STAGING_ATTACHMENTS)) {
        db.createObjectStore(STORE_STAGING_ATTACHMENTS, { keyPath: "id" });
      }
    };
  });
}

function dbTx(storeNames, mode, callback) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeNames, mode);
    callback(tx);
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
}

function dbGet(store, key) {
  return new Promise((resolve, reject) => {
    const req = db.transaction(store, "readonly").objectStore(store).get(key);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function dbClear(store) {
  return dbTx([store], "readwrite", (tx) => tx.objectStore(store).clear());
}

// ============================================
// XML PARSING - Streaming, memory-efficient
// ============================================

function parseDateString(s) {
  if (!s) return null;
  let n = Number(s);
  if (!Number.isFinite(n)) return null;
  if (n < 1e12) n *= 1000; // milliseconds
  const d = new Date(n);
  return isNaN(d) ? null : d;
}

function parseSmsElement(xmlString) {
  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(xmlString, "application/xml");
    const parserError = doc.querySelector("parsererror");
    if (parserError) return null;

    const el = doc.documentElement;
    if (el.tagName.toLowerCase() !== "sms") return null;

    const type = el.getAttribute("type");
    const address = (el.getAttribute("address") || "Inconnu").trim().replace(/\s+/g, " ");
    const date = parseDateString(el.getAttribute("date"));
    const body = el.getAttribute("body") || "";
    const isOutgoing = type === "2";

    return {
      id: `msg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      address,
      body,
      date,
      kind: "sms",
      out: isOutgoing,
      attachments: []
    };
  } catch (e) {
    console.warn("SMS parse error:", e);
    return null;
  }
}

function parseMmsElement(xmlString) {
  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(xmlString, "application/xml");
    const parserError = doc.querySelector("parsererror");
    if (parserError) return null;

    const el = doc.documentElement;
    if (el.tagName.toLowerCase() !== "mms") return null;

    const type = el.getAttribute("type");
    let address = (el.getAttribute("address") || "Inconnu").trim().replace(/\s+/g, " ");
    const date = parseDateString(el.getAttribute("date"));
    const isOutgoing = type === "2";

    let body = "";
    const rawAttachments = []; // { blob, type, name }

    const parts = el.getElementsByTagName("part");
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      const ct = part.getAttribute("ct") || "";
      const text = part.getAttribute("text");
      const data = part.getAttribute("data");
      const cl = part.getAttribute("cl") || `piece-jointe-${i + 1}`;

      if (ct.startsWith("text/") && text) {
        body += (body ? "\n" : "") + text;
      } else if (data) {
        try {
          const cleanData = data.replace(/\s/g, "");
          const raw = atob(cleanData);
          const bytes = new Uint8Array(new ArrayBuffer(raw.length));
          for (let j = 0; j < raw.length; j++) {
            bytes[j] = raw.charCodeAt(j);
          }
          const blob = new Blob([bytes], { type: ct || "application/octet-stream" });
          rawAttachments.push({ blob, type: ct || "application/octet-stream", name: cl });
        } catch (e) {
          console.warn("Failed to decode MMS attachment:", e);
        }
      }
    }

    const addrs = Array.from(el.getElementsByTagName("addr"))
      .map(a => a.getAttribute("address"))
      .filter(Boolean);
    if (address === "Inconnu" && addrs.length > 0) {
      address = addrs[0];
    }

    // Include randomness because several MMS can be parsed in the same millisecond.
    const attachmentIds = rawAttachments.map(() =>
      `att-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`
    );

    return {
      message: {
        id: `msg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        address,
        body: body || (rawAttachments.length ? "Média" : ""),
        date,
        kind: "mms",
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
    console.warn("MMS parse error:", e);
    return null;
  }
}

// ============================================
// XML EXTRACTOR - Reference implementation (validated on 149 Mo file)
// ============================================

const START = /<(sms|mms)(?=[\s\/>])/g;
const ATTR = /\s+[^\s=\/>]+\s*=\s*(?:"[^"]*"|'[^']*')/y;

// Returns null if opening tag is incomplete in buffer
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

// Extract complete <sms> and <mms> elements from buffer
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
// STREAMING XML PARSER
// ============================================

async function* parseXmlStreaming(file, signal, onProgress) {
  const decoder = new TextDecoder('utf-8');
  let buffer = "";
  let bytesRead = 0;
  const totalBytes = file.size;

  if (signal?.aborted) return;

  try {
    while (bytesRead < totalBytes) {
      if (signal?.aborted) return;

      const endPos = Math.min(bytesRead + CHUNK_SIZE, totalBytes);
      const chunk = file.slice(bytesRead, endPos);
      const chunkText = decoder.decode(await chunk.arrayBuffer(), { stream: true });
      buffer += chunkText;
      bytesRead = endPos;

      if (onProgress) onProgress(bytesRead, totalBytes);

      const { complete, remaining } = extract(buffer);
      buffer = remaining;

      for (const element of complete) {
        if (signal?.aborted) return;
        
        if (element.startsWith('<sms')) {
          const msg = parseSmsElement(element);
          if (msg) yield msg;
        } else if (element.startsWith('<mms')) {
          const result = parseMmsElement(element);
          if (result) yield result;
        }
      }
    }

    // Process remaining buffer
    if (buffer) {
      const { complete } = extract(buffer);
      for (const element of complete) {
        if (signal?.aborted) return;
        if (element.startsWith('<sms')) {
          const msg = parseSmsElement(element);
          if (msg) yield msg;
        } else if (element.startsWith('<mms')) {
          const result = parseMmsElement(element);
          if (result) yield result;
        }
      }
    }
  } catch (e) {
    console.error("Streaming parse error:", e);
    throw e;
  }
}

// ============================================
// IMPORT
// ============================================

async function importFile(file) {
  if (!file || !db || importController) return;

  const abortController = new AbortController();
  importController = abortController;

  showLoader();
  updateProgress(0, file.size);

  try {
    await clearImportStaging();
    const messagesBatch = [];
    const attachmentsBatch = [];
    let batchBytes = 0;
    let totalMessages = 0;

    const stream = parseXmlStreaming(file, abortController.signal, (br, total) => {
      updateProgress(br, total);
    });

    for await (const item of stream) {
      if (abortController.signal.aborted) throw new DOMException("Import annulé", "AbortError");

      const message = item.address ? item : item.message;
      const attachments = item.attachments || [];
      if (!message) continue;

      messagesBatch.push(message);
      attachmentsBatch.push(...attachments);
      batchBytes += (message.body?.length || 0) * 2 + (message.address?.length || 0) * 2 + 200;
      for (const attachment of attachments) batchBytes += attachment.blob?.size || 0;
      totalMessages++;

      if (messagesBatch.length >= BATCH_SIZE || batchBytes >= BATCH_SIZE_BYTES) {
        await saveImportBatch(messagesBatch, attachmentsBatch);
        messagesBatch.length = 0;
        attachmentsBatch.length = 0;
        batchBytes = 0;
      }
    }

    if (abortController.signal.aborted) throw new DOMException("Import annulé", "AbortError");
    if (messagesBatch.length) await saveImportBatch(messagesBatch, attachmentsBatch);
    if (totalMessages === 0) throw new Error("Aucun message valide trouvé dans ce fichier XML");

    // Replace the current archive in one transaction only after the file was fully parsed.
    await replaceAllDataFromStaging();
    selected = null;
    cleanupObjectUrls();
    $("messages").replaceChildren();
    $("chatView").hidden = true;
    $("emptyChat").hidden = false;
    allMessages = await loadAllMessagesFromDB();
    chats = groupMessages(allMessages);

    if ("storage" in navigator && "persist" in navigator.storage) {
      try { await navigator.storage.persist(); }
      catch (e) { console.warn("Storage persist failed:", e); }
    }

    hideLoader();
    render();
    toast(`${totalMessages} messages importés`);
  } catch (error) {
    try { await clearImportStaging(); }
    catch (cleanupError) { console.warn("Staging cleanup failed:", cleanupError); }
    hideLoader();
    if (error.name === "AbortError") {
      toast("Import annulé");
    } else {
      console.error("Import error:", error);
      toast(`Erreur: ${error.message}`);
    }
  } finally {
    if (importController === abortController) importController = null;
  }
}

function clearImportStaging() {
  return dbTx([STORE_STAGING_MESSAGES, STORE_STAGING_ATTACHMENTS], "readwrite", tx => {
    tx.objectStore(STORE_STAGING_MESSAGES).clear();
    tx.objectStore(STORE_STAGING_ATTACHMENTS).clear();
  });
}

function saveImportBatch(messages, attachments) {
  return dbTx([STORE_STAGING_MESSAGES, STORE_STAGING_ATTACHMENTS], "readwrite", tx => {
    const messageStore = tx.objectStore(STORE_STAGING_MESSAGES);
    const attachmentStore = tx.objectStore(STORE_STAGING_ATTACHMENTS);
    for (const message of messages) messageStore.put(message);
    for (const attachment of attachments) {
      attachmentStore.put({ id: attachment.id, blob: attachment.blob, type: attachment.type, name: attachment.name });
    }
  });
}

function replaceAllDataFromStaging() {
  const storeNames = [STORE_MESSAGES, STORE_ATTACHMENTS, STORE_STAGING_MESSAGES, STORE_STAGING_ATTACHMENTS];
  const tx = db.transaction(storeNames, "readwrite");
  const migrate = (sourceName, targetName) => {
    const source = tx.objectStore(sourceName);
    const target = tx.objectStore(targetName);
    const request = source.openCursor();
    request.onsuccess = () => {
      const cursor = request.result;
      if (!cursor) return;
      target.put(cursor.value);
      cursor.delete();
      cursor.continue();
    };
  };

  tx.objectStore(STORE_MESSAGES).clear();
  tx.objectStore(STORE_ATTACHMENTS).clear();
  migrate(STORE_STAGING_MESSAGES, STORE_MESSAGES);
  migrate(STORE_STAGING_ATTACHMENTS, STORE_ATTACHMENTS);
  return new Promise((resolve, reject) => {
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error("Remplacement de l'archive annulé"));
  });
}


async function clearAllData() {
  await Promise.all([
    dbClear(STORE_MESSAGES),
    dbClear(STORE_ATTACHMENTS)
  ]);
  allMessages = [];
  chats = [];
  cleanupObjectUrls();
}

// ============================================
// LOAD DATA
// ============================================

async function loadAllMessagesFromDB() {
  return new Promise((resolve) => {
    const tx = db.transaction(STORE_MESSAGES, "readonly");
    const store = tx.objectStore(STORE_MESSAGES);
    const req = store.getAll();
    req.onsuccess = () => {
      const messages = req.result || [];
      resolve(messages.sort((a, b) => (a.date?.getTime() || 0) - (b.date?.getTime() || 0)));
    };
    req.onerror = () => resolve([]);
  });
}

async function loadAttachment(attachmentId) {
  return new Promise(async (resolve) => {
    const tx = db.transaction(STORE_ATTACHMENTS, "readonly");
    const store = tx.objectStore(STORE_ATTACHMENTS);
    const req = store.get(attachmentId);
    req.onsuccess = () => {
      const att = req.result;
      if (att && att.blob) {
        const url = URL.createObjectURL(att.blob);
        activeObjectUrls.add(url);
        resolve({ id: att.id, url, type: att.type, name: att.name, blob: att.blob });
      } else {
        resolve(null);
      }
    };
    req.onerror = () => resolve(null);
  });
}

function cleanupObjectUrls() {
  for (const url of activeObjectUrls) {
    try {
      URL.revokeObjectURL(url);
    } catch (e) {
      // ignore
    }
  }
  activeObjectUrls.clear();
}

// ============================================
// SERVICE WORKER UPDATE HANDLING
// ============================================

function showUpdateBanner() {
  const banner = $("updateBanner");
  const reloadBtn = $("reloadBtn");
  const closeBtn = $("closeUpdateBtn");
  
  if (!banner) return;
  
  banner.hidden = false;
  
  if (reloadBtn) {
    reloadBtn.onclick = () => {
      if (!importController) { // Don't reload during import
        window.location.reload();
      }
    };
  }
  
  if (closeBtn) {
    closeBtn.onclick = () => {
      banner.hidden = true;
    };
  }
}

// ============================================
// CONVERSATIONS
// ============================================

function groupMessages(msgs) {
  const map = new Map();
  for (const m of msgs) {
    const key = m.address;
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(m);
  }
  return [...map.entries()]
    .map(([address, messages]) => ({
      address,
      messages,
      last: messages[messages.length - 1]
    }))
    .sort((a, b) => (b.last.date?.getTime() || 0) - (a.last.date?.getTime() || 0));
}

// ============================================
// RENDERING
// ============================================

function render() {
  const welcomeEl = $("welcome");
  const workspaceEl = $("workspace");
  const chatCountEl = $("chatCount");

  if (welcomeEl) welcomeEl.hidden = allMessages.length > 0 || chats.length > 0;
  if (workspaceEl) workspaceEl.hidden = allMessages.length === 0 && chats.length === 0;
  if (chatCountEl) chatCountEl.textContent = chats.length.toString();

  renderList();
}

function renderList() {
  const q = $("search")?.value?.toLocaleLowerCase("fr") || "";
  const list = $("chatList");
  if (!list) return;

  list.innerHTML = "";

  const filtered = chats.filter(c =>
    c.address.toLocaleLowerCase("fr").includes(q) ||
    (c.last?.body?.toLocaleLowerCase("fr") || "").includes(q)
  );

  for (const c of filtered) {
    const item = document.createElement("div");
    item.className = "chat-item" + (selected === c.address ? " active" : "");

    const av = document.createElement("div");
    av.className = "avatar";
    av.textContent = (c.address.replace(/\D/g, "").slice(-2) || "?").toUpperCase();

    const meta = document.createElement("div");
    meta.className = "chat-meta";

    const line = document.createElement("div");
    line.className = "chat-line";

    const name = document.createElement("span");
    name.className = "chat-name";
    name.textContent = c.address;

    const dt = document.createElement("span");
    dt.className = "chat-date";
    dt.textContent = fmtDate(c.last?.date);

    const preview = document.createElement("div");
    preview.className = "chat-preview";
    preview.textContent = (c.last?.out ? "Vous : " : "") + (c.last?.body || "");

    line.append(name, dt);
    meta.append(line, preview);
    item.append(av, meta);
    item.onclick = () => openChat(c.address);
    list.append(item);
  }
}

function fmtDate(d) {
  if (!d) return "";
  return new Intl.DateTimeFormat("fr-FR", { day: "2-digit", month: "short", year: "numeric" }).format(d);
}

function fmtTime(d) {
  if (!d) return "";
  return new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit" }).format(d);
}

function openChat(address) {
  selected = address;
  const c = chats.find(x => x.address === address);
  if (!c) return;

  cleanupObjectUrls();

  const emptyChatEl = $("emptyChat");
  const chatViewEl = $("chatView");
  const chatTitleEl = $("chatTitle");
  const chatSubtitleEl = $("chatSubtitle");
  const messagesEl = $("messages");

  if (emptyChatEl) emptyChatEl.hidden = true;
  if (chatViewEl) chatViewEl.hidden = false;
  if (chatTitleEl) chatTitleEl.textContent = address;
  if (chatSubtitleEl) chatSubtitleEl.textContent = `${c.messages.length} messages`;

  if (messagesEl) messagesEl.innerHTML = "";

  let lastDay = "";

  for (const m of c.messages) {
    const day = fmtDate(m.date);
    if (day !== lastDay) {
      const sep = document.createElement("div");
      sep.className = "day-divider";
      sep.textContent = day || "Date inconnue";
      messagesEl.append(sep);
      lastDay = day;
    }

    const bubble = document.createElement("div");
    bubble.className = "msg " + (m.out ? "out" : "in");

    if (m.body) {
      const text = document.createElement("span");
      text.textContent = m.body;
      bubble.append(text, " ");
    }

    // Load attachments
    if (m.attachments && m.attachments.length > 0) {
      for (const attId of m.attachments) {
        const attPlaceholder = document.createElement("span");
        attPlaceholder.className = "attachment-loading";
        attPlaceholder.textContent = "Chargement...";
        bubble.append(attPlaceholder);

        loadAttachment(attId).then(att => {
          if (att) {
            attPlaceholder.remove();
            if (att.type.startsWith("image/")) {
              const img = document.createElement("img");
              img.className = "attachment";
              img.src = att.url;
              img.alt = att.name;
              bubble.append(img);
            } else {
              const link = document.createElement("a");
              link.className = "attachment-link";
              link.href = att.url;
              link.download = att.name;
              link.textContent = "Télécharger " + att.name;
              link.onclick = () => {
                // Auto-cleanup after download
                setTimeout(() => URL.revokeObjectURL(att.url), 10000);
              };
              bubble.append(link);
            }
          }
        });
      }
    }

    const time = document.createElement("span");
    time.className = "msg-time";
    time.textContent = fmtTime(m.date);
    bubble.append(time);
    messagesEl.append(bubble);
  }

  if (messagesEl) messagesEl.scrollTop = messagesEl.scrollHeight;
  renderList();

  if (innerWidth <= 700) {
    const convEl = $("workspace")?.querySelector(".conversation");
    if (convEl) convEl.classList.add("mobile-open");
  }
}

// ============================================
// EVENT LISTENERS
// ============================================

function setupEventListeners() {
  const fileInput = $("fileInput");
  const importBtn = $("importBtn");
  const welcomeImport = $("welcomeImport");
  const search = $("search");
  const backBtn = $("backBtn");
  const exportBtn = $("exportBtn");
  const clearBtn = $("clearBtn");
  const cancelBtn = $("cancelImportBtn");
  const helpBtn = $("helpBtn");
  const closeHelp = $("closeHelp");
  const helpModal = $("helpModal");
  const privacyLink = $("privacyLink");
  const closePrivacy = $("closePrivacy");
  const privacyModal = $("privacyModal");
  const installBtn = $("installBtn");

  if (fileInput) fileInput.onchange = e => importFile(e.target.files[0]);
  if (importBtn) importBtn.onclick = () => fileInput?.click();
  if (welcomeImport) welcomeImport.onclick = () => fileInput?.click();
  if (search) search.oninput = renderList;
  if (backBtn) backBtn.onclick = () => {
    cleanupObjectUrls();
    const convEl = $("workspace")?.querySelector(".conversation");
    if (convEl) convEl.classList.remove("mobile-open");
  };

  if (exportBtn) exportBtn.onclick = async () => {
    const messages = await loadAllMessagesFromDB();
    const exportedMessages = await Promise.all(messages.map(async message => ({
      id: message.id,
      address: message.address,
      body: message.body,
      date: message.date?.toISOString(),
      kind: message.kind,
      out: message.out,
      attachments: await Promise.all((message.attachments || []).map(async id => {
        const attachment = await dbGet(STORE_ATTACHMENTS, id);
        if (!attachment?.blob) return null;
        const bytes = new Uint8Array(await attachment.blob.arrayBuffer());
        let binary = "";
        for (let offset = 0; offset < bytes.length; offset += 0x8000) {
          binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
        }
        return { name: attachment.name, type: attachment.type, data: `data:${attachment.type};base64,${btoa(binary)}` };
      }))
    })));
    const data = JSON.stringify({ messages: exportedMessages, exportedAt: new Date().toISOString() }, null, 2);

    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([data], { type: "application/json" }));
    a.download = "archives-sms-export.json";
    a.click();
    URL.revokeObjectURL(a.href);
    toast("Export JSON préparé");
  };

  if (clearBtn) clearBtn.onclick = async () => {
    if (!confirm("Effacer toutes les conversations stockées sur cet appareil ? Cette action est irréversible.")) return;
    cleanupObjectUrls();
    await clearAllData();
    render();
    toast("Archive effacée");
  };

  if (cancelBtn) cancelBtn.onclick = () => {
    if (importController) {
      importController.abort();
      hideLoader();
      toast("Import annulé");
    }
  };

  // Modal handlers
  if (helpBtn) helpBtn.onclick = () => { if (helpModal) helpModal.hidden = false; };
  if (closeHelp) closeHelp.onclick = () => { if (helpModal) helpModal.hidden = true; };
  if (helpModal) helpModal.onclick = e => { if (e.target === helpModal) helpModal.hidden = true; };

  if (privacyLink) privacyLink.onclick = e => {
    e.preventDefault();
    if (privacyModal) privacyModal.hidden = false;
  };
  if (closePrivacy) closePrivacy.onclick = () => { if (privacyModal) privacyModal.hidden = true; };
  if (privacyModal) privacyModal.onclick = e => { if (e.target === privacyModal) privacyModal.hidden = true; };

  // PWA Install
  if (installBtn) installBtn.hidden = true;
  let deferredPrompt;

  if (installBtn) {
    installBtn.onclick = async () => {
      if (deferredPrompt) {
        deferredPrompt.prompt();
        const { outcome } = await deferredPrompt.userChoice;
        if (outcome === "accepted") {
          toast("Installation en cours...");
          installBtn.hidden = true;
        }
        deferredPrompt = null;
      }
    };
  }

  window.addEventListener("beforeinstallprompt", e => {
    e.preventDefault();
    deferredPrompt = e;
    if (installBtn) installBtn.hidden = false;
  });

  window.addEventListener("appinstalled", () => {
    toast("App installée !");
    if (installBtn) installBtn.hidden = true;
    deferredPrompt = null;
  });

  // Keyboard
  window.addEventListener("keydown", e => {
    if (e.key === "Escape") {
      if (helpModal && !helpModal.hidden) helpModal.hidden = true;
      if (privacyModal && !privacyModal.hidden) privacyModal.hidden = true;
      if (innerWidth <= 700) {
        cleanupObjectUrls();
        const convEl = $("workspace")?.querySelector(".conversation");
        if (convEl) convEl.classList.remove("mobile-open");
      }
    }
  });
}

// ============================================
// INITIALIZATION
// ============================================

(async () => {
  try {
    db = await dbOpen();
    allMessages = await loadAllMessagesFromDB();
    chats = groupMessages(allMessages);
    render();
    setupEventListeners();

    // Service Worker registration with update detection
    if ("serviceWorker" in navigator && location.protocol.startsWith("http")) {
      const hadController = Boolean(navigator.serviceWorker.controller);
      let reloadedForUpdate = false;
      if (hadController) {
        navigator.serviceWorker.addEventListener("controllerchange", () => {
          if (reloadedForUpdate) return;
          reloadedForUpdate = true;
          window.location.reload();
        });
      }

      navigator.serviceWorker.register("./sw.js").then((reg) => {
        // Check immediately so an older cached app can hand off to the new worker.
        reg.update().catch(() => {});
        // Listen for updates on the registration, not navigator.serviceWorker
        reg.addEventListener('updatefound', () => {
          const newWorker = reg.installing;
          newWorker.addEventListener('statechange', () => {
            // Show banner when new SW is installed and there's a current controller
            if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
              showUpdateBanner();
            }
          });
        });
      }).catch(() => {});
    }

    // Request persistent storage on load
    if ("storage" in navigator && "persist" in navigator.storage) {
      try {
        await navigator.storage.persist();
      } catch (e) {
        console.warn("Storage persist on load failed:", e);
      }
    }

  } catch (e) {
    console.error("DB initialization error:", e);
    toast("Stockage local indisponible dans ce navigateur");
  }
})();
