const DEFAULT_ZONES = ["Engaged", "Short", "Medium", "Long", "Extreme"];
const MAX_IMAGE_BYTES = 700000; // leaves headroom under Firestore's 1MB document cap

let campaignDocUnsub = null;
let sceneListUnsub = null;
let activeSceneUnsub = null;
let currentActiveSceneId = null;

// --- Compress an image file into a data URI small enough for a Firestore doc ---
function loadImageFromFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = e.target.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function drawToDataUri(img, maxWidth, quality) {
  const scale = Math.min(1, maxWidth / img.width);
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(img.width * scale);
  canvas.height = Math.round(img.height * scale);
  const ctx = canvas.getContext("2d");
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", quality);
}

async function compressImageFile(file) {
  const img = await loadImageFromFile(file);
  let width = 1200;
  let quality = 0.75;
  let dataUri = drawToDataUri(img, width, quality);
  let attempts = 0;

  while (dataUri.length > MAX_IMAGE_BYTES && attempts < 8) {
    if (quality > 0.4) {
      quality -= 0.1;
    } else {
      width = Math.round(width * 0.8);
      quality = 0.6;
    }
    dataUri = drawToDataUri(img, width, quality);
    attempts++;
  }
  return dataUri;
}

// --- Scene creation (GM) ---
document.getElementById("create-scene-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const name = document.getElementById("scene-name").value.trim();
  const fileInput = document.getElementById("scene-image-input");
  const statusEl = document.getElementById("scene-upload-status");
  const file = fileInput.files[0];
  if (!file) return;

  statusEl.textContent = "Compressing image...";
  try {
    const imageData = await compressImageFile(file);
    await db.collection("campaigns").doc(activeCampaignId).collection("scenes").add({
      name,
      imageData,
      zones: [...DEFAULT_ZONES],
      tokens: [],
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    statusEl.textContent = "Scene created.";
    e.target.reset();
    setTimeout(() => { statusEl.textContent = ""; }, 2000);
  } catch (err) {
    statusEl.textContent = "Couldn't process that image \u2014 try a smaller file.";
  }
});

// --- Scene list (GM: set active / delete) ---
function renderSceneList(scenes) {
  const el = document.getElementById("scene-list");
  el.innerHTML = scenes.map((s) => `
    <li>
      <div class="content-item-main">
        <strong>${s.name}</strong>
        ${s.id === currentActiveSceneId ? '<span class="tag">Active</span>' : ""}
      </div>
      <div class="scene-list-actions">
        <button class="secondary-btn small set-active-btn" data-id="${s.id}">Set active</button>
        <button class="delete-btn" data-id="${s.id}">Remove</button>
      </div>
    </li>
  `).join("");

  el.querySelectorAll(".set-active-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      db.collection("campaigns").doc(activeCampaignId).update({ activeSceneId: btn.dataset.id });
    });
  });
  el.querySelectorAll(".delete-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      if (confirm("Delete this scene?")) {
        db.collection("campaigns").doc(activeCampaignId).collection("scenes").doc(btn.dataset.id).delete();
      }
    });
  });
}

// --- Active scene + tokens ---
function renderActiveScene(scene) {
  const noneEl = document.getElementById("no-active-scene");
  const contentEl = document.getElementById("active-scene-content");
  latestSceneData = scene;

  if (!scene) {
    noneEl.classList.remove("hidden");
    contentEl.classList.add("hidden");
    return;
  }

  noneEl.classList.add("hidden");
  contentEl.classList.remove("hidden");
  document.getElementById("active-scene-name").textContent = scene.name;
  document.getElementById("active-scene-image").src = scene.imageData;
  renderInitiative(scene);

  const uid = auth.currentUser.uid;
  const myToken = (scene.tokens || []).find((t) => t.ownerUid === uid);
  document.getElementById("join-scene-bar").classList.toggle("hidden", activeRole === "gm" || !!myToken);

  const zones = scene.zones || DEFAULT_ZONES;
  const tokens = scene.tokens || [];

  document.getElementById("zone-columns").innerHTML = zones.map((zone) => {
    const zoneTokens = tokens.filter((t) => t.zone === zone);
    return `
      <div class="zone-row">
        <h4>${zone}</h4>
        <div class="zone-tokens">
          ${zoneTokens.map((t) => renderToken(t, zones)).join("") || '<p class="zone-empty">\u2014</p>'}
        </div>
      </div>
    `;
  }).join("");

  document.querySelectorAll(".token-zone-select").forEach((sel) => {
    sel.addEventListener("change", (e) => moveToken(e.target.dataset.tokenId, e.target.value));
  });
  document.querySelectorAll(".token-vital-input").forEach((input) => {
    input.addEventListener("change", (e) => updateTokenVital(e.target.dataset.tokenId, e.target.dataset.field, e.target.value));
  });
  document.querySelectorAll(".remove-token-btn").forEach((btn) => {
    btn.addEventListener("click", () => removeToken(btn.dataset.tokenId));
  });
}

