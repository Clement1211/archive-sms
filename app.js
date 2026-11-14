const DB_NAME="archives-sms-db", STORE="archive";
let db, chats=[], selected=null, allMessages=[];
const $=id=>document.getElementById(id);
function toast(s){const el=$("status");el.textContent=s;el.classList.add("show");setTimeout(()=>el.classList.remove("show"),2600)}
function openDB(){return new Promise((resolve,reject)=>{const r=indexedDB.open(DB_NAME,1);r.onupgradeneeded=()=>r.result.createObjectStore(STORE);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)})}
function save(key,value){return new Promise((resolve,reject)=>{const tx=db.transaction(STORE,"readwrite");tx.objectStore(STORE).put(value,key);tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error)})}
function read(key){return new Promise((resolve,reject)=>{const r=db.transaction(STORE).objectStore(STORE).get(key);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)})}
function cleanNumber(v){return (v||"Inconnu").trim().replace(/\s+/g," ")}
function dateOf(v){let n=Number(v);if(!Number.isFinite(n))return null;if(n<1e12)n*=1000;const d=new Date(n);return isNaN(d)?null:d}
function fmtDate(d){return d?new Intl.DateTimeFormat("fr-FR",{day:"2-digit",month:"short",year:"numeric"}).format(d):""}
function fmtTime(d){return d?new Intl.DateTimeFormat("fr-FR",{hour:"2-digit",minute:"2-digit"}).format(d):""}
function parseXml(xml){
 const doc=new DOMParser().parseFromString(xml,"application/xml");
 if(doc.querySelector("parsererror"))throw Error("Le fichier XML semble invalide.");
 const nodes=[...doc.getElementsByTagName("sms"),...doc.getElementsByTagName("mms")];
 if(!nodes.length)throw Error("Aucun SMS ou MMS trouvé dans ce fichier.");
 return nodes.map((n,i)=>{
  const type=n.getAttribute("type"), address=cleanNumber(n.getAttribute("address"));
  const date=dateOf(n.getAttribute("date")); const isMms=n.tagName.toLowerCase()==="mms";
  let body=n.getAttribute("body")||"", attachments=[];
  if(isMms){
   const parts=[...n.getElementsByTagName("part")];
   for(const p of parts){
    const ct=p.getAttribute("ct")||"", text=p.getAttribute("text"), data=p.getAttribute("data");
    if(ct.startsWith("text/")&&text)body+=(body?"\n":"")+text;
    else if(data){try{const raw=atob(data.replace(/\s/g,""));const bytes=Uint8Array.from(raw,c=>c.charCodeAt(0));attachments.push({type:ct||"application/octet-stream",dataUrl:URL.createObjectURL(new Blob([bytes],{type:ct||"application/octet-stream"})),name:p.getAttribute("cl")||"pièce jointe"});}catch{}}
   }
   const addrs=[...n.getElementsByTagName("addr")].map(a=>a.getAttribute("address")).filter(Boolean);
   if(address==="Inconnu"&&addrs.length){} 
  }
  return {id:i,address,body:body|| (attachments.length?"Média":""),date,kind:isMms?"mms":"sms",out:type==="2",attachments};
 }).sort((a,b)=>(a.date?.getTime()||0)-(b.date?.getTime()||0));
}
function groupMessages(msgs){
 const map=new Map();
 for(const m of msgs){const key=m.address; if(!map.has(key))map.set(key,[]);map.get(key).push(m)}
 return [...map.entries()].map(([address,messages])=>({address,messages,last:messages[messages.length-1]})).sort((a,b)=>(b.last.date?.getTime()||0)-(a.last.date?.getTime()||0));
}
async function importFile(file){
 if(!file)return;toast("Lecture de la sauvegarde…");
 try{const xml=await file.text();const msgs=parseXml(xml);await save("messages",msgs);await save("filename",file.name);allMessages=msgs;chats=groupMessages(msgs);selected=null;render();toast(`${msgs.length} messages importés`)}
 catch(e){toast(e.message||"Erreur pendant l'import")}
}
function render(){
 $("welcome").hidden=allMessages.length>0;$("workspace").hidden=!allMessages.length;
 $("chatCount").textContent=chats.length.toString();renderList();
}
function renderList(){
 const q=$("search").value.toLocaleLowerCase("fr");const list=$("chatList");list.innerHTML="";
 const filtered=chats.filter(c=>c.address.toLocaleLowerCase("fr").includes(q)||c.messages.some(m=>m.body.toLocaleLowerCase("fr").includes(q)));
 for(const c of filtered){
  const item=document.createElement("div");item.className="chat-item"+(selected===c.address?" active":"");
  const av=document.createElement("div");av.className="avatar";av.textContent=(c.address.replace(/\D/g,"").slice(-2)||"?");
  const meta=document.createElement("div");meta.className="chat-meta";const line=document.createElement("div");line.className="chat-line";
  const name=document.createElement("span");name.className="chat-name";name.textContent=c.address;
  const dt=document.createElement("span");dt.className="chat-date";dt.textContent=fmtDate(c.last.date);
  const preview=document.createElement("div");preview.className="chat-preview";preview.textContent=(c.last.out?"Vous : ":"")+c.last.body;
  line.append(name,dt);meta.append(line,preview);item.append(av,meta);item.onclick=()=>openChat(c.address);list.append(item);
 }
}
function openChat(address){
 selected=address;const c=chats.find(x=>x.address===address);if(!c)return;
 $("emptyChat").hidden=true;$("chatView").hidden=false;$("chatTitle").textContent=address;$("chatSubtitle").textContent=`${c.messages.length} messages`;
 $("messages").innerHTML="";let lastDay="";
 for(const m of c.messages){
  const day=fmtDate(m.date);if(day!==lastDay){const sep=document.createElement("div");sep.className="day-divider";sep.textContent=day||"Date inconnue";$("messages").append(sep);lastDay=day}
  const bubble=document.createElement("div");bubble.className="msg "+(m.out?"out":"in");bubble.textContent=m.body||"";
  for(const a of m.attachments||[]){if(a.type.startsWith("image/")){const img=document.createElement("img");img.className="attachment";img.src=a.dataUrl;img.alt="Image MMS";bubble.append(img)}else{const link=document.createElement("a");link.className="attachment-link";link.href=a.dataUrl;link.download=a.name;link.textContent="Télécharger "+a.name;bubble.append(link)}}
  const time=document.createElement("span");time.className="msg-time";time.textContent=fmtTime(m.date);bubble.append(time);$("messages").append(bubble);
 }
 $("messages").scrollTop=$("messages").scrollHeight;renderList();
 if(innerWidth<=700)$("workspace").querySelector(".conversation").classList.add("mobile-open");
}
$("importBtn").onclick=$("welcomeImport").onclick=()=>$("fileInput").click();
$("fileInput").onchange=e=>importFile(e.target.files[0]);
$("search").oninput=renderList;
$("backBtn").onclick=()=>{$("workspace").querySelector(".conversation").classList.remove("mobile-open")};
$("exportBtn").onclick=async()=>{const data=JSON.stringify({messages:allMessages.map(m=>({...m,attachments:[]})),filename:await read("filename")},null,2);const a=document.createElement("a");a.href=URL.createObjectURL(new Blob([data],{type:"application/json"}));a.download="archives-sms.json";a.click();URL.revokeObjectURL(a.href);toast("Export JSON préparé")};
$("clearBtn").onclick=async()=>{if(!confirm("Effacer toutes les conversations stockées sur cet appareil ? Cette action est irréversible."))return;await save("messages",[]);allMessages=[];chats=[];selected=null;render();toast("Archive effacée")};

