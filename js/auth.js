// --- Sign up ---
async function signUp(email, password, displayName) {
  const cred = await auth.createUserWithEmailAndPassword(email, password);
  await db.collection("users").doc(cred.user.uid).set({
    displayName: displayName || email.split("@")[0],
    email: email,
    createdAt: firebase.firestore.FieldValue.serverTimestamp()
  });
  return cred.user;
}

// --- Log in ---
async function logIn(email, password) {
  const cred = await auth.signInWithEmailAndPassword(email, password);
  return cred.user;
}

// --- Log out ---
async function logOut() {
  await auth.signOut();
}

// --- Live profile info for the logged-in user, kept in sync with users/{uid} ---
let currentUserProfile = { displayName: "", email: "" };

async function loadCurrentUserProfile(uid, fallbackEmail) {
  const doc = await db.collection("users").doc(uid).get();
  const data = doc.exists ? doc.data() : {};
  currentUserProfile = {
    displayName: data.displayName || fallbackEmail.split("@")[0],
    email: fallbackEmail
  };
  document.getElementById("current-user-label").textContent = currentUserProfile.displayName;
}

async function updateDisplayName(uid, newName) {
  await db.collection("users").doc(uid).set({ displayName: newName }, { merge: true });
  currentUserProfile.displayName = newName;
  document.getElementById("current-user-label").textContent = newName;
}

document.getElementById("edit-name-btn").addEventListener("click", () => {
  const labelEl = document.getElementById("current-user-label");
  const current = currentUserProfile.displayName;

  const input = document.createElement("input");
  input.type = "text";
  input.value = current;
  input.className = "name-edit-input";
  labelEl.replaceWith(input);
  input.focus();
  input.select();

  const commit = async () => {
    const newName = input.value.trim() || current;
    const span = document.createElement("span");
    span.id = "current-user-label";
    span.textContent = newName;
    input.replaceWith(span);
    if (newName !== current) {
      await updateDisplayName(auth.currentUser.uid, newName);
    }
  };

  input.addEventListener("keydown", (e) => { if (e.key === "Enter") input.blur(); });
  input.addEventListener("blur", commit, { once: true });
});

// --- Watch auth state, route between login screen and app screen ---
auth.onAuthStateChanged((user) => {
  const loginView = document.getElementById("login-view");
  const appView = document.getElementById("app-view");
  if (user) {
    loginView.classList.add("hidden");
    appView.classList.remove("hidden");
    loadCurrentUserProfile(user.uid, user.email);
    loadCampaigns(user.uid);
    startContentListeners();
  } else {
    loginView.classList.remove("hidden");
    appView.classList.add("hidden");
  }
});

// --- Wire up the login/signup form ---
document.getElementById("auth-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const email = document.getElementById("email-input").value.trim();
  const password = document.getElementById("password-input").value;
  const name = document.getElementById("name-input").value.trim();
  const mode = document.querySelector('input[name="auth-mode"]:checked').value;
  const errorEl = document.getElementById("auth-error");
  errorEl.textContent = "";

  try {
    if (mode === "signup") {
      await signUp(email, password, name);
    } else {
      await logIn(email, password);
    }
  } catch (err) {
    errorEl.textContent = err.message;
  }
});

document.getElementById("logout-btn").addEventListener("click", logOut);
