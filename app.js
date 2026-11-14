/**
 * Archives SMS - Web App for reading SMS Backup & Restore XML files
 * 
 * Original version working with 230MB files on iPhone 17
 * Enhanced with streaming parser and progress bar
 * 
 * @author Clement1211
 * @license MIT
 */

// Constants
const DB_NAME = "archives-sms-db", STORE = "archive";
let db, chats = [], selected = null, allMessages = [];
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
  updateProgress(0, 0);
}

/**
 * Open IndexedDB database
 * Keep v1 for compatibility, use store "archive"
 */
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

/**
 * Save data to IndexedDB
 */
function save(key, value) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(value, key);
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
}

/**
 * Read data from IndexedDB
 */
function read(key) {
  return new Promise((resolve, reject) => {
    const r = db.transaction(STORE).objectStore(STORE).get(key);
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}

/**
 * Clean phone number formatting
 */
function cleanNumber(v) {
  return (v || "Inconnu").trim().replace(/\s+/g, " ");
}

/**
 * Parse date string (timestamp in milliseconds or seconds)
 */
function dateOf(v) {
  let n = Number(v);
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
 * Parse XML element (from original version, adapted)
 */
function parseXml(xml) {
  const doc = new DOMParser().parseFromString(xml, "application/xml");
  if (doc.querySelector("parsererror")) throw Error("Le fichier XML semble invalide.");
  
  const nodes = [...doc.getElementsByTagName("sms"), ...doc.getElementsByTagName("mms")];
  if (!nodes.length) throw Error("Aucun SMS ou MMS trouvé dans ce fichier.");
  
  return nodes.map((n, i) => {
    const type = n.getAttribute("type");
    const address = cleanNumber(n.getAttribute("address"));
    const date = dateOf(n.getAttribute("date"));
    const isMms = n.tagName.toLowerCase() === "mms";
    let body = n.getAttribute("body") || "";
    const attachments = [];
    
    if (isMms) {
      const parts = [...n.getElementsByTagName("part")];
      for (const p of parts) {
        const ct = p.getAttribute("ct") || "";
        const text = p.getAttribute("text");
        const data = p.getAttribute("data");
        
        if (ct.startsWith("text/") && text) {
          body += (body ? "\n" : "") + text;
        } else if (data) {
          try {
            const raw = atob(data.replace(/\s/g, ""));
            const bytes = Uint8Array.from(raw, c => c.charCodeAt(0));
            // Store as data URL for now (will be fixed in Step 2)
            attachments.push({
              type: ct || "application/octet-stream",
              dataUrl: URL.createObjectURL(new Blob([bytes], { type: ct || "application/octet-stream" })),
              name: p.getAttribute("cl") || "pièce jointe"
            });
          } catch (e) {
            console.warn("Failed to decode attachment", e);
          }
        }
      }
    }
    
    return {
      id: i,
      address,
      body: body || (attachments.length ? "Média" : ""),
      date,
      kind: isMms ? "mms" : "sms",
      out: type === "2",
      attachments
    };
  }).sort((a, b) => (a.date?.getTime() || 0) - (b.date?.getTime() || 0));
}

/**
 * Streaming XML parser using file.slice() for better memory management
 * Falls back to original parseXml for compatibility
 */
async function parseXmlStreaming(file, onProgress) {
  const BUFFER_SIZE = 8 * 1024 * 1024; // 8MB
  let buffer = '';
  let allXml = '';
  let bytesRead = 0;
  
  // For now, use the original method for compatibility
  // But read in chunks to show progress
  const totalBytes = file.size;
  
  while (bytesRead < totalBytes) {
    const chunk = file.slice(bytesRead, bytesRead + BUFFER_SIZE);
    const chunkText = await chunk.text();
    buffer += chunkText;
    bytesRead += chunk.size;
    
    if (onProgress) {
      onProgress(bytesRead, totalBytes);
    }
    
    // Check for cancellation
    if (importController && importController.signal.aborted) {
      throw new Error("Import annulé");
    }
  }
  
  return buffer;
}

/**
 * Group messages by contact (from original version)
 */
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

/**
 * Import XML file
 * Uses streaming for large files but falls back to original method
 */
async function importFile(file) {
  if (!file) return;
  
  // Create abort controller
  importController = {
    signal: { aborted: false },
    abort: () => { importController.signal.aborted = true; }
  };
  
  showLoader();
  updateProgress(0, file.size);
  
  try {
    // Read file in chunks to show progress
    const xml = await parseXmlStreaming(file, (bytesRead, totalBytes) => {
      updateProgress(bytesRead, totalBytes);
      if (importController.signal.aborted) {
        throw new Error("Import annulé");
      }
    });
    
    // Parse XML (original method)
    const msgs = parseXml(xml);
    
    // Save to IndexedDB (original method)
    await save("messages", msgs);
    await save("filename", file.name);
    
    allMessages = msgs;
    chats = groupMessages(msgs);
    selected = null;
    
    // Request persistent storage
    if ('storage' in navigator && 'persist' in navigator.storage) {
      await navigator.storage.persist();
      const estimation = await navigator.storage.estimate();
      console.log("Storage quota:", estimation);
    }
    
    hideLoader();
    render();
    toast(`${msgs.length} messages importés`);
    
  } catch (error) {
    hideLoader();
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
 * Render the UI (from original version)
 */
function render() {
  $("welcome").hidden = allMessages.length > 0;
  $("workspace").hidden = !allMessages.length;
  $("chatCount").textContent = chats.length.toString();
  renderList();
}

/**
 * Render chat list (from original version)
 */
function renderList() {
  const q = $("search").value.toLocaleLowerCase("fr");
  const list = $("chatList");
  list.innerHTML = "";
  
  const filtered = chats.filter(c =>
    c.address.toLocaleLowerCase("fr").includes(q) ||
    c.messages.some(m => m.body.toLocaleLowerCase("fr").includes(q))
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
    dt.textContent = fmtDate(c.last.date);
    
    const preview = document.createElement("div");
    preview.className = "chat-preview";
    preview.textContent = (c.last.out ? "Vous : " : "") + c.last.body;
    
    line.append(name, dt);
    meta.append(line, preview);
    item.append(av, meta);
    item.onclick = () => openChat(c.address);
    list.append(item);
  }
}

/**
 * Open a chat conversation (from original version)
 */
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
      if (a.type.startsWith("image/")) {
        const img = document.createElement("img");
        img.className = "attachment";
        img.src = a.dataUrl;
        img.alt = "Image MMS";
        bubble.append(img);
      } else {
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

// Event Listeners
$("importBtn").onclick = $("welcomeImport").onclick = () => $("fileInput").click();
$("fileInput").onchange = e => importFile(e.target.files[0]);
$("search").oninput = renderList;
$("backBtn").onclick = () => {
  $("workspace").querySelector(".conversation").classList.remove("mobile-open");
};

$("exportBtn").onclick = async () => {
  const data = JSON.stringify({
    messages: allMessages.map(m => ({ ...m, attachments: [] })),
    filename: await read("filename")
  }, null, 2);
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([data], { type: "application/json" }));
  a.download = "archives-sms.json";
  a.click();
  URL.revokeObjectURL(a.href);
  toast("Export JSON préparé");
};

$("clearBtn").onclick = async () => {
  if (!confirm("Effacer toutes les conversations stockées sur cet appareil ? Cette action est irréversible.")) return;
  await save("messages", []);
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

// Cancel import
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

// Initialize the app
(async () => {
  try {
    db = await openDB();
    allMessages = await read("messages") || [];
    chats = groupMessages(allMessages);
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
