import { extract, parseSmsElement, parseMmsElement } from "./parser.js";
import { getAvailableLanguages, getIntlLocale, getLanguage, setLanguage, t, tPlural } from "./i18n.js";

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
let pendingReload = false;
let activeObjectUrls = new Set();
let lastProgress = { bytesRead: 0, totalBytes: 0 };

// ============================================
// DOM HELPERS
// ============================================

const $ = id => typeof document === "undefined" ? null : document.getElementById(id);

function toast(message, duration = 2600) {
  const el = $("status");
  if (!el) return;
  el.textContent = message;
  el.classList.add("show");
  setTimeout(() => el.classList.remove("show"), duration);
}

function updateProgress(bytesRead, totalBytes) {
  lastProgress = { bytesRead, totalBytes };
  const progressBar = $("progressBar");
  const progressText = $("progressText");
  if (progressBar && progressText) {
    const percent = totalBytes > 0 ? Math.round((bytesRead / totalBytes) * 100) : 0;
    progressBar.style.width = `${percent}%`;
    progressText.textContent = t("import.progress", {
      read: formatBytes(bytesRead),
      total: formatBytes(totalBytes)
    });
  }
}

function formatBytes(bytes) {
  const number = new Intl.NumberFormat(getIntlLocale(), { maximumFractionDigits: 1 });
  if (bytes < 1024) return `${number.format(bytes)} B`;
  if (bytes < 1024 * 1024) return `${number.format(bytes / 1024)} KB`;
  return `${number.format(bytes / (1024 * 1024))} MB`;
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

export function setDatabaseForTesting(database) { db = database; }

function dbTx(storeNames, mode, callback) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeNames, mode);
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error || new Error(t("error.transactionCanceled")));
    tx.onabort = () => reject(tx.error || new Error(t("error.transactionCanceled")));
    callback(tx);
  });
}

function dbGet(store, key) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, "readonly");
    const req = tx.objectStore(store).get(key);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    tx.onerror = () => reject(tx.error || new Error(t("error.transactionCanceled")));
    tx.onabort = () => reject(tx.error || new Error(t("error.transactionCanceled")));
  });
}

function dbClear(store) {
  return dbTx([store], "readwrite", (tx) => tx.objectStore(store).clear());
}

// ============================================
// STREAMING XML PARSER
// ============================================


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

export async function importFile(file, { controller = new AbortController(), onProgress = updateProgress } = {}) {
  if (!file || !db || importController) return;

  const abortController = controller;
  importController = abortController;
  updateHeaderAction();

  showLoader();
  updateProgress(0, file.size);

  try {
    await clearImportStaging();
    const messagesBatch = [];
    const attachmentsBatch = [];
    let batchBytes = 0;
    let totalMessages = 0;

    const stream = parseXmlStreaming(file, abortController.signal, (br, total) => {
      onProgress(br, total);
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
    if (totalMessages === 0) throw new Error(t("error.noMessages"));

    // Replace the current archive in one transaction only after the file was fully parsed.
    await replaceAllDataFromStaging();
    selected = null;
    cleanupObjectUrls();
    if (typeof document !== "undefined") {
      $("messages").replaceChildren();
      $("chatView").hidden = true;
      $("emptyChat").hidden = false;
    }
    allMessages = await loadAllMessagesFromDB();
    chats = groupMessages(allMessages);

    if (typeof navigator !== "undefined" && "storage" in navigator && "persist" in navigator.storage) {
      try { await navigator.storage.persist(); }
      catch (e) { console.warn("Storage persist failed:", e); }
    }

    hideLoader();
    if (typeof document !== "undefined") render();
    toast(tPlural("toast.imported", totalMessages));
  } catch (error) {
    try { await clearImportStaging(); }
    catch (cleanupError) { console.warn("Staging cleanup failed:", cleanupError); }
    hideLoader();
    if (error?.name === "AbortError" && abortController.signal.aborted) {
      toast(t("toast.importCanceled"));
    } else if (error?.name === "QuotaExceededError") {
      toast(t("toast.storageFull"));
    } else {
      console.error("Import error:", error);
      const message = ["AbortError", "TransactionInactiveError", "InvalidStateError"].includes(error?.name)
        ? t("error.transactionCanceled")
        : error?.message || t("error.transactionCanceled");
      toast(t("error.import", { message }));
    }
  } finally {
    if (importController === abortController) importController = null;
    updateHeaderAction();
    if (pendingReload && typeof window !== "undefined") {
      pendingReload = false;
      window.location.reload();
    }
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
    tx.onerror = () => reject(tx.error || new Error(t("error.transactionCanceled")));
    tx.onabort = () => reject(tx.error || new Error(t("error.transactionCanceled")));
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
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_MESSAGES, "readonly");
    const store = tx.objectStore(STORE_MESSAGES);
    const req = store.getAll();
    req.onsuccess = () => {
      const messages = req.result || [];
      resolve(messages.sort((a, b) => (a.date?.getTime() || 0) - (b.date?.getTime() || 0)));
    };
    req.onerror = () => reject(req.error);
    tx.onerror = () => reject(tx.error || new Error(t("error.transactionCanceled")));
    tx.onabort = () => reject(tx.error || new Error(t("error.transactionCanceled")));
  });
}

