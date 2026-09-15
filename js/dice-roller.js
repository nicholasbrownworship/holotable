let currentPool = { boost: 0, setback: 0, ability: 0, difficulty: 0, proficiency: 0, challenge: 0, force: 0 };
let rollLogUnsub = null;

function renderPoolBuilder() {
  document.querySelectorAll(".die-stepper").forEach((stepper) => {
    const type = stepper.dataset.dieType;
    stepper.querySelector(".die-count").textContent = currentPool[type];
  });
}

document.querySelectorAll(".die-stepper").forEach((stepper) => {
  const type = stepper.dataset.dieType;
  stepper.querySelector(".die-minus").addEventListener("click", () => {
    currentPool[type] = Math.max(0, currentPool[type] - 1);
    renderPoolBuilder();
  });
  stepper.querySelector(".die-plus").addEventListener("click", () => {
    currentPool[type] = Math.min(10, currentPool[type] + 1);
    renderPoolBuilder();
  });
});

document.getElementById("clear-pool-btn").addEventListener("click", () => {
  currentPool = { boost: 0, setback: 0, ability: 0, difficulty: 0, proficiency: 0, challenge: 0, force: 0 };
  renderPoolBuilder();
});

document.getElementById("roll-dice-btn").addEventListener("click", async () => {
  const totalDice = Object.values(currentPool).reduce((a, b) => a + b, 0);
  if (totalDice === 0 || !activeCampaignId) return;

  const result = rollPool(currentPool);
  const user = auth.currentUser;

  await db.collection("campaigns").doc(activeCampaignId).collection("rolls").add({
    rollerUid: user.uid,
    rollerName: currentUserProfile.displayName || user.email,
    pool: { ...currentPool },
    diceResults: result.diceResults,
    net: result.net,
    createdAt: firebase.firestore.FieldValue.serverTimestamp()
  });
});

function renderRollResult(rollDoc) {
  const net = rollDoc.net;
  const badges = [];
  if (net.success) badges.push(`<span class="result-badge success">${net.success} Success</span>`);
  if (net.failure) badges.push(`<span class="result-badge failure">${net.failure} Failure</span>`);
  if (net.advantage) badges.push(`<span class="result-badge advantage">${net.advantage} Advantage</span>`);
  if (net.threat) badges.push(`<span class="result-badge threat">${net.threat} Threat</span>`);
  if (net.triumph) badges.push(`<span class="result-badge triumph">${net.triumph} Triumph</span>`);
  if (net.despair) badges.push(`<span class="result-badge despair">${net.despair} Despair</span>`);
  if (net.lightForce) badges.push(`<span class="result-badge light-force">${net.lightForce} Light</span>`);
  if (net.darkForce) badges.push(`<span class="result-badge dark-force">${net.darkForce} Dark</span>`);
  if (!badges.length) badges.push(`<span class="result-badge">No net effect</span>`);

  const diceBreakdown = rollDoc.diceResults.map((d) =>
    `<span class="die-face die-face-${d.type}">${DIE_LABELS[d.type][0]}: ${symbolsToString(d.symbols)}</span>`
  ).join("");

  return `
    <li class="roll-entry">
      <div class="roll-entry-header">
        <strong>${rollDoc.rollerName}</strong>
        <span class="roll-badges">${badges.join("")}</span>
      </div>
      <div class="roll-dice-breakdown">${diceBreakdown}</div>
    </li>
  `;
}

function startRollLog(campaignId) {
  if (rollLogUnsub) rollLogUnsub();
  rollLogUnsub = db.collection("campaigns").doc(campaignId).collection("rolls")
    .orderBy("createdAt", "desc")
    .limit(25)
    .onSnapshot((snapshot) => {
      const logEl = document.getElementById("roll-log");
      const entries = [];
      snapshot.forEach((doc) => entries.push(doc.data()));
      logEl.innerHTML = entries.map(renderRollResult).join("");
    });
}

function stopRollLog() {
  if (rollLogUnsub) { rollLogUnsub(); rollLogUnsub = null; }
}

renderPoolBuilder();
