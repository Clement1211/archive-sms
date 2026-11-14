/**
 * Archives SMS - Web App for reading SMS Backup & Restore XML files
 * 
 * Features:
 * - Streaming XML parsing for large files (200MB+)
 * - IndexedDB storage with batch inserts
 * - PWA support with offline caching
 * - Local storage only (100% privacy)
 * 
 * @author Clement1211
 * @license MIT
 */

import { parseXmlStreaming, createAbortController } from './parser.js';

// Constants
const DB_NAME = "archives-sms-db";
const DB_VERSION = 2; // Updated for streaming support
const STORE_MESSAGES = "messages";
const STORE_METADATA = "conversations";
const STORE_ATTACHMENTS = "attachments";
const BATCH_SIZE = 500; // Messages per batch

// State
let db;
let allMessages = [];
let chats = [];
let selected = null;
let importController = null;

// DOM Helpers
const $ = id => document.getElementById(id);

/**
 * Show a toast notification
 */
function toast(message, duration = 2600) {
  const el = $("status");
  el.textContent = message;
  el.classList.add("show");
  setTimeout(() => el.classList.remove("show"), duration);
}

/**
 * Update progress bar
 */
function updateProgress(bytesRead, totalBytes) {
  const progressBar = $("progressBar");
  const progressText = $("progressText");
  
  if (progressBar && progressText) {
    const percent = totalBytes > 0 ? Math.round((bytesRead / totalBytes) * 100) : 0;
    progressBar.style.width = `${percent}%`;
    progressText.textContent = `${formatBytes(bytesRead)} / ${formatBytes(totalBytes)}`;
  }
}

/**
 * Format bytes to human readable string
 */
function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

/**
 * Show/hide loader
 */
function showLoader() {
  const loader = $("importLoader");
  if (loader) loader.hidden = false;
}

function hideLoader() {
  const loader = $("importLoader");
  if (loader) loader.hidden = true;
}

/**
 * Open IndexedDB database with migration
 */
async function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    
    request.onerror = (event) => {
      console.error("IndexedDB error:", event.target.error);
      reject(event.target.error);
    };
    
    request.onsuccess = (event) => {
      resolve(event.target.result);
    };
    
    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      
      // Create new stores for v2
      if (!db.objectStoreNames.contains(STORE_MESSAGES)) {
        db.createObjectStore(STORE_MESSAGES, { keyPath: 'id' });
      }
      
      if (!db.objectStoreNames.contains(STORE_METADATA)) {
        // Create index on address for faster conversation lookup
        const store = db.createObjectStore(STORE_METADATA, { keyPath: 'address' });
        store.createIndex('lastDate', 'lastDate', { unique: false });
        store.createIndex('messageCount', 'messageCount', { unique: false });
      }
      
      if (!db.objectStoreNames.contains(STORE_ATTACHMENTS)) {
        db.createObjectStore(STORE_ATTACHMENTS, { keyPath: 'id' });
      }
      
      // Migration from v1 to v2: delete old store if it exists
      if (db.objectStoreNames.contains('archive')) {
        db.deleteObjectStore('archive');
      }
    };
  });
}

/**
 * Get a store from the database
 */
function getStore(storeName, mode = 'readonly') {
  return db.transaction(storeName, mode).objectStore(storeName);
}

/**
 * Save a message to IndexedDB
 */
async function saveMessage(message) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_MESSAGES, 'readwrite');
    const store = tx.objectStore(STORE_MESSAGES);
    
    // Convert attachments to store format
    const msgToStore = {
      ...message,
      attachments: message.attachments.map(att => ({
        id: `${message.id}-${att.name}`,
        type: att.type,
        name: att.name
      }))
    };
    
    const request = store.put(msgToStore);
    
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
    
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
}

/**
 * Save a batch of messages
 */
async function saveMessageBatch(messages) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_MESSAGES, 'readwrite');
    const store = tx.objectStore(STORE_MESSAGES);
    
    messages.forEach(msg => {
      const msgToStore = {
        ...msg,
        attachments: msg.attachments.map(att => ({
          id: `${msg.id}-${att.name}`,
          type: att.type,
          name: att.name
        }))
      };
      store.put(msgToStore);
    });
    
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
}

/**
 * Save conversation metadata
 */
