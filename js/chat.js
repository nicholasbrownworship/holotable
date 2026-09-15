let chatUnsub = null;
let isInitialChatLoad = true;
let unreadChatCount = 0;

function isChatTabActive() {
  return !document.getElementById("chat-panel-view").classList.contains("hidden");
}

function isFloatingChatOpen() {
  return !document.getElementById("floating-chat-panel").classList.contains("hidden");
}

function isChatVisible() {
  return isChatTabActive() || isFloatingChatOpen();
}

function renderChatMessages(messages) {
  const html = messages.map((m) => `
    <li class="chat-message">
      <strong>${m.senderName}:</strong> <span>${escapeHtml(m.text)}</span>
    </li>
  `).join("");

  const fullLog = document.getElementById("full-chat-log");
  const floatingLog = document.getElementById("floating-chat-log");
  fullLog.innerHTML = html;
  floatingLog.innerHTML = html;
  fullLog.scrollTop = fullLog.scrollHeight;
  floatingLog.scrollTop = floatingLog.scrollHeight;
}

function showChatToast(message) {
  const toast = document.getElementById("floating-chat-toast");
  toast.textContent = `${message.senderName}: ${message.text}`;
  toast.classList.remove("hidden");
  clearTimeout(toast._hideTimer);
  toast._hideTimer = setTimeout(() => toast.classList.add("hidden"), 4000);
}

function updateUnreadBadge() {
  const badge = document.getElementById("floating-chat-badge");
  if (unreadChatCount > 0) {
    badge.textContent = unreadChatCount;
    badge.classList.remove("hidden");
  } else {
    badge.classList.add("hidden");
  }
}

function markChatRead() {
  unreadChatCount = 0;
  updateUnreadBadge();
}

function sendChatMessage(text) {
  if (!text.trim() || !activeCampaignId) return;
  db.collection("campaigns").doc(activeCampaignId).collection("messages").add({
    senderUid: auth.currentUser.uid,
    senderName: currentUserProfile.displayName,
    text: text.trim(),
    createdAt: firebase.firestore.FieldValue.serverTimestamp()
  });
}

document.getElementById("full-chat-form").addEventListener("submit", (e) => {
  e.preventDefault();
  const input = document.getElementById("full-chat-input");
  sendChatMessage(input.value);
  input.value = "";
});

document.getElementById("floating-chat-form").addEventListener("submit", (e) => {
  e.preventDefault();
  const input = document.getElementById("floating-chat-input");
  sendChatMessage(input.value);
  input.value = "";
});

document.getElementById("floating-chat-toggle").addEventListener("click", () => {
  document.getElementById("floating-chat-panel").classList.toggle("hidden");
  document.getElementById("floating-chat-toast").classList.add("hidden");
  if (isFloatingChatOpen()) markChatRead();
});

document.getElementById("floating-chat-close").addEventListener("click", () => {
  document.getElementById("floating-chat-panel").classList.add("hidden");
});

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

function startChat(campaignId) {
  stopChat();
  isInitialChatLoad = true;
  unreadChatCount = 0;
  updateUnreadBadge();
  document.getElementById("floating-chat-panel").classList.add("hidden");
  document.getElementById("floating-chat").classList.remove("hidden");

  chatUnsub = db.collection("campaigns").doc(campaignId).collection("messages")
    .orderBy("createdAt", "desc")
    .limit(100)
    .onSnapshot((snapshot) => {
      const messages = [];
      snapshot.forEach((doc) => messages.push(doc.data()));
      messages.reverse();
      renderChatMessages(messages);

      if (!isInitialChatLoad) {
        snapshot.docChanges().forEach((change) => {
          if (change.type === "added" && !isChatVisible()) {
            unreadChatCount += 1;
            showChatToast(change.doc.data());
          }
        });
        updateUnreadBadge();
      }
      isInitialChatLoad = false;
    });
}

function stopChat() {
  if (chatUnsub) { chatUnsub(); chatUnsub = null; }
  document.getElementById("floating-chat").classList.add("hidden");
}
