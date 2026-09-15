let activeCampaignId = null;
let activeRole = null;
let activeCharacterUnsub = null;

// Repeatable list state for gear/weapons/armor while editing
let sheetState = { gear: [], weapons: [], armor: [], skillRanks: {}, talentIds: [], specializationIds: [] };

function enterCampaign(campaignId, role) {
  activeCampaignId = campaignId;
  activeRole = role;
  document.getElementById("campaign-screen-view").classList.add("hidden");
  document.getElementById("campaign-workspace-view").classList.remove("hidden");
  document.getElementById("workspace-role-label").textContent = role === "gm" ? "GM view" : "Player view";
  document.body.classList.toggle("is-gm", role === "gm");
  loadCharacterSheet(campaignId);
  startRollLog(campaignId);
  startMapView(campaignId);
  startChat(campaignId);
}

function exitCampaign() {
  if (activeCharacterUnsub) activeCharacterUnsub();
  stopRollLog();
  stopMapView();
  stopChat();
  activeCampaignId = null;
  activeRole = null;
  document.getElementById("campaign-workspace-view").classList.add("hidden");
  document.getElementById("campaign-screen-view").classList.remove("hidden");
}

document.getElementById("leave-campaign-btn").addEventListener("click", exitCampaign);

// --- Populate dropdowns any time content changes ---
function refreshCharacterDropdowns() {
  const speciesSelect = document.getElementById("char-species");
  const careerSelect = document.getElementById("char-career");
  const specSelect = document.getElementById("char-specializations");
  const talentSelect = document.getElementById("char-talents-select");
  const weaponSkillSelects = document.querySelectorAll(".weapon-skill-select");

  if (speciesSelect) {
    speciesSelect.innerHTML = `<option value="">-- Select species --</option>` +
      contentCache.species.map((s) => `<option value="${s.id}">${s.name}</option>`).join("");
  }
  if (careerSelect) {
    careerSelect.innerHTML = `<option value="">-- Select career --</option>` +
      contentCache.careers.map((c) => `<option value="${c.id}">${c.name}</option>`).join("");
  }
  if (specSelect) {
    specSelect.innerHTML = contentCache.specializations.map((sp) => `<option value="${sp.id}">${sp.name}</option>`).join("");
  }
  if (talentSelect) {
    talentSelect.innerHTML = contentCache.talents.map((t) => `<option value="${t.id}">${t.name}${t.ranked ? " (Ranked)" : ""}</option>`).join("");
  }
  weaponSkillSelects.forEach((sel) => {
    const current = sel.value;
    sel.innerHTML = `<option value="">-- skill --</option>` + contentCache.skills.map((s) => `<option value="${s.id}">${s.name}</option>`).join("");
    sel.value = current;
  });

  renderSkillRanksTable();
}

// --- Skill ranks table, built from the skills content library ---
function renderSkillRanksTable() {
  const container = document.getElementById("char-skills-table");
  if (!container) return;

  const careerId = document.getElementById("char-career")?.value;
  const career = contentCache.careers.find((c) => c.id === careerId);
  const careerSkillIds = career ? career.careerSkillIds : [];

  container.innerHTML = contentCache.skills.map((skill) => {
    const isCareerSkill = careerSkillIds.includes(skill.id);
    const rank = sheetState.skillRanks[skill.id] || 0;
    return `
      <div class="skill-row ${isCareerSkill ? "career-skill" : ""}">
        <span class="skill-name">${skill.name} <em>(${skill.characteristic})</em></span>
        <input type="number" min="0" max="5" class="skill-rank-input" data-skill-id="${skill.id}" value="${rank}" />
      </div>
    `;
  }).join("");

  container.querySelectorAll(".skill-rank-input").forEach((input) => {
    input.addEventListener("input", (e) => {
      sheetState.skillRanks[e.target.dataset.skillId] = Number(e.target.value) || 0;
    });
  });
}

document.getElementById("char-career").addEventListener("change", renderSkillRanksTable);