async function saveConversationMetadata(address, messages) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_METADATA, 'readwrite');
    const store = tx.objectStore(STORE_METADATA);
    
    const lastMessage = messages[messages.length - 1];
    
    const metadata = {
      address,
      messageCount: messages.length,
      lastDate: lastMessage?.date?.getTime() || 0,
      lastMessageBody: lastMessage?.body || '',
      lastMessageOut: lastMessage?.out || false,
      lastMessageDate: lastMessage?.date || null
    };
    
    store.put(metadata);
    
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
}

/**
 * Read all messages from IndexedDB
 */
async function readAllMessages() {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_MESSAGES, 'readonly');
    const store = tx.objectStore(STORE_MESSAGES);
    const request = store.getAll();
    
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Read messages by address
 */
async function readMessagesByAddress(address) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_MESSAGES, 'readonly');
    const store = tx.objectStore(STORE_MESSAGES);
    const index = store.index('address');
    
    // Note: We need to create an index on address in the store
    // For now, we'll just filter manually
    const request = store.getAll();
    
    request.onsuccess = () => {
      const messages = request.result.filter(msg => msg.address === address);
      // Sort by date
      messages.sort((a, b) => (a.date?.getTime() || 0) - (b.date?.getTime() || 0));
      resolve(messages);
    };
    request.onerror = () => reject(request.error);
  });
}

/**
 * Read all conversation metadata
 */
async function readAllConversations() {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_METADATA, 'readonly');
    const store = tx.objectStore(STORE_METADATA);
    const request = store.getAll();
    
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Clear all data
 */