function renderToken(token, zones) {
  const uid = auth.currentUser?.uid;
  const canControl = activeRole === "gm" || token.ownerUid === uid;
  const zoneOptions = zones.map((z) => `<option value="${z}" ${z === token.zone ? "selected" : ""}>${z}</option>`).join("");

  const vitalsHtml = !token.isNPC ? `
    <div class="token-vitals">
      <label class="token-vital">
        <span>W</span>
        <input type="number" min="0" class="token-vital-input" data-token-id="${token.id}" data-field="currentWounds"
          value="${token.currentWounds ?? 0}" ${canControl ? "" : "disabled"} />
        <span class="token-vital-max">/ ${token.maxWounds ?? "?"}</span>
      </label>
      <label class="token-vital">
        <span>S</span>
        <input type="number" min="0" class="token-vital-input" data-token-id="${token.id}" data-field="currentStrain"
          value="${token.currentStrain ?? 0}" ${canControl ? "" : "disabled"} />
        <span class="token-vital-max">/ ${token.maxStrain ?? "?"}</span>
      </label>
    </div>
  ` : "";

  return `
    <div class="token-chip ${token.isNPC ? "token-npc" : "token-pc"}">
      <span class="token-name">${token.name}</span>
      ${vitalsHtml}
      ${canControl ? `
        <select class="token-zone-select" data-token-id="${token.id}">${zoneOptions}</select>
        ${activeRole === "gm" ? `<button class="remove-token-btn" data-token-id="${token.id}">&times;</button>` : ""}
      ` : ""}
    </div>
  `;
}

// --- Click-to-ping on the scene image ---
let pingsUnsub = null;
const renderedPingIds = new Set();

document.getElementById("ping-layer").addEventListener("click", (e) => {
  if (!currentActiveSceneId) return;
  const rect = e.currentTarget.getBoundingClientRect();
  const xPct = ((e.clientX - rect.left) / rect.width) * 100;
  const yPct = ((e.clientY - rect.top) / rect.height) * 100;

  db.collection("campaigns").doc(activeCampaignId).collection("scenes").doc(currentActiveSceneId)
    .collection("pings").add({
      x: xPct,
      y: yPct,
      name: currentUserProfile.displayName,
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    })
    .then((ref) => {
      setTimeout(() => ref.delete().catch(() => {}), 2500);
    });
});

function startPings(campaignId, sceneId) {
  stopPings();
  renderedPingIds.clear();
  pingsUnsub = db.collection("campaigns").doc(campaignId).collection("scenes").doc(sceneId).collection("pings")
    .onSnapshot((snapshot) => {
      snapshot.docChanges().forEach((change) => {
        if (change.type === "added" && !renderedPingIds.has(change.doc.id)) {
          renderedPingIds.add(change.doc.id);
          renderPingMarker(change.doc.data());
        }
      });
    });
}

function stopPings() {
  if (pingsUnsub) { pingsUnsub(); pingsUnsub = null; }
  document.getElementById("ping-layer").innerHTML = "";
}

function renderPingMarker(ping) {
  const layer = document.getElementById("ping-layer");
  const marker = document.createElement("div");
  marker.className = "ping-marker";
  marker.style.left = `${ping.x}%`;
  marker.style.top = `${ping.y}%`;
  marker.innerHTML = `<span class="ping-dot"></span><span class="ping-label">${ping.name}</span>`;
  layer.appendChild(marker);
  setTimeout(() => marker.remove(), 2200);
}

// --- Text chat ---
let chatUnsub = null;

document.getElementById("chat-form").addEventListener("submit", (e) => {
  e.preventDefault();
  const input = document.getElementById("chat-input");
  const text = input.value.trim();
  if (!text || !activeCampaignId) return;
  db.collection("campaigns").doc(activeCampaignId).collection("messages").add({
    senderUid: auth.currentUser.uid,
    senderName: currentUserProfile.displayName,
    text,
    createdAt: firebase.firestore.FieldValue.serverTimestamp()
  });
  input.value = "";
});

