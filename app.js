/**
 * Archives SMS - Web App for reading SMS Backup & Restore XML files
 * 
 * Enhanced version with streaming XML parser for large files (200MB+)
 * Compatible with iPhone 17 and Safari iOS
 * 
 * @author Clement1211
 * @license MIT
 */

// ============================================
// CONSTANTS
// ============================================

const DB_NAME = "archives-sms-db";
const STORE = "archive";
const CHUNK_SIZE = 8 * 1024 * 1024; // 8MB chunks
const BATCH_SIZE = 500; // Messages per batch

// ============================================
// STATE
// ============================================

let db;
let allMessages = [];
let chats = [];
let selected = null;
let importController = null;

// ============================================
// DOM HELPERS
// ============================================

const $ = id => document.getElementById(id);

function toast(message, duration = 2600) {
  const el = $("status");
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
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
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
// INDEXEDDB MANAGEMENT
// ============================================

function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onerror = (event) => reject(event.target.error);
    request.onsuccess = (event) => resolve(event.target.result);
    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE);
      }
    };
  });
}

function save(key, value) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(value, key);
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
}

function read(key) {
  return new Promise((resolve, reject) => {
    const r = db.transaction(STORE).objectStore(STORE).get(key);
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}

function saveMessageBatch(messages) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    const store = tx.objectStore(STORE);
    for (const msg of messages) {
      store.put(msg, `msg-${msg.id}`);
    }
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
}

async function clearAllData() {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).clear();
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
}

async function loadAllMessages() {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const store = tx.objectStore(STORE);
    const request = store.getAll();
    request.onsuccess = () => {
      const messages = request.result.filter(item => 
        typeof item === 'object' && item.address !== undefined
      );
      resolve(messages.sort((a, b) => (a.date?.getTime() || 0) - (b.date?.getTime() || 0)));
    };
    request.onerror = () => reject(request.error);
  });
}

// ============================================
// XML PARSING FUNCTIONS
// ============================================

/**
 * Parse date string (timestamp in milliseconds or seconds)
 */
function parseDateString(dateString) {
  if (!dateString) return null;
  let n = Number(dateString);
  if (!Number.isFinite(n)) return null;
  if (n < 1e12) n *= 1000;
  const d = new Date(n);
  return isNaN(d) ? null : d;
}

/**
 * Parse a single SMS element
 */
function parseSmsElement(elementString) {
  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(elementString, 'application/xml');
    const parserError = doc.querySelector('parsererror');
    if (parserError) return null;
    
    const element = doc.documentElement;
    if (element.tagName.toLowerCase() !== 'sms') return null;
    
    const type = element.getAttribute('type');
    const address = (element.getAttribute('address') || 'Inconnu').trim().replace(/\s+/g, ' ');
    const date = parseDateString(element.getAttribute('date'));
    const body = element.getAttribute('body') || '';
    const isOutgoing = type === '2';
    
    return {
      id: Date.now() + Math.random(),
      address,
      body,
      date,
      kind: 'sms',
      out: isOutgoing,
      attachments: []
    };
  } catch (e) {
    console.warn('Error parsing SMS:', e);
    return null;
  }
}

/**
 * Parse an MMS element with parts
 */
function parseMmsElement(elementString) {
  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(elementString, 'application/xml');
    const parserError = doc.querySelector('parsererror');
    if (parserError) return null;
    
    const element = doc.documentElement;
    if (element.tagName.toLowerCase() !== 'mms') return null;
    
    const type = element.getAttribute('type');
    let address = (element.getAttribute('address') || 'Inconnu').trim().replace(/\s+/g, ' ');
    const date = parseDateString(element.getAttribute('date'));
    const isOutgoing = type === '2';
    
    let body = '';
    const attachments = [];
    
    // Parse parts
    const parts = element.getElementsByTagName('part');
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
          const raw = atob(data.replace(/\s/g, ''));
          const bytes = new Uint8Array(raw.length);
          for (let j = 0; j < raw.length; j++) {
            bytes[j] = raw.charCodeAt(j);
          }
          // Store as data URL for now (Step 2 will improve this)
          const blob = new Blob([bytes], { type: ct || 'application/octet-stream' });
          const dataUrl = URL.createObjectURL(blob);
          attachments.push({
            type: ct || 'application/octet-stream',
            dataUrl,
            name: cl
          });
        } catch (e) {
          console.warn('Failed to decode attachment:', e);
        }
      }
    }
    
    // Get addresses from addr tags
    const addrs = Array.from(element.getElementsByTagName('addr'))
      .map(a => a.getAttribute('address'))
      .filter(Boolean);
    
    if (address === 'Inconnu' && addrs.length > 0) {
      address = addrs[0];
    }
    
    return {
      id: Date.now() + Math.random(),
      address,
      body: body || (attachments.length ? 'Média' : ''),
      date,
      kind: 'mms',
      out: isOutgoing,
      attachments
    };
  } catch (e) {
    console.warn('Error parsing MMS:', e);
    return null;
  }
}

