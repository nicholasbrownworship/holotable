// --- YouTube IFrame API setup ---
let musicPlayer = null;
let ambiencePlayer = null;
let playerReady = { music: false, ambience: false };
let lastLoadedVideoId = { music: null, ambience: null };
let pendingChannelState = { music: null, ambience: null };
let audioDocUnsub = null;

// Called automatically by the YouTube IFrame API once it finishes loading
function onYouTubeIframeAPIReady() {
  musicPlayer = new YT.Player("yt-music-player", {
    height: "0", width: "0",
    events: { onReady: () => { playerReady.music = true; applyPendingState("music"); } }
  });
  ambiencePlayer = new YT.Player("yt-ambience-player", {
    height: "0", width: "0",
    events: { onReady: () => { playerReady.ambience = true; applyPendingState("ambience"); } }
  });
}

function applyPendingState(channel) {
  if (pendingChannelState[channel]) {
    applyChannelState(channel, pendingChannelState[channel]);
    pendingChannelState[channel] = null;
  }
}

function extractYouTubeId(url) {
  const patterns = [
    /(?:youtube\.com\/watch\?v=)([\w-]{11})/,
    /(?:youtu\.be\/)([\w-]{11})/,
    /(?:youtube\.com\/embed\/)([\w-]{11})/
  ];
  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) return match[1];
  }
  return null;
}

// --- Apply a channel's Firestore state to its actual YT player ---
function applyChannelState(channel, data) {
  const player = channel === "music" ? musicPlayer : ambiencePlayer;
  if (!playerReady[channel]) { pendingChannelState[channel] = data; return; }
  if (!data || !data.videoId) {
    if (lastLoadedVideoId[channel]) player.stopVideo();
    lastLoadedVideoId[channel] = null;
    return;
  }

  const elapsedSeconds = data.state === "playing"
    ? Math.max(0, (Date.now() - (data.updatedAt?.toMillis() || Date.now())) / 1000)
    : 0;
  const seekTo = (data.positionSeconds || 0) + elapsedSeconds;

  if (data.videoId !== lastLoadedVideoId[channel]) {
    lastLoadedVideoId[channel] = data.videoId;
    player.cueVideoById({ videoId: data.videoId, startSeconds: seekTo });
    if (data.state === "playing") setTimeout(() => player.playVideo(), 300);
  } else {
    player.seekTo(seekTo, true);
    if (data.state === "playing") player.playVideo();
    else player.pauseVideo();
  }
}

// --- GM controls: load / play / pause / stop, written to the campaign doc ---
async function setChannelState(channel, patch) {
  await db.collection("campaigns").doc(activeCampaignId).update({
    [`audio.${channel}`]: { ...patch, updatedAt: firebase.firestore.FieldValue.serverTimestamp() }
  });
}

function currentPlayerPosition(channel) {
  const player = channel === "music" ? musicPlayer : ambiencePlayer;
  try { return player?.getCurrentTime?.() || 0; } catch { return 0; }
}

document.getElementById("music-load-form").addEventListener("submit", (e) => {
  e.preventDefault();
  const input = document.getElementById("music-url-input");
  const videoId = extractYouTubeId(input.value.trim());
  if (!videoId) { alert("Couldn't find a video ID in that link."); return; }
  setChannelState("music", { videoId, state: "stopped", positionSeconds: 0 });
  input.value = "";
});
document.getElementById("music-play-btn").addEventListener("click", () => setChannelState("music", { videoId: lastLoadedVideoId.music, state: "playing", positionSeconds: currentPlayerPosition("music") }));
document.getElementById("music-pause-btn").addEventListener("click", () => setChannelState("music", { videoId: lastLoadedVideoId.music, state: "paused", positionSeconds: currentPlayerPosition("music") }));
document.getElementById("music-stop-btn").addEventListener("click", () => setChannelState("music", { videoId: null, state: "stopped", positionSeconds: 0 }));

document.getElementById("ambience-load-form").addEventListener("submit", (e) => {
  e.preventDefault();
  const input = document.getElementById("ambience-url-input");
  const videoId = extractYouTubeId(input.value.trim());
  if (!videoId) { alert("Couldn't find a video ID in that link."); return; }
  setChannelState("ambience", { videoId, state: "stopped", positionSeconds: 0 });
  input.value = "";
});
document.getElementById("ambience-play-btn").addEventListener("click", () => setChannelState("ambience", { videoId: lastLoadedVideoId.ambience, state: "playing", positionSeconds: currentPlayerPosition("ambience") }));
document.getElementById("ambience-pause-btn").addEventListener("click", () => setChannelState("ambience", { videoId: lastLoadedVideoId.ambience, state: "paused", positionSeconds: currentPlayerPosition("ambience") }));
document.getElementById("ambience-stop-btn").addEventListener("click", () => setChannelState("ambience", { videoId: null, state: "stopped", positionSeconds: 0 }));

// --- Volume sliders (per-browser, saved locally, never shared) ---
function loadStoredVolume(key, fallback) {
  const stored = localStorage.getItem(`holotable_${key}_volume`);
  return stored !== null ? Number(stored) : fallback;
}