function startChat(campaignId) {
  stopChat();
  chatUnsub = db.collection("campaigns").doc(campaignId).collection("messages")
    .orderBy("createdAt", "desc")
    .limit(100)
    .onSnapshot((snapshot) => {
      const messages = [];
      snapshot.forEach((doc) => messages.push(doc.data()));
      messages.reverse();
      const logEl = document.getElementById("chat-log");
      logEl.innerHTML = messages.map((m) => `
        <li class="chat-message">
          <strong>${m.senderName}:</strong> <span>${escapeHtml(m.text)}</span>
        </li>
      `).join("");
      logEl.scrollTop = logEl.scrollHeight;
    });
}

function stopChat() {
  if (chatUnsub) { chatUnsub(); chatUnsub = null; }
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

// --- Encounter builder (GM: pick players + add enemies, place into starting zones) ---
let builderEnemyRows = [];

async function openEncounterBuilder() {
  const campaignDoc = await db.collection("campaigns").doc(activeCampaignId).get();
  const memberIds = (campaignDoc.data() || {}).memberIds || [];
  const gmId = (campaignDoc.data() || {}).gmId;

  const profiles = await Promise.all(
    memberIds.filter((id) => id !== gmId).map(async (uid) => {
      const userDoc = await db.collection("users").doc(uid).get();
      return { uid, displayName: userDoc.exists ? userDoc.data().displayName : uid };
    })
  );

  const zones = currentSceneZones();
  const playersEl = document.getElementById("encounter-builder-players");
  playersEl.innerHTML = profiles.map((p) => `
    <div class="encounter-row">
      <label class="checkbox-field">
        <input type="checkbox" class="builder-player-check" data-uid="${p.uid}" data-name="${p.displayName}" checked />
        ${p.displayName}
      </label>
      <select class="builder-player-zone" data-uid="${p.uid}">
        ${zones.map((z) => `<option value="${z}">${z}</option>`).join("")}
      </select>
    </div>
  `).join("") || `<p class="library-note">No players in this campaign yet.</p>`;

  builderEnemyRows = [];
  renderEnemyRows();

  document.getElementById("encounter-builder").classList.remove("hidden");
}

function renderEnemyRows() {
  const zones = currentSceneZones();
  const el = document.getElementById("encounter-builder-enemies");
  el.innerHTML = builderEnemyRows.map((row, i) => `
    <div class="encounter-row">
      <input type="text" class="builder-enemy-name" data-index="${i}" placeholder="Enemy name" value="${row.name}" />
      <input type="text" class="builder-enemy-type" data-index="${i}" placeholder="Type (shared slot)" value="${row.enemyType}" />
      <select class="builder-enemy-zone" data-index="${i}">
        ${zones.map((z) => `<option value="${z}" ${z === row.zone ? "selected" : ""}>${z}</option>`).join("")}
      </select>
      <button type="button" class="remove-row-btn builder-remove-enemy" data-index="${i}">&times;</button>
    </div>
  `).join("");

  el.querySelectorAll(".builder-enemy-name").forEach((input) => {
    input.addEventListener("input", (e) => { builderEnemyRows[e.target.dataset.index].name = e.target.value; });
  });
  el.querySelectorAll(".builder-enemy-type").forEach((input) => {
    input.addEventListener("input", (e) => { builderEnemyRows[e.target.dataset.index].enemyType = e.target.value; });
  });
  el.querySelectorAll(".builder-enemy-zone").forEach((sel) => {
    sel.addEventListener("change", (e) => { builderEnemyRows[e.target.dataset.index].zone = e.target.value; });
  });
  el.querySelectorAll(".builder-remove-enemy").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      builderEnemyRows.splice(Number(e.target.dataset.index), 1);
      renderEnemyRows();
    });
  });
}

document.getElementById("start-encounter-btn").addEventListener("click", openEncounterBuilder);
document.getElementById("cancel-encounter-btn").addEventListener("click", () => {
  document.getElementById("encounter-builder").classList.add("hidden");
});
document.getElementById("add-enemy-row-btn").addEventListener("click", () => {
  builderEnemyRows.push({ name: "", enemyType: "", zone: currentSceneZones()[0] });
  renderEnemyRows();
});