async function loadAttachment(attachmentId) {
  return new Promise((resolve, reject) => {
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
    req.onerror = () => reject(req.error);
    tx.onerror = () => reject(tx.error || new Error(t("error.transactionCanceled")));
    tx.onabort = () => reject(tx.error || new Error(t("error.transactionCanceled")));
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
      contactName: messages.reduce((name, message) => message.contactName || name, '') || address,
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
  updateHeaderAction();

  renderList();
}

function updateHeaderAction() {
  const button = $("importBtn");
  const label = $("headerActionLabel");
  if (!button || !label) return;

  const hasArchive = allMessages.length > 0 || chats.length > 0;
  label.textContent = importController ? t("header.importing") : hasArchive ? t("header.delete") : t("header.import");
  button.classList.toggle("header-action-delete", hasArchive && !importController);
  button.disabled = Boolean(importController);
  button.setAttribute("aria-label", t(hasArchive ? "header.deleteAria" : "header.importAria"));
  const icon = button.querySelector(".btn-icon");
  if (icon) icon.textContent = hasArchive ? "⌫" : "+";
}

function renderList() {
  const q = $("search")?.value?.toLocaleLowerCase(getIntlLocale()) || "";
  const list = $("chatList");
  if (!list) return;

  list.innerHTML = "";

  const filtered = chats.filter(c =>
    c.contactName.toLocaleLowerCase(getIntlLocale()).includes(q) ||
    c.address.toLocaleLowerCase(getIntlLocale()).includes(q) ||
    (c.last?.body?.toLocaleLowerCase(getIntlLocale()) || "").includes(q)
  );

  for (const c of filtered) {
    const item = document.createElement("button");
    item.type = "button";
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
    name.textContent = c.contactName;

    const dt = document.createElement("span");
    dt.className = "chat-date";
    dt.textContent = fmtDate(c.last?.date);

    const preview = document.createElement("div");
    preview.className = "chat-preview";
    preview.textContent = (c.last?.out ? t("conversation.outgoingPrefix") : "") + (c.last?.body || "");

    line.append(name, dt);
    meta.append(line, preview);
    item.append(av, meta);
    item.onclick = () => openChat(c.address);
    list.append(item);
  }
}

function fmtDate(d) {
  if (!d) return "";
  return new Intl.DateTimeFormat(getIntlLocale(), { day: "2-digit", month: "short", year: "numeric" }).format(d);
}

function fmtTime(d) {
  if (!d) return "";
  return new Intl.DateTimeFormat(getIntlLocale(), { hour: "2-digit", minute: "2-digit" }).format(d);
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
  if (chatTitleEl) chatTitleEl.textContent = c.contactName;
  const messageCount = tPlural("conversation.messageCount", c.messages.length);
  if (chatSubtitleEl) chatSubtitleEl.textContent = c.contactName === address
    ? messageCount
    : `${address} · ${messageCount}`;

  if (messagesEl) messagesEl.innerHTML = "";

  let lastDay = "";

  for (const m of c.messages) {
    const day = fmtDate(m.date);
    if (day !== lastDay) {
      const sep = document.createElement("div");
      sep.className = "day-divider";
      sep.textContent = day || t("conversation.unknownDate");
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
        attPlaceholder.textContent = t("conversation.loadingAttachment");
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
              link.textContent = t("conversation.downloadAttachment", { name: att.name });
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
  const settingsBtn = $("settingsBtn");
  const closeSettings = $("closeSettings");
  const settingsModal = $("settingsModal");
  const settingsImportBtn = $("settingsImportBtn");
  const privacyFooterLink = $("privacyFooterLink");
  const languageSelect = $("languageSelect");
  const installLabel = installBtn?.querySelector("span:nth-child(2)");
  const installHelp = $("installHelp");
  let appInstalled = window.matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
  let installInstructionsExpanded = false;
  const updateInstallInstructions = () => {
    if (!installHelp) return;
    const isIOS = /iPhone|iPad|iPod/i.test(navigator.userAgent);
    installHelp.textContent = t(isIOS
      ? installInstructionsExpanded ? "settings.installIosAction" : "settings.installIos"
      : "settings.installOther");
    installHelp.classList.toggle("install-help-highlight", installInstructionsExpanded);
  };

  if (fileInput) fileInput.onchange = e => {
    importFile(e.target.files[0]);
    e.target.value = "";
  };
  const openFilePicker = () => fileInput?.click();
  const deleteArchive = async () => {
    if (!allMessages.length && !chats.length) return;
    if (!confirm(t("confirm.deleteArchive"))) return;
    cleanupObjectUrls();
    await clearAllData();
    selected = null;
    render();
    toast(t("toast.archiveDeleted"));
  };
  if (importBtn) importBtn.onclick = () => {
    if (allMessages.length || chats.length) deleteArchive();
    else openFilePicker();
  };
  if (welcomeImport) welcomeImport.onclick = () => fileInput?.click();
  if (settingsImportBtn) settingsImportBtn.onclick = openFilePicker;
  if (languageSelect) {
    const options = getAvailableLanguages().map(({ code, name }) => {
      const option = document.createElement("option");
      option.value = code;
      option.textContent = name;
      return option;
    });
    languageSelect.replaceChildren(...options);
    languageSelect.value = getLanguage();
    languageSelect.onchange = () => setLanguage(languageSelect.value);
    document.addEventListener("archive:languagechange", () => {
      languageSelect.value = getLanguage();
      updateProgress(lastProgress.bytesRead, lastProgress.totalBytes);
      if (installLabel && appInstalled) installLabel.textContent = t("settings.installed");
      updateInstallInstructions();
      render();
      if (selected) openChat(selected);
    });
  }
  if (settingsBtn) settingsBtn.onclick = () => { if (settingsModal) settingsModal.hidden = false; };
  if (closeSettings) closeSettings.onclick = () => { if (settingsModal) settingsModal.hidden = true; };
  if (settingsModal) settingsModal.onclick = e => { if (e.target === settingsModal) settingsModal.hidden = true; };
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
      contactName: message.contactName,
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
    toast(t("toast.exportReady"));
  };

  if (clearBtn) clearBtn.onclick = deleteArchive;

  if (cancelBtn) cancelBtn.onclick = () => {
    if (importController) {
      importController.abort();
      hideLoader();
      toast(t("toast.importCanceled"));
    }
  };

  // Modal handlers
  if (helpBtn) helpBtn.onclick = () => { if (helpModal) helpModal.hidden = false; };
  if (closeHelp) closeHelp.onclick = () => { if (helpModal) helpModal.hidden = true; };
  if (helpModal) helpModal.onclick = e => { if (e.target === helpModal) helpModal.hidden = true; };

  const openPrivacy = e => {
    e.preventDefault();
    if (settingsModal) settingsModal.hidden = true;
    if (privacyModal) privacyModal.hidden = false;
  };
  if (privacyLink) privacyLink.onclick = openPrivacy;
  if (privacyFooterLink) privacyFooterLink.onclick = openPrivacy;
  if (closePrivacy) closePrivacy.onclick = () => { if (privacyModal) privacyModal.hidden = true; };
  if (privacyModal) privacyModal.onclick = e => { if (e.target === privacyModal) privacyModal.hidden = true; };

  // PWA Install
  let deferredPrompt;

  if (installBtn) {
    if (appInstalled && installLabel) installLabel.textContent = t("settings.installed");
    installBtn.onclick = async () => {
      if (deferredPrompt) {
        if (settingsModal) settingsModal.hidden = true;
        deferredPrompt.prompt();
        const { outcome } = await deferredPrompt.userChoice;
        if (outcome === "accepted") {
          toast(t("toast.installing"));
        }
        deferredPrompt = null;
      } else if (window.matchMedia("(display-mode: standalone)").matches || navigator.standalone === true) {
        toast(t("toast.alreadyInstalled"));
      } else {
        installInstructionsExpanded = true;
        updateInstallInstructions();
        toast(t("toast.installHelp"));
      }
    };
  }

  updateInstallInstructions();

  window.addEventListener("beforeinstallprompt", e => {
    e.preventDefault();
    deferredPrompt = e;
  });

  window.addEventListener("appinstalled", () => {
    appInstalled = true;
    toast(t("toast.appInstalled"));
    deferredPrompt = null;
    if (installLabel) installLabel.textContent = t("settings.installed");
  });

  // Keyboard
  window.addEventListener("keydown", e => {
    if (e.key === "Escape") {
      if (helpModal && !helpModal.hidden) helpModal.hidden = true;
      if (privacyModal && !privacyModal.hidden) privacyModal.hidden = true;
      if (settingsModal && !settingsModal.hidden) settingsModal.hidden = true;
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

if (typeof document !== "undefined") (async () => {
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
          if (importController) {
            pendingReload = true;
            reloadedForUpdate = true;
            return;
          }
          reloadedForUpdate = true;
          window.location.reload();
        });
      }

      navigator.serviceWorker.register("../sw.js").then((reg) => {
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
    toast(t("toast.storageUnavailable"));
  }
})();