// --- Repeatable rows: gear / weapons / armor ---
function renderRepeatableList(type) {
  const container = document.getElementById(`char-${type}-list`);
  const fieldSets = {
    gear: [["name", "Name"], ["encumbrance", "Encum."], ["description", "Description"]],
    armor: [["name", "Name"], ["soak", "Soak"], ["defense", "Defense"], ["encumbrance", "Encum."]]
  };

  if (type === "weapons") {
    container.innerHTML = sheetState.weapons.map((item, i) => `
      <div class="repeatable-row">
        <input type="text" placeholder="Name" value="${item.name || ""}" data-type="weapons" data-index="${i}" data-field="name" />
        <select class="weapon-skill-select" data-type="weapons" data-index="${i}" data-field="skillId"></select>
        <input type="text" placeholder="Damage" value="${item.damage || ""}" data-type="weapons" data-index="${i}" data-field="damage" />
        <input type="text" placeholder="Crit" value="${item.crit || ""}" data-type="weapons" data-index="${i}" data-field="crit" />
        <input type="text" placeholder="Range" value="${item.range || ""}" data-type="weapons" data-index="${i}" data-field="range" />
        <input type="text" placeholder="Special" value="${item.special || ""}" data-type="weapons" data-index="${i}" data-field="special" />
        <button type="button" class="remove-row-btn" data-type="weapons" data-index="${i}">&times;</button>
      </div>
    `).join("");
    container.querySelectorAll(".weapon-skill-select").forEach((sel) => {
      sel.innerHTML = `<option value="">-- skill --</option>` + contentCache.skills.map((s) => `<option value="${s.id}">${s.name}</option>`).join("");
      const idx = Number(sel.dataset.index);
      sel.value = sheetState.weapons[idx]?.skillId || "";
    });
  } else {
    const fields = fieldSets[type];
    container.innerHTML = sheetState[type].map((item, i) => `
      <div class="repeatable-row">
        ${fields.map(([key, label]) => `<input type="text" placeholder="${label}" value="${item[key] || ""}" data-type="${type}" data-index="${i}" data-field="${key}" />`).join("")}
        <button type="button" class="remove-row-btn" data-type="${type}" data-index="${i}">&times;</button>
      </div>
    `).join("");
  }
}

function addRepeatableRow(type) {
  const blank = type === "weapons"
    ? { name: "", skillId: "", damage: "", crit: "", range: "", special: "" }
    : type === "armor"
      ? { name: "", soak: "", defense: "", encumbrance: "" }
      : { name: "", encumbrance: "", description: "" };
  sheetState[type].push(blank);
  renderRepeatableList(type);
}

["gear", "weapons", "armor"].forEach((type) => {
  document.getElementById(`add-${type}-btn`).addEventListener("click", () => addRepeatableRow(type));
});

document.querySelectorAll(".repeatable-list").forEach((list) => {
  list.addEventListener("input", (e) => {
    const { type, index, field } = e.target.dataset;
    if (!type) return;
    sheetState[type][Number(index)][field] = e.target.value;
  });
  list.addEventListener("click", (e) => {
    if (e.target.classList.contains("remove-row-btn")) {
      const { type, index } = e.target.dataset;
      sheetState[type].splice(Number(index), 1);
      renderRepeatableList(type);
    }
  });
});