function initVolumeSliders() {
  const musicSlider = document.getElementById("music-volume");
  const ambienceSlider = document.getElementById("ambience-volume");
  const sfxSlider = document.getElementById("sfx-volume");

  musicSlider.value = loadStoredVolume("music", 60);
  ambienceSlider.value = loadStoredVolume("ambience", 60);
  sfxSlider.value = loadStoredVolume("sfx", 80);

  musicSlider.addEventListener("input", (e) => {
    localStorage.setItem("holotable_music_volume", e.target.value);
    musicPlayer?.setVolume?.(Number(e.target.value));
  });
  ambienceSlider.addEventListener("input", (e) => {
    localStorage.setItem("holotable_ambience_volume", e.target.value);
    ambiencePlayer?.setVolume?.(Number(e.target.value));
  });
  sfxSlider.addEventListener("input", (e) => {
    localStorage.setItem("holotable_sfx_volume", e.target.value);
  });
}

document.getElementById("enable-audio-btn").addEventListener("click", () => {
  // A real playVideo() call inside a click handler satisfies the browser's audio-unlock
  // requirement; re-applying the known state right after corrects it to play/pause as intended.
  try { musicPlayer?.playVideo?.(); } catch {}
  try { ambiencePlayer?.playVideo?.(); } catch {}
  setTimeout(() => {
    if (audioLatestState.music) applyChannelState("music", audioLatestState.music);
    if (audioLatestState.ambience) applyChannelState("ambience", audioLatestState.ambience);
  }, 200);
});

let audioLatestState = { music: null, ambience: null };

// --- Sound effect library (global, reusable across campaigns) ---
let soundEffectsCache = [];
let sfxLibraryUnsub = null;

function fileToDataUri(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

document.getElementById("sfx-upload-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const name = document.getElementById("sfx-name").value.trim();
  const file = document.getElementById("sfx-file-input").files[0];
  const statusEl = document.getElementById("sfx-upload-status");
  if (!file) return;

  if (file.size > 600000) {
    statusEl.textContent = "That clip's too big \u2014 keep sound effects to a few seconds (under ~600KB).";
    return;
  }

  statusEl.textContent = "Uploading...";
  try {
    const audioData = await fileToDataUri(file);
    await db.collection("soundEffects").add({
      name, audioData, createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    statusEl.textContent = "Added.";
    e.target.reset();
    setTimeout(() => { statusEl.textContent = ""; }, 2000);
  } catch (err) {
    statusEl.textContent = "Couldn't upload that file.";
  }
});

function renderSfxTriggerList() {
  const el = document.getElementById("sfx-trigger-list");
  el.innerHTML = soundEffectsCache.map((sfx) => `
    <button type="button" class="sfx-trigger-btn" data-id="${sfx.id}">${sfx.name}</button>
  `).join("") || `<p class="library-note">No sound effects added yet.</p>`;

  el.querySelectorAll(".sfx-trigger-btn").forEach((btn) => {
    btn.addEventListener("click", () => triggerSfx(btn.dataset.id));
  });
}

function triggerSfx(sfxId) {
  if (!activeCampaignId) return;
  db.collection("campaigns").doc(activeCampaignId).collection("sfxTriggers").add({
    sfxId,
    createdAt: firebase.firestore.FieldValue.serverTimestamp()
  }).then((ref) => setTimeout(() => ref.delete().catch(() => {}), 5000));
}

function playSfxLocally(sfxId) {
  const sfx = soundEffectsCache.find((s) => s.id === sfxId);
  if (!sfx) return;
  const audio = new Audio(sfx.audioData);
  audio.volume = (Number(document.getElementById("sfx-volume").value) || 0) / 100;
  audio.play().catch(() => {});
}

// --- Wire up listeners for a campaign ---
let sfxTriggersUnsub = null;
let isInitialSfxLoad = true;

function startAudio(campaignId) {
  stopAudio();
  isInitialSfxLoad = true;

  audioDocUnsub = db.collection("campaigns").doc(campaignId).onSnapshot((doc) => {
    const audio = (doc.data() || {}).audio || {};
    audioLatestState.music = audio.music || null;
    audioLatestState.ambience = audio.ambience || null;
    applyChannelState("music", audio.music);
    applyChannelState("ambience", audio.ambience);
  });

  if (!sfxLibraryUnsub) {
    sfxLibraryUnsub = db.collection("soundEffects").orderBy("name").onSnapshot((snapshot) => {
      soundEffectsCache = [];
      snapshot.forEach((doc) => soundEffectsCache.push({ id: doc.id, ...doc.data() }));
      renderSfxTriggerList();
    });
  }

  sfxTriggersUnsub = db.collection("campaigns").doc(campaignId).collection("sfxTriggers")
    .onSnapshot((snapshot) => {
      if (isInitialSfxLoad) { isInitialSfxLoad = false; return; }
      snapshot.docChanges().forEach((change) => {
        if (change.type === "added") playSfxLocally(change.doc.data().sfxId);
      });
    });
}

function stopAudio() {
  if (audioDocUnsub) { audioDocUnsub(); audioDocUnsub = null; }
  if (sfxTriggersUnsub) { sfxTriggersUnsub(); sfxTriggersUnsub = null; }
}

initVolumeSliders();