// Modal help
function openHelpModal(){$("helpModal").hidden=false;}
function closeHelpModal(){$("helpModal").hidden=true;}
$("helpBtn").onclick=openHelpModal;
$("closeHelp").onclick=closeHelpModal;
$("helpModal").onclick=e=>{if(e.target===$("helpModal"))closeHelpModal()};

// PWA Install
let deferredPrompt;
function showInstallBtn(){$("installBtn").hidden=false;}
function hideInstallBtn(){$("installBtn").hidden=true;}
$("installBtn").onclick=async()=>{if(deferredPrompt){deferredPrompt.prompt();const{outcome}=await deferredPrompt.userChoice;if(outcome==="accepted"){toast("Installation en cours...");hideInstallBtn();}deferredPrompt=null;}};

window.addEventListener("beforeinstallprompt",e=>{e.preventDefault();deferredPrompt=e;showInstallBtn();});
window.addEventListener("appinstalled",()=>{toast("App installée !");hideInstallBtn();deferredPrompt=null;});

(async()=>{try{db=await openDB();allMessages=await read("messages")||[];chats=groupMessages(allMessages);render()}catch(e){toast("Stockage local indisponible dans ce navigateur")}})();
if("serviceWorker" in navigator && location.protocol.startsWith("http"))navigator.serviceWorker.register("./sw.js").catch(()=>{});