/**
 * Extract complete XML elements from buffer
 */
function extractElements(buffer) {
  const complete = [];
  let remaining = buffer;
  let pos = 0;
  
  while (pos < remaining.length) {
    const openPos = remaining.indexOf('<', pos);
    if (openPos === -1) break;
    
    const closePos = remaining.indexOf('>', openPos);
    if (closePos === -1) break;
    
    const tagStart = openPos;
    const tagEnd = closePos;
    const tag = remaining.substring(openPos, closePos + 1);
    
    // Self-closing tag
    if (tag.endsWith('/>')) {
      complete.push(tag);
      pos = tagEnd + 1;
      remaining = remaining.substring(0, tagStart) + remaining.substring(tagEnd + 1);
      pos = 0;
      continue;
    }
    
    // Opening tag - find closing tag
    const tagNameMatch = tag.match(/<(\w+)/);
    if (!tagNameMatch) {
      pos = tagEnd + 1;
      continue;
    }
    
    const tagName = tagNameMatch[1];
    const closingTag = `</${tagName}>`;
    const closeTagPos = remaining.indexOf(closingTag, tagEnd + 1);
    
    if (closeTagPos === -1) break;
    
    const element = remaining.substring(tagStart, closeTagPos + closingTag.length);
    complete.push(element);
    pos = 0;
    remaining = remaining.substring(0, tagStart) + remaining.substring(closeTagPos + closingTag.length);
  }
  
  return { complete, remaining };
}

/**
 * Streaming XML parser
 */
async function* parseXmlStreaming(file, signal = null, onProgress = null) {
  let buffer = '';
  let bytesRead = 0;
  let totalBytes = file.size;
  
  if (signal?.aborted) return;
  
  try {
    while (bytesRead < totalBytes) {
      if (signal?.aborted) return;
      
      const endPos = Math.min(bytesRead + CHUNK_SIZE, totalBytes);
      const chunk = file.slice(bytesRead, endPos);
      const chunkText = await chunk.text();
      buffer += chunkText;
      bytesRead += chunk.size;
      
      if (onProgress) {
        onProgress(bytesRead, totalBytes);
      }
      
      const { complete, remaining } = extractElements(buffer);
      buffer = remaining;
      
      for (const element of complete) {
        if (signal?.aborted) return;
        
        const tagName = element.match(/<(\w+)/)?.[1]?.toLowerCase();
        
        if (tagName === 'sms') {
          const msg = parseSmsElement(element);
          if (msg) yield msg;
        } else if (tagName === 'mms') {
          const msg = parseMmsElement(element);
          if (msg) yield msg;
        }
      }
    }
    
    // Process remaining buffer
    if (buffer) {
      const { complete } = extractElements(buffer);
      for (const element of complete) {
        if (signal?.aborted) return;
        const tagName = element.match(/<(\w+)/)?.[1]?.toLowerCase();
        if (tagName === 'sms') {
          const msg = parseSmsElement(element);
          if (msg) yield msg;
        } else if (tagName === 'mms') {
          const msg = parseMmsElement(element);
          if (msg) yield msg;
        }
      }
    }
  } catch (e) {
    console.error('Streaming parse error:', e);
    throw e;
  }
}

