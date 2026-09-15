// --- Generic helpers for a content collection (species/careers/skills/talents/specializations) ---

async function addContentDoc(collectionName, data) {
  const ref = await db.collection(collectionName).add({
    ...data,
    createdBy: auth.currentUser.uid,
    createdAt: firebase.firestore.FieldValue.serverTimestamp()
  });
  return ref.id;
}

async function deleteContentDoc(collectionName, docId) {
  await db.collection(collectionName).doc(docId).delete();
}

function listenToContent(collectionName, callback) {
  return db.collection(collectionName).orderBy("name").onSnapshot((snapshot) => {
    const items = [];
    snapshot.forEach((doc) => items.push({ id: doc.id, ...doc.data() }));
    callback(items);
  });
}

// --- Local caches, kept live, used to populate dropdowns anywhere in the app ---
const contentCache = {
  species: [],
  careers: [],
  skills: [],
  talents: [],
  specializations: []
};

function startContentListeners() {
  listenToContent("species", (items) => { contentCache.species = items; renderSpeciesList(); refreshCharacterDropdowns(); });
  listenToContent("careers", (items) => { contentCache.careers = items; renderCareersList(); refreshCharacterDropdowns(); });
  listenToContent("skills", (items) => { contentCache.skills = items; renderSkillsList(); refreshCharacterDropdowns(); });
  listenToContent("talents", (items) => { contentCache.talents = items; renderTalentsList(); renderSpecGrid(); refreshCharacterDropdowns(); });
  listenToContent("specializations", (items) => { contentCache.specializations = items; renderSpecializationsList(); refreshCharacterDropdowns(); });
  renderSpecGrid();
}

// --- SPECIES ---
document.getElementById("species-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const name = document.getElementById("species-name").value.trim();
  const startXP = Number(document.getElementById("species-starting-xp").value) || 0;
  const woundThreshold = Number(document.getElementById("species-wound-threshold").value) || 0;
  const strainThreshold = Number(document.getElementById("species-strain-threshold").value) || 0;
  const characteristics = {
    brawn: Number(document.getElementById("species-brawn").value) || 0,
    agility: Number(document.getElementById("species-agility").value) || 0,
    intellect: Number(document.getElementById("species-intellect").value) || 0,
    cunning: Number(document.getElementById("species-cunning").value) || 0,
    willpower: Number(document.getElementById("species-willpower").value) || 0,
    presence: Number(document.getElementById("species-presence").value) || 0
  };
  const specialAbility = document.getElementById("species-special-ability").value.trim();

  await addContentDoc("species", { name, startXP, woundThreshold, strainThreshold, characteristics, specialAbility });
  e.target.reset();
});

function renderSpeciesList() {
  const el = document.getElementById("species-list");
  if (!el) return;
  el.innerHTML = contentCache.species.map((s) => `
    <li>
      <div class="content-item-main">
        <strong>${s.name}</strong>
        <span class="content-item-sub">Br ${s.characteristics.brawn} / Ag ${s.characteristics.agility} / Int ${s.characteristics.intellect} / Cu ${s.characteristics.cunning} / Wi ${s.characteristics.willpower} / Pr ${s.characteristics.presence} — WT ${s.woundThreshold}, ST ${s.strainThreshold}, ${s.startXP} XP</span>
      </div>
      <button class="delete-btn" data-collection="species" data-id="${s.id}">Remove</button>
    </li>
  `).join("");
}

// --- SKILLS ---
document.getElementById("skill-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const name = document.getElementById("skill-name").value.trim();
  const characteristic = document.getElementById("skill-characteristic").value;
  const category = document.getElementById("skill-category").value;
  await addContentDoc("skills", { name, characteristic, category });
  e.target.reset();
});

function renderSkillsList() {
  const el = document.getElementById("skills-list");
  if (!el) return;
  el.innerHTML = contentCache.skills.map((s) => `
    <li>
      <div class="content-item-main">
        <strong>${s.name}</strong>
        <span class="content-item-sub">${s.characteristic} — ${s.category}</span>
      </div>
      <button class="delete-btn" data-collection="skills" data-id="${s.id}">Remove</button>
    </li>
  `).join("");
}

