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

// --- Watch auth state, route between login screen and app screen ---
auth.onAuthStateChanged((user) => {
  const loginView = document.getElementById("login-view");
  const appView = document.getElementById("app-view");
  if (user) {
    loginView.classList.add("hidden");
    appView.classList.remove("hidden");
    document.getElementById("current-user-label").textContent = user.email;
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