function createAbortController() {
  return {
    signal: { aborted: false },
    abort: () => { this.signal.aborted = true; }
  };
}

// ============================================
// CONVERSATION MANAGEMENT
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
// IMPORT FUNCTION
// ============================================

async function importFile(file) {
  if (!file) return;
  
  importController = createAbortController();
  showLoader();
  updateProgress(0, file.size);
  
  try {
    let allMessages = [];
    let currentBatch = [];
    let messageCount = 0;
    
    selected = null;
    await clearAllData();
    
    const messagesStream = parseXmlStreaming(
      file,
      importController.signal,
      (bytesRead, totalBytes) => {
        updateProgress(bytesRead, totalBytes);
      }
    );
    
    for await (const msg of messagesStream) {
      if (importController.signal.aborted) {
        throw new Error("Import annulé");
      }
      
      currentBatch.push(msg);
      allMessages.push(msg);
      messageCount++;
      
      if (currentBatch.length >= BATCH_SIZE) {
        await saveMessageBatch(currentBatch);
        currentBatch = [];
      }
    }
    
    if (currentBatch.length > 0) {
      await saveMessageBatch(currentBatch);
    }
    
    chats = groupMessages(allMessages);
    
    // Request persistent storage
    if ('storage' in navigator && 'persist' in navigator.storage) {
      try {
        await navigator.storage.persist();
        const estimation = await navigator.storage.estimate();
        console.log("Storage quota:", estimation);
      } catch (e) {
        console.warn("Storage persist failed:", e);
      }
    }
    
    hideLoader();
    render();
    toast(`${messageCount} messages importés`);
    
  } catch (error) {
    hideLoader();
    if (error.message === "Import annulé") {
      toast("Import annulé");
    } else {
      console.error("Import error:", error);
      toast(`Erreur: ${error.message}`);
    }
  } finally {
    importController = null;
  }
}

// ============================================
// RENDERING FUNCTIONS
// ============================================

function render() {
  $("welcome").hidden = allMessages.length > 0 || chats.length > 0;
  $("workspace").hidden = !allMessages.length && !chats.length;
  $("chatCount").textContent = chats.length.toString();
  renderList();
}

function renderList() {
  const q = $("search").value.toLocaleLowerCase("fr");
  const list = $("chatList");
  list.innerHTML = "";
  
  const filtered = chats.filter(c =>
    c.address.toLocaleLowerCase("fr").includes(q) ||
    c.last?.body?.toLocaleLowerCase("fr").includes(q)
  );
  
  for (const c of filtered) {
    const item = document.createElement("div");
    item.className = "chat-item" + (selected === c.address ? " active" : "");
    
    const av = document.createElement("div");
    av.className = "avatar";
    av.textContent = (c.address.replace(/\D/g, "").slice(-2) || "?");
    
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
  return d ? new Intl.DateTimeFormat("fr-FR", { day: "2-digit", month: "short", year: "numeric" }).format(d) : "";
}

function fmtTime(d) {
  return d ? new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit" }).format(d) : "";
}

function openChat(address) {
  selected = address;
  const c = chats.find(x => x.address === address);
  if (!c) return;
  
  $("emptyChat").hidden = true;
  $("chatView").hidden = false;
  $("chatTitle").textContent = address;
  $("chatSubtitle").textContent = `${c.messages.length} messages`;
  
  $("messages").innerHTML = "";
  let lastDay = "";
  
  for (const m of c.messages) {
    const day = fmtDate(m.date);
    if (day !== lastDay) {
      const sep = document.createElement("div");
      sep.className = "day-divider";
      sep.textContent = day || "Date inconnue";
      $("messages").append(sep);
      lastDay = day;
    }
    
    const bubble = document.createElement("div");
    bubble.className = "msg " + (m.out ? "out" : "in");
    bubble.textContent = m.body || "";
    
    for (const a of m.attachments || []) {
      if (a.type.startsWith("image/") && a.dataUrl) {
        const img = document.createElement("img");
        img.className = "attachment";
        img.src = a.dataUrl;
        img.alt = "Image MMS";
        bubble.append(img);
      } else if (a.dataUrl) {
        const link = document.createElement("a");
        link.className = "attachment-link";
        link.href = a.dataUrl;
        link.download = a.name;
        link.textContent = "Télécharger " + a.name;
        bubble.append(link);
      }
    }
    
    const time = document.createElement("span");
    time.className = "msg-time";
    time.textContent = fmtTime(m.date);
    bubble.append(time);
    $("messages").append(bubble);
  }
  
  $("messages").scrollTop = $("messages").scrollHeight;
  renderList();
  
  if (innerWidth <= 700) {
    $("workspace").querySelector(".conversation").classList.add("mobile-open");
  }
}

// ============================================
// EVENT LISTENERS
// ============================================

$("importBtn").onclick = $("welcomeImport").onclick = () => $("fileInput").click();
$("fileInput").onchange = e => importFile(e.target.files[0]);
$("search").oninput = renderList;
$("backBtn").onclick = () => {
  $("workspace").querySelector(".conversation").classList.remove("mobile-open");
};

$("exportBtn").onclick = async () => {
  const messages = await loadAllMessages();
  const data = JSON.stringify({
    messages: messages.map(m => ({ ...m, attachments: [] })),
    exportedAt: new Date().toISOString()
  }, null, 2);
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([data], { type: "application/json" }));
  a.download = "archives-sms-export.json";
  a.click();
  URL.revokeObjectURL(a.href);
  toast("Export JSON préparé");
};

