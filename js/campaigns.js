// Generates a short, human-typeable join code like "RX7K-92QF"
function generateJoinCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/O/1/I to avoid confusion
  const part = () => Array.from({ length: 4 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
  return `${part()}-${part()}`;
}

async function createCampaign(name) {
  const user = auth.currentUser;
  const joinCode = generateJoinCode();
  const ref = await db.collection("campaigns").add({
    name: name,
    gmId: user.uid,
    memberIds: [user.uid],
    joinCode: joinCode,
    createdAt: firebase.firestore.FieldValue.serverTimestamp()
  });
  return { id: ref.id, joinCode };
}

async function joinCampaignByCode(code) {
  const user = auth.currentUser;
  const snapshot = await db.collection("campaigns")
    .where("joinCode", "==", code.trim().toUpperCase())
    .limit(1)
    .get();

  if (snapshot.empty) throw new Error("No campaign found with that code.");

  const doc = snapshot.docs[0];
  await doc.ref.update({
    memberIds: firebase.firestore.FieldValue.arrayUnion(user.uid)
  });
  return doc.id;
}

function loadCampaigns(uid) {
  db.collection("campaigns")
    .where("memberIds", "array-contains", uid)
    .onSnapshot((snapshot) => {
      const listEl = document.getElementById("campaign-list");
      listEl.innerHTML = "";
      snapshot.forEach((doc) => {
        const data = doc.data();
        const li = document.createElement("li");
        const isGM = data.gmId === uid;
        li.innerHTML = `
          <span class="campaign-name">${data.name}</span>
          <span class="campaign-role">${isGM ? "GM" : "Player"}</span>
          ${isGM ? `<span class="campaign-code">Join code: ${data.joinCode}</span>` : ""}
          <button class="enter-btn" data-id="${doc.id}" data-role="${isGM ? "gm" : "player"}">Enter</button>
        `;
        listEl.appendChild(li);
      });

      document.querySelectorAll(".enter-btn").forEach((btn) => {
        btn.addEventListener("click", () => {
          // v1 placeholder: GM view and player view get built next.
          // This is where we'll route to campaign.html?id=...&role=...
          const id = btn.dataset.id;
          const role = btn.dataset.role;
          alert(`Entering campaign ${id} as ${role} \u2014 next build step wires this to the real GM/player views.`);
        });
      });
    });
}

document.getElementById("create-campaign-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const nameInput = document.getElementById("new-campaign-name");
  const errorEl = document.getElementById("campaign-error");
  errorEl.textContent = "";
  try {
    const { joinCode } = await createCampaign(nameInput.value.trim());
    nameInput.value = "";
    alert(`Campaign created! Share this join code with your players: ${joinCode}`);
  } catch (err) {
    errorEl.textContent = err.message;
  }
});

document.getElementById("join-campaign-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const codeInput = document.getElementById("join-campaign-code");
  const errorEl = document.getElementById("campaign-error");
  errorEl.textContent = "";
  try {
    await joinCampaignByCode(codeInput.value);
    codeInput.value = "";
  } catch (err) {
    errorEl.textContent = err.message;
  }
});