// --- CAREERS ---
document.getElementById("career-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const name = document.getElementById("career-name").value.trim();
  const careerSkillIds = Array.from(document.getElementById("career-skills-select").selectedOptions).map((o) => o.value);
  await addContentDoc("careers", { name, careerSkillIds });
  e.target.reset();
});

function renderCareersList() {
  const select = document.getElementById("career-skills-select");
  if (select) {
    select.innerHTML = contentCache.skills.map((s) => `<option value="${s.id}">${s.name}</option>`).join("");
  }
  const el = document.getElementById("careers-list");
  if (!el) return;
  el.innerHTML = contentCache.careers.map((c) => {
    const skillNames = c.careerSkillIds.map((id) => contentCache.skills.find((s) => s.id === id)?.name).filter(Boolean).join(", ");
    return `
      <li>
        <div class="content-item-main">
          <strong>${c.name}</strong>
          <span class="content-item-sub">${skillNames || "No career skills set"}</span>
        </div>
        <button class="delete-btn" data-collection="careers" data-id="${c.id}">Remove</button>
      </li>
    `;
  }).join("");
}

// --- TALENTS ---
document.getElementById("talent-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const name = document.getElementById("talent-name").value.trim();
  const activation = document.getElementById("talent-activation").value;
  const ranked = document.getElementById("talent-ranked").checked;
  const effect = document.getElementById("talent-effect").value.trim();
  await addContentDoc("talents", { name, activation, ranked, effect });
  e.target.reset();
});

function renderTalentsList() {
  const el = document.getElementById("talents-list");
  if (!el) return;
  el.innerHTML = contentCache.talents.map((t) => `
    <li>
      <div class="content-item-main">
        <strong>${t.name}</strong> <span class="tag">${t.activation}${t.ranked ? " · Ranked" : ""}</span>
        <p class="content-item-effect">${t.effect}</p>
      </div>
      <button class="delete-btn" data-collection="talents" data-id="${t.id}">Remove</button>
    </li>
  `).join("");
}

// --- SPECIALIZATIONS: 4x4 talent tree grid builder ---
const GRID_ROWS = 4;
const GRID_COLS = 4;
const DEFAULT_ROW_COST = [5, 10, 15, 20]; // row 0 = tier 1 = 5 XP, etc. — verify against your books, override per cell as needed

function buildEmptySpecGrid() {
  return Array.from({ length: GRID_ROWS }, () =>
    Array.from({ length: GRID_COLS }, () => ({ talentId: "", cost: "", prerequisites: [] }))
  );
}

let specGridState = buildEmptySpecGrid();

function renderSpecGrid() {
  const container = document.getElementById("spec-grid");
  if (!container) return;

  // Build the list of "already filled" cells, for prerequisite dropdowns
  const filledCells = [];
  specGridState.forEach((rowArr, r) => rowArr.forEach((cell, c) => {
    if (cell.talentId) {
      const talent = contentCache.talents.find((t) => t.id === cell.talentId);
      filledCells.push({ key: `${r}-${c}`, label: `T${r + 1} \u00b7 ${talent ? talent.name : "?"}` });
    }
  }));

  let html = "";
  for (let r = 0; r < GRID_ROWS; r++) {
    for (let c = 0; c < GRID_COLS; c++) {
      const cell = specGridState[r][c];
      const key = `${r}-${c}`;
      const talentOptions = `<option value="">-- empty --</option>` +
        contentCache.talents.map((t) => `<option value="${t.id}" ${cell.talentId === t.id ? "selected" : ""}>${t.name}${t.ranked ? " (R)" : ""}</option>`).join("");
      const prereqOptions = filledCells
        .filter((fc) => fc.key !== key)
        .map((fc) => `<option value="${fc.key}" ${cell.prerequisites.includes(fc.key) ? "selected" : ""}>${fc.label}</option>`)
        .join("");

      html += `
        <div class="talent-cell">
          <span class="cell-label">Tier ${r + 1} &middot; Col ${c + 1}</span>
          <select class="cell-talent-select" data-row="${r}" data-col="${c}">${talentOptions}</select>
          <input type="number" class="cell-cost-input" data-row="${r}" data-col="${c}" placeholder="XP cost" value="${cell.cost}" ${cell.talentId ? "" : "disabled"} />
          <select class="cell-prereq-select" data-row="${r}" data-col="${c}" multiple size="2" ${cell.talentId && filledCells.length > 1 ? "" : "disabled"}>${prereqOptions}</select>
        </div>
      `;
    }
  }
  container.innerHTML = html;
}

