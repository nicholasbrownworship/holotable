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
  listenToContent("talents", (items) => { contentCache.talents = items; renderTalentsList(); refreshCharacterDropdowns(); });
  listenToContent("specializations", (items) => { contentCache.specializations = items; renderSpecializationsList(); refreshCharacterDropdowns(); });
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
  const tier = Number(document.getElementById("talent-tier").value) || 1;
  const activation = document.getElementById("talent-activation").value;
  const ranked = document.getElementById("talent-ranked").checked;
  const effect = document.getElementById("talent-effect").value.trim();
  await addContentDoc("talents", { name, tier, activation, ranked, effect });
  e.target.reset();
});

function renderTalentsList() {
  const el = document.getElementById("talents-list");
  if (!el) return;
  el.innerHTML = contentCache.talents.map((t) => `
    <li>
      <div class="content-item-main">
        <strong>${t.name}</strong> <span class="tag">Tier ${t.tier}</span> <span class="tag">${t.activation}${t.ranked ? " · Ranked" : ""}</span>
        <p class="content-item-effect">${t.effect}</p>
      </div>
      <button class="delete-btn" data-collection="talents" data-id="${t.id}">Remove</button>
    </li>
  `).join("");
}

// --- SPECIALIZATIONS ---
document.getElementById("specialization-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const name = document.getElementById("specialization-name").value.trim();
  const careerName = document.getElementById("specialization-career-note").value.trim();
  const talentIds = Array.from(document.getElementById("specialization-talents-select").selectedOptions).map((o) => o.value);
  await addContentDoc("specializations", { name, careerName, talentIds });
  e.target.reset();
});

function renderSpecializationsList() {
  const select = document.getElementById("specialization-talents-select");
  if (select) {
    select.innerHTML = contentCache.talents.map((t) => `<option value="${t.id}">${t.name} (T${t.tier})</option>`).join("");
  }
  const el = document.getElementById("specializations-list");
  if (!el) return;
  el.innerHTML = contentCache.specializations.map((sp) => {
    const talentNames = sp.talentIds.map((id) => contentCache.talents.find((t) => t.id === id)?.name).filter(Boolean).join(", ");
    return `
      <li>
        <div class="content-item-main">
          <strong>${sp.name}</strong>${sp.careerName ? ` <span class="content-item-sub">(${sp.careerName})</span>` : ""}
          <span class="content-item-sub">${talentNames || "No talents added"}</span>
        </div>
        <button class="delete-btn" data-collection="specializations" data-id="${sp.id}">Remove</button>
      </li>
    `;
  }).join("");
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