$("clearBtn").onclick = async () => {
  if (!confirm("Effacer toutes les conversations stockées sur cet appareil ? Cette action est irréversible.")) return;
  await clearAllData();
  allMessages = [];
  chats = [];
  selected = null;
  render();
  toast("Archive effacée");
};

// Modal handlers
function openHelpModal() { $("helpModal").hidden = false; }
function closeHelpModal() { $("helpModal").hidden = true; }
$("helpBtn").onclick = openHelpModal;
$("closeHelp").onclick = closeHelpModal;
$("helpModal").onclick = e => { if (e.target === $("helpModal")) closeHelpModal(); };

function openPrivacyModal() { $("privacyModal").hidden = false; }
function closePrivacyModal() { $("privacyModal").hidden = true; }
$("privacyLink").onclick = e => { e.preventDefault(); openPrivacyModal(); };
$("closePrivacy").onclick = closePrivacyModal;
$("privacyModal").onclick = e => { if (e.target === $("privacyModal")) closePrivacyModal(); };

$("cancelImportBtn").onclick = () => {
  if (importController) {
    importController.abort();
    importController = null;
    hideLoader();
    toast("Import annulé");
  }
};

// PWA Install
let deferredPrompt;
function showInstallBtn() { if ($("installBtn")) $("installBtn").hidden = false; }
function hideInstallBtn() { if ($("installBtn")) $("installBtn").hidden = true; }

if ($("installBtn")) {
  $("installBtn").onclick = async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === "accepted") {
        toast("Installation en cours...");
        hideInstallBtn();
      }
      deferredPrompt = null;
    }
  };
}

window.addEventListener("beforeinstallprompt", e => {
  e.preventDefault();
  deferredPrompt = e;
  showInstallBtn();
});

window.addEventListener("appinstalled", () => {
  toast("App installée !");
  hideInstallBtn();
  deferredPrompt = null;
});

// ============================================
// INITIALIZATION
// ============================================

(async () => {
  try {
    db = await openDB();
    allMessages = await loadAllMessages();
    chats = groupMessages(allMessages);
    render();
    
    if ("serviceWorker" in navigator && location.protocol.startsWith("http")) {
      navigator.serviceWorker.register("./sw.js").catch(() => {});
    }
  } catch (e) {
    console.error("DB initialization error:", e);
    toast("Stockage local indisponible dans ce navigateur");
  }
})();

// Handle keyboard shortcuts
window.addEventListener("keydown", e => {
  if (e.key === "Escape") {
    if (!$("helpModal").hidden) closeHelpModal();
    if (!$("privacyModal").hidden) closePrivacyModal();
    if (innerWidth <= 700 && !$("emptyChat").hidden) {
      $("workspace").querySelector(".conversation").classList.remove("mobile-open");
    }
  }
});