document.getElementById("spec-grid").addEventListener("change", (e) => {
  const { row, col } = e.target.dataset;
  if (row === undefined) return;
  const r = Number(row), c = Number(col);

  if (e.target.classList.contains("cell-talent-select")) {
    specGridState[r][c].talentId = e.target.value;
    if (e.target.value && !specGridState[r][c].cost) {
      specGridState[r][c].cost = DEFAULT_ROW_COST[r];
    }
    if (!e.target.value) {
      specGridState[r][c].cost = "";
      specGridState[r][c].prerequisites = [];
    }
    renderSpecGrid(); // prereq options across the grid may have changed
  } else if (e.target.classList.contains("cell-prereq-select")) {
    specGridState[r][c].prerequisites = Array.from(e.target.selectedOptions).map((o) => o.value);
  }
});

document.getElementById("spec-grid").addEventListener("input", (e) => {
  if (!e.target.classList.contains("cell-cost-input")) return;
  const { row, col } = e.target.dataset;
  specGridState[Number(row)][Number(col)].cost = Number(e.target.value) || 0;
});

document.getElementById("specialization-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const name = document.getElementById("specialization-name").value.trim();
  const careerName = document.getElementById("specialization-career-note").value.trim();

  const talentGrid = [];
  specGridState.forEach((rowArr, r) => rowArr.forEach((cell, c) => {
    if (cell.talentId) {
      talentGrid.push({ row: r, col: c, talentId: cell.talentId, cost: Number(cell.cost) || 0, prerequisites: cell.prerequisites });
    }
  }));

  await addContentDoc("specializations", { name, careerName, talentGrid });
  e.target.reset();
  specGridState = buildEmptySpecGrid();
  renderSpecGrid();
});

function renderSpecializationsList() {
  const el = document.getElementById("specializations-list");
  if (!el) return;
  el.innerHTML = contentCache.specializations.map((sp) => {
    const cellSummaries = (sp.talentGrid || [])
      .slice()
      .sort((a, b) => a.row - b.row || a.col - b.col)
      .map((cell) => {
        const talent = contentCache.talents.find((t) => t.id === cell.talentId);
        return `T${cell.row + 1}: ${talent ? talent.name : "?"} (${cell.cost} XP)`;
      })
      .join(" &middot; ");
    return `
      <li>
        <div class="content-item-main">
          <strong>${sp.name}</strong>${sp.careerName ? ` <span class="content-item-sub">(${sp.careerName})</span>` : ""}
          <span class="content-item-sub">${cellSummaries || "No talents placed"}</span>
        </div>
        <button class="delete-btn" data-collection="specializations" data-id="${sp.id}">Remove</button>
      </li>
    `;
  }).join("");
}

// Redraw the grid whenever the talent library changes, so newly added talents show up in the pickers
function refreshSpecGridOnTalentChange() {
  renderSpecGrid();
}

// --- Delete button delegation (all content lists) ---
document.getElementById("content-library-view").addEventListener("click", (e) => {
  if (e.target.classList.contains("delete-btn")) {
    const { collection, id } = e.target.dataset;
    if (confirm("Remove this entry? Characters that reference it will show a blank until re-selected.")) {
      deleteContentDoc(collection, id);
    }
  }
});