document.getElementById("begin-encounter-btn").addEventListener("click", async () => {
  const playerEntries = Array.from(document.querySelectorAll(".builder-player-check"))
    .filter((cb) => cb.checked)
    .map((cb) => ({
      uid: cb.dataset.uid,
      name: cb.dataset.name,
      zone: document.querySelector(`.builder-player-zone[data-uid="${cb.dataset.uid}"]`).value
    }));

  // Pull each player's Wound/Strain Threshold from their sheet so new tokens start with real max values
  const thresholdsByUid = {};
  await Promise.all(playerEntries.map(async (p) => {
    const charDoc = await db.collection("campaigns").doc(activeCampaignId).collection("characters").doc(p.uid).get();
    const data = charDoc.exists ? charDoc.data() : {};
    thresholdsByUid[p.uid] = { maxWounds: data.woundThreshold || 0, maxStrain: data.strainThreshold || 0 };
  }));

  const enemyEntries = builderEnemyRows
    .filter((row) => row.name.trim())
    .map((row) => ({ ...row, enemyType: row.enemyType.trim() || row.name.trim() }));

  let pcTokenIds = [];
  let enemyTypeToTokenIds = {};

  await withActiveScene((tokens) => {
    const updated = [...tokens];
    pcTokenIds = [];
    enemyTypeToTokenIds = {};

    playerEntries.forEach((p) => {
      let token = updated.find((t) => t.ownerUid === p.uid);
      if (token) {
        token.zone = p.zone;
      } else {
        const { maxWounds, maxStrain } = thresholdsByUid[p.uid];
        token = { id: `pc-${p.uid}`, name: p.name, ownerUid: p.uid, isNPC: false, zone: p.zone, maxWounds, maxStrain, currentWounds: 0, currentStrain: 0 };
        updated.push(token);
      }
      pcTokenIds.push(token.id);
    });

    enemyEntries.forEach((e) => {
      const token = { id: `npc-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, name: e.name.trim(), ownerUid: null, isNPC: true, zone: e.zone, enemyType: e.enemyType };
      updated.push(token);
      (enemyTypeToTokenIds[e.enemyType] ||= []).push(token.id);
    });

    return updated;
  });

  // One slot per PC (occupant chosen live each round) + one slot per distinct enemy type (fixed membership)
  const slots = [
    ...pcTokenIds.map(() => ({ type: "pc", occupantTokenId: null })),
    ...Object.entries(enemyTypeToTokenIds).map(([enemyType, tokenIds]) => ({ type: "npc", enemyType, tokenIds }))
  ];

  await setEncounter({ active: true, round: 1, currentSlotIndex: 0, slots });
  document.getElementById("encounter-builder").classList.add("hidden");
});

function currentSceneZones() {
  return latestSceneData ? (latestSceneData.zones || DEFAULT_ZONES) : DEFAULT_ZONES;
}

async function setEncounter(encounter) {
  if (!currentActiveSceneId) return;
  await db.collection("campaigns").doc(activeCampaignId).collection("scenes").doc(currentActiveSceneId)
    .update({ encounter });
}

document.getElementById("next-turn-btn").addEventListener("click", async () => {
  const enc = latestSceneData?.encounter;
  if (!enc || !enc.slots.length) return;

  const current = enc.slots[enc.currentSlotIndex];
  if (current.type === "pc" && !current.occupantTokenId) {
    alert("Pick who's acting in this slot before moving on.");
    return;
  }

  let nextIndex = enc.currentSlotIndex + 1;
  let round = enc.round;
  let slots = enc.slots;

  if (nextIndex >= slots.length) {
    nextIndex = 0;
    round += 1;
    slots = slots.map((s) => s.type === "pc" ? { ...s, occupantTokenId: null } : s);
  }

  await setEncounter({ ...enc, slots, currentSlotIndex: nextIndex, round });
});

document.getElementById("end-encounter-btn").addEventListener("click", async () => {
  if (confirm("End this encounter? The initiative order will be cleared.")) {
    await setEncounter({ active: false, round: 1, currentSlotIndex: 0, slots: [] });
  }
});

function moveInitiative(index, direction) {
  const enc = latestSceneData?.encounter;
  if (!enc) return;
  const slots = [...enc.slots];
  const target = index + direction;
  if (target < 0 || target >= slots.length) return;
  [slots[index], slots[target]] = [slots[target], slots[index]];
  setEncounter({ ...enc, slots });
}

function assignSlotOccupant(slotIndex, tokenId) {
  const enc = latestSceneData?.encounter;
  if (!enc) return;
  const slots = enc.slots.map((s, i) => i === slotIndex ? { ...s, occupantTokenId: tokenId || null } : s);
  setEncounter({ ...enc, slots });
}

function renderInitiative(scene) {
  const enc = scene.encounter;
  const listEl = document.getElementById("initiative-list");
  const startBtn = document.getElementById("start-encounter-btn");
  const nextBtn = document.getElementById("next-turn-btn");
  const endBtn = document.getElementById("end-encounter-btn");
  const roundLabel = document.getElementById("round-label");

  if (!enc || !enc.active || !enc.slots.length) {
    listEl.innerHTML = `<li class="initiative-empty">No active encounter.</li>`;
    startBtn.classList.remove("hidden");
    nextBtn.classList.add("hidden");
    endBtn.classList.add("hidden");
    roundLabel.classList.add("hidden");
    return;
  }

  startBtn.classList.add("hidden");
  nextBtn.classList.remove("hidden");
  endBtn.classList.remove("hidden");
  roundLabel.classList.remove("hidden");
  roundLabel.textContent = `Round ${enc.round}`;

  const tokensById = {};
  (scene.tokens || []).forEach((t) => { tokensById[t.id] = t; });

  // PCs already occupying a slot this round aren't offered again in other pickers
  const usedThisRound = new Set(enc.slots.filter((s) => s.type === "pc" && s.occupantTokenId).map((s) => s.occupantTokenId));
  const allPcTokens = (scene.tokens || []).filter((t) => !t.isNPC);

  listEl.innerHTML = enc.slots.map((slot, i) => {
    const isCurrent = i === enc.currentSlotIndex;

    if (slot.type === "npc") {
      const names = slot.tokenIds.map((id) => tokensById[id]?.name).filter(Boolean).join(", ");
      return `
        <li class="initiative-entry token-npc ${isCurrent ? "current-turn" : ""}">
          <span class="initiative-name">${slot.enemyType} <em class="slot-members">(${names})</em></span>
          <span class="gm-only initiative-reorder">
            <button type="button" class="reorder-btn" data-index="${i}" data-dir="-1">&uarr;</button>
            <button type="button" class="reorder-btn" data-index="${i}" data-dir="1">&darr;</button>
          </span>
        </li>
      `;
    }

    // PC slot
    const occupant = slot.occupantTokenId ? tokensById[slot.occupantTokenId] : null;
    const availableForThisSlot = allPcTokens.filter((t) => !usedThisRound.has(t.id) || t.id === slot.occupantTokenId);

    return `
      <li class="initiative-entry token-pc ${isCurrent ? "current-turn" : ""}">
        <span class="initiative-name">
          ${occupant ? occupant.name : '<em class="slot-unassigned">Choose who acts\u2026</em>'}
        </span>
        <select class="pc-slot-select" data-slot-index="${i}">
          <option value="">\u2014</option>
          ${availableForThisSlot.map((t) => `<option value="${t.id}" ${t.id === slot.occupantTokenId ? "selected" : ""}>${t.name}</option>`).join("")}
        </select>
        <span class="gm-only initiative-reorder">
          <button type="button" class="reorder-btn" data-index="${i}" data-dir="-1">&uarr;</button>
          <button type="button" class="reorder-btn" data-index="${i}" data-dir="1">&darr;</button>
        </span>
      </li>
    `;
  }).join("");

  listEl.querySelectorAll(".reorder-btn").forEach((btn) => {
    btn.addEventListener("click", () => moveInitiative(Number(btn.dataset.index), Number(btn.dataset.dir)));
  });
  listEl.querySelectorAll(".pc-slot-select").forEach((sel) => {
    sel.addEventListener("change", (e) => assignSlotOccupant(Number(e.target.dataset.slotIndex), e.target.value));
  });
}

let latestSceneData = null;

async function withActiveScene(mutateFn) {
  if (!currentActiveSceneId) return;
  const ref = db.collection("campaigns").doc(activeCampaignId).collection("scenes").doc(currentActiveSceneId);
  await db.runTransaction(async (tx) => {
    const doc = await tx.get(ref);
    const data = doc.data();
    const tokens = mutateFn([...(data.tokens || [])]);
    tx.update(ref, { tokens });
  });
}

function moveToken(tokenId, newZone) {
  withActiveScene((tokens) => tokens.map((t) => t.id === tokenId ? { ...t, zone: newZone } : t));
}

function updateTokenVital(tokenId, field, value) {
  const num = Math.max(0, Number(value) || 0);
  withActiveScene((tokens) => tokens.map((t) => t.id === tokenId ? { ...t, [field]: num } : t));
}

async function removeToken(tokenId) {
  if (!currentActiveSceneId) return;
  const ref = db.collection("campaigns").doc(activeCampaignId).collection("scenes").doc(currentActiveSceneId);

  await db.runTransaction(async (tx) => {
    const doc = await tx.get(ref);
    const data = doc.data();
    const tokens = (data.tokens || []).filter((t) => t.id !== tokenId);
    const update = { tokens };

    const enc = data.encounter;
    if (enc && enc.active && enc.slots?.length) {
      let currentSlotIndex = enc.currentSlotIndex;
      const newSlots = [];

      enc.slots.forEach((slot, i) => {
        if (slot.type === "npc") {
          const remainingIds = slot.tokenIds.filter((id) => id !== tokenId);
          if (remainingIds.length === 0) {
            // whole type wiped out — drop the slot entirely
            if (i < currentSlotIndex) currentSlotIndex -= 1;
            return;
          }
          newSlots.push({ ...slot, tokenIds: remainingIds });
        } else {
          newSlots.push(slot.occupantTokenId === tokenId ? { ...slot, occupantTokenId: null } : slot);
        }
      });

      if (newSlots.length === 0) {
        update.encounter = { active: false, round: 1, currentSlotIndex: 0, slots: [] };
      } else {
        if (currentSlotIndex >= newSlots.length) currentSlotIndex = newSlots.length - 1;
        update.encounter = { ...enc, slots: newSlots, currentSlotIndex };
      }
    }

    tx.update(ref, update);
  });
}

document.getElementById("join-scene-btn").addEventListener("click", () => {
  const uid = auth.currentUser.uid;
  const charName = document.getElementById("char-name").value.trim();
  const name = charName || currentUserProfile.displayName;
  const maxWounds = Number(document.getElementById("char-wound-threshold").value) || 0;
  const maxStrain = Number(document.getElementById("char-strain-threshold").value) || 0;
  withActiveScene((tokens) => [...tokens, {
    id: `${uid}-${Date.now()}`,
    name,
    ownerUid: uid,
    isNPC: false,
    zone: DEFAULT_ZONES[0],
    maxWounds,
    maxStrain,
    currentWounds: 0,
    currentStrain: 0
  }]);
});

document.getElementById("add-npc-form").addEventListener("submit", (e) => {
  e.preventDefault();
  const nameInput = document.getElementById("npc-name");
  const name = nameInput.value.trim();
  withActiveScene((tokens) => [...tokens, {
    id: `npc-${Date.now()}`,
    name,
    ownerUid: null,
    isNPC: true,
    zone: DEFAULT_ZONES[0]
  }]);
  nameInput.value = "";
});

// --- Wire up listeners for a campaign ---
function startMapView(campaignId) {
  stopMapView();

  sceneListUnsub = db.collection("campaigns").doc(campaignId).collection("scenes")
    .orderBy("createdAt")
    .onSnapshot((snapshot) => {
      const scenes = [];
      snapshot.forEach((doc) => scenes.push({ id: doc.id, ...doc.data() }));
      renderSceneList(scenes);
    });

  campaignDocUnsub = db.collection("campaigns").doc(campaignId).onSnapshot((doc) => {
    const data = doc.data() || {};
    currentActiveSceneId = data.activeSceneId || null;

    if (activeSceneUnsub) activeSceneUnsub();
    stopPings();
    if (!currentActiveSceneId) {
      renderActiveScene(null);
      return;
    }
    activeSceneUnsub = db.collection("campaigns").doc(campaignId).collection("scenes").doc(currentActiveSceneId)
      .onSnapshot((sceneDoc) => {
        renderActiveScene(sceneDoc.exists ? { id: sceneDoc.id, ...sceneDoc.data() } : null);
      });
    startPings(campaignId, currentActiveSceneId);
  });

  startChat(campaignId);
}

function stopMapView() {
  if (sceneListUnsub) { sceneListUnsub(); sceneListUnsub = null; }
  if (campaignDocUnsub) { campaignDocUnsub(); campaignDocUnsub = null; }
  if (activeSceneUnsub) { activeSceneUnsub(); activeSceneUnsub = null; }
  stopPings();
  stopChat();
  currentActiveSceneId = null;
  latestSceneData = null;
  document.getElementById("encounter-builder").classList.add("hidden");
}