// --- Save / load the sheet ---
function collectSheetData() {
  return {
    name: document.getElementById("char-name").value.trim(),
    speciesId: document.getElementById("char-species").value,
    careerId: document.getElementById("char-career").value,
    specializationIds: Array.from(document.getElementById("char-specializations").selectedOptions).map((o) => o.value),
    talentIds: Array.from(document.getElementById("char-talents-select").selectedOptions).map((o) => o.value),
    characteristics: {
      brawn: Number(document.getElementById("char-brawn").value) || 0,
      agility: Number(document.getElementById("char-agility").value) || 0,
      intellect: Number(document.getElementById("char-intellect").value) || 0,
      cunning: Number(document.getElementById("char-cunning").value) || 0,
      willpower: Number(document.getElementById("char-willpower").value) || 0,
      presence: Number(document.getElementById("char-presence").value) || 0
    },
    woundThreshold: Number(document.getElementById("char-wound-threshold").value) || 0,
    strainThreshold: Number(document.getElementById("char-strain-threshold").value) || 0,
    soak: Number(document.getElementById("char-soak").value) || 0,
    defense: Number(document.getElementById("char-defense").value) || 0,
    forceRating: Number(document.getElementById("char-force-rating").value) || 0,
    motivation: document.getElementById("char-motivation").value.trim(),
    obligationDutyMorality: document.getElementById("char-obligation").value.trim(),
    credits: Number(document.getElementById("char-credits").value) || 0,
    encumbranceThreshold: Number(document.getElementById("char-encumbrance-threshold").value) || 0,
    xpTotal: Number(document.getElementById("char-xp-total").value) || 0,
    xpSpent: Number(document.getElementById("char-xp-spent").value) || 0,
    background: document.getElementById("char-background").value.trim(),
    skillRanks: sheetState.skillRanks,
    gear: sheetState.gear,
    weapons: sheetState.weapons,
    armor: sheetState.armor,
    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
  };
}

function populateSheetForm(data) {
  document.getElementById("char-name").value = data.name || "";
  document.getElementById("char-species").value = data.speciesId || "";
  document.getElementById("char-career").value = data.careerId || "";
  Array.from(document.getElementById("char-specializations").options).forEach((o) => {
    o.selected = (data.specializationIds || []).includes(o.value);
  });
  Array.from(document.getElementById("char-talents-select").options).forEach((o) => {
    o.selected = (data.talentIds || []).includes(o.value);
  });
  const c = data.characteristics || {};
  document.getElementById("char-brawn").value = c.brawn || "";
  document.getElementById("char-agility").value = c.agility || "";
  document.getElementById("char-intellect").value = c.intellect || "";
  document.getElementById("char-cunning").value = c.cunning || "";
  document.getElementById("char-willpower").value = c.willpower || "";
  document.getElementById("char-presence").value = c.presence || "";
  document.getElementById("char-wound-threshold").value = data.woundThreshold || "";
  document.getElementById("char-strain-threshold").value = data.strainThreshold || "";
  document.getElementById("char-soak").value = data.soak || "";
  document.getElementById("char-defense").value = data.defense || "";
  document.getElementById("char-force-rating").value = data.forceRating || "";
  document.getElementById("char-motivation").value = data.motivation || "";
  document.getElementById("char-obligation").value = data.obligationDutyMorality || "";
  document.getElementById("char-credits").value = data.credits || "";
  document.getElementById("char-encumbrance-threshold").value = data.encumbranceThreshold || "";
  document.getElementById("char-xp-total").value = data.xpTotal || "";
  document.getElementById("char-xp-spent").value = data.xpSpent || "";
  document.getElementById("char-background").value = data.background || "";

  sheetState.skillRanks = data.skillRanks || {};
  sheetState.gear = data.gear || [];
  sheetState.weapons = data.weapons || [];
  sheetState.armor = data.armor || [];

  refreshCharacterDropdowns();
  renderRepeatableList("gear");
  renderRepeatableList("weapons");
  renderRepeatableList("armor");
}

function loadCharacterSheet(campaignId) {
  const uid = auth.currentUser.uid;
  const ref = db.collection("campaigns").doc(campaignId).collection("characters").doc(uid);
  if (activeCharacterUnsub) activeCharacterUnsub();
  activeCharacterUnsub = ref.onSnapshot((doc) => {
    populateSheetForm(doc.exists ? doc.data() : {});
  });
}

document.getElementById("character-sheet-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const uid = auth.currentUser.uid;
  const ref = db.collection("campaigns").doc(activeCampaignId).collection("characters").doc(uid);
  await ref.set(collectSheetData(), { merge: true });
  const statusEl = document.getElementById("sheet-save-status");
  statusEl.textContent = "Saved.";
  setTimeout(() => { statusEl.textContent = ""; }, 2000);
});