async function clearAllData() {
  return new Promise((resolve, reject) => {
    const tx = db.transaction([STORE_MESSAGES, STORE_METADATA, STORE_ATTACHMENTS], 'readwrite');
    
    tx.objectStore(STORE_MESSAGES).clear();
    tx.objectStore(STORE_METADATA).clear();
    tx.objectStore(STORE_ATTACHMENTS).clear();
    
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
}

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
 * Format date for display
 */
function fmtDate(d) {
  return d ? new Intl.DateTimeFormat("fr-FR", { day: "2-digit", month: "short", year: "numeric" }).format(d) : "";
}

/**
 * Format time for display
 */
function fmtTime(d) {
  return d ? new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit" }).format(d) : "";
}

/**
 * Clean phone number formatting
 */
function cleanNumber(v) {
  return (v || "Inconnu").trim().replace(/\s+/g, " ");
}

/**
 * Import XML file using streaming parser
 */
async function importFile(file) {
  if (!file) return;
  
  // Create abort controller
  importController = createAbortController();
  
  // Show loader and progress
  showLoader();
  updateProgress(0, file.size);
  
  try {
    let messages = [];
    let currentBatch = [];
    let totalMessages = 0;
    let conversationMetadata = new Map();
    
    // Reset state
    allMessages = [];
    chats = [];
    selected = null;
    render();
    
    // Clear existing data
    await clearAllData();
    
    // Stream and parse the file
    const messagesStream = parseXmlStreaming(file, {
      chunkSize: 8 * 1024 * 1024, // 8MB
      batchSize: BATCH_SIZE,
      onProgress: updateProgress,
      signal: importController.signal
    });
    
    for await (const msg of messagesStream) {
      // Add to current batch
      currentBatch.push(msg);
      totalMessages++;
      
      // Update conversation metadata
      if (!conversationMetadata.has(msg.address)) {
        conversationMetadata.set(msg.address, []);
      }
      conversationMetadata.get(msg.address).push(msg);
      
      // Check if we should save batch
      if (currentBatch.length >= BATCH_SIZE) {
        // Save batch to IndexedDB
        await saveMessageBatch(currentBatch);
        
        // Update progress
        updateProgress(file.size, file.size); // We don't have exact byte progress here
        
        // Reset batch
        messages = messages.concat(currentBatch);
        currentBatch = [];
      }
      
      // Check if cancelled
      if (importController.signal.aborted) {
        throw new Error("Import annulé");
      }
    }
    
    // Save remaining messages
    if (currentBatch.length > 0) {
      await saveMessageBatch(currentBatch);
      messages = messages.concat(currentBatch);
    }
    
    // Save conversation metadata
    for (const [address, msgs] of conversationMetadata) {
      await saveConversationMetadata(address, msgs);
    }
    
    // Update state
    allMessages = messages;
    chats = await buildConversationList();
    
    // Request persistent storage
    if ('storage' in navigator && 'persist' in navigator.storage) {
      await navigator.storage.persist();
      const estimation = await navigator.storage.estimate();
      console.log("Storage quota:", estimation);
      // Could display quota to user
    }
    
    // Hide loader
    hideLoader();
    updateProgress(0, 0);
    
    // Render
    render();
    toast(`${totalMessages} messages importés avec succès`);
    
  } catch (error) {
    hideLoader();
    updateProgress(0, 0);
    
    if (error.message === "Import annulé") {
      toast("Import annulé");
    } else {
      console.error("Import error:", error);
      toast(`Erreur pendant l'import: ${error.message}`);
    }
  } finally {
    importController = null;
  }
}

/**
 * Build conversation list from metadata
 */
async function buildConversationList() {
  const metadataList = await readAllConversations();
  
  // Sort by last date descending
  metadataList.sort((a, b) => b.lastDate - a.lastDate);
  
  return metadataList.map(metadata => ({
    address: metadata.address,
    messages: [], // Will be loaded on demand
    last: {
      date: new Date(metadata.lastDate),
      body: metadata.lastMessageBody,
      out: metadata.lastMessageOut
    },
    messageCount: metadata.messageCount
  }));
}

/**
 * Load messages for a specific conversation (on demand)
 */
async function loadConversationMessages(address) {
  return await readMessagesByAddress(address);
}

/**
 * Open a chat conversation (load messages on demand)
 */
async function openChat(address) {
  selected = address;
  
  showLoader();
  
  try {
    // Load messages for this conversation
    const c = chats.find(x => x.address === address);
    if (!c) return;
    
    // If messages not loaded yet, load them
    if (c.messages.length === 0) {
      c.messages = await loadConversationMessages(address);
      // Sort messages by date
      c.messages.sort((a, b) => (a.date?.getTime() || 0) - (b.date?.getTime() || 0));
    }
    
    // Update UI
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
      
      // Note: Attachments handling will be updated in Step 2
      // For now, just show text
      
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
    
    hideLoader();
    
  } catch (error) {
    hideLoader();
    console.error("Error loading conversation:", error);
    toast("Erreur lors du chargement de la conversation");
  }
}

/**
 * Render the UI based on state
 */
function render() {
  $("welcome").hidden = allMessages.length > 0 || chats.length > 0;
  $("workspace").hidden = !allMessages.length && !chats.length;
  $("chatCount").textContent = chats.length.toString();
  renderList();
}

/**
 * Render chat list from metadata
 */
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

/**
 * Cancel import
 */
function cancelImport() {
  if (importController) {
    importController.abort();
    importController = null;
    hideLoader();
    updateProgress(0, 0);
    toast("Import annulé");
  }
}

// Event Listeners
$("importBtn").onclick = $("welcomeImport").onclick = () => $("fileInput").click();
$("fileInput").onchange = e => importFile(e.target.files[0]);
$("search").oninput = renderList;
$("backBtn").onclick = () => {
  $("workspace").querySelector(".conversation").classList.remove("mobile-open");
};

// Export functionality
$("exportBtn").onclick = async () => {
  const messages = await readAllMessages();
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

// Clear functionality
$("clearBtn").onclick = async () => {
  if (!confirm("Effacer toutes les conversations stockées sur cet appareil ? Cette action est irréversible.")) return;
  await clearAllData();
  allMessages = [];
  chats = [];
  selected = null;
  render();
  toast("Archive effacée");
};

// Modal help
function openHelpModal() { $("helpModal").hidden = false; }
function closeHelpModal() { $("helpModal").hidden = true; }
$("helpBtn").onclick = openHelpModal;
$("closeHelp").onclick = closeHelpModal;
$("helpModal").onclick = e => { if (e.target === $("helpModal")) closeHelpModal(); };

// Privacy Modal
function openPrivacyModal() { $("privacyModal").hidden = false; }
function closePrivacyModal() { $("privacyModal").hidden = true; }
$("privacyLink").onclick = e => { e.preventDefault(); openPrivacyModal(); };
$("closePrivacy").onclick = closePrivacyModal;
$("privacyModal").onclick = e => { if (e.target === $("privacyModal")) closePrivacyModal(); };

// Cancel button for import
$("cancelImportBtn").onclick = cancelImport;

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

// Initialize the app
(async () => {
  try {
    db = await openDB();
    
    // Load conversation metadata
    chats = await buildConversationList();
    
    // For now, we don't load all messages at startup
    // They will be loaded on demand when opening a conversation
    
    render();
    
    // Check for updates
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
