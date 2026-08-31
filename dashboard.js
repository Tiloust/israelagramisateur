const MAX_PER_HOUR = 15;

const els = {
  username: document.getElementById("username"),
  scanBtn: document.getElementById("scanBtn"),
  scanStatus: document.getElementById("scanStatus"),
  progressWrap: document.getElementById("progressWrap"),
  progressText: document.getElementById("progressText"),
  statFollowing: document.getElementById("statFollowing"),
  statFollowers: document.getElementById("statFollowers"),
  statNonFollowers: document.getElementById("statNonFollowers"),
  statRateLimit: document.getElementById("statRateLimit"),
  searchInput: document.getElementById("searchInput"),
  sortSelect: document.getElementById("sortSelect"),
  hideWhitelisted: document.getElementById("hideWhitelisted"),
  exportCSV: document.getElementById("exportCSV"),
  exportJSON: document.getElementById("exportJSON"),
  startAutopilot: document.getElementById("startAutopilot"),
  stopAutopilot: document.getElementById("stopAutopilot"),
  autopilotStatus: document.getElementById("autopilotStatus"),
  selectAll: document.getElementById("selectAll"),
  listCount: document.getElementById("listCount"),
  profileList: document.getElementById("profileList")
};

let currentNonFollowers = [];
let progressInterval = null;

const FUN_MESSAGES = [
  "Preparation du dossier d'instruction...",
  "Interrogatoire des comptes suspects en cours...",
  "Certains ne survivront pas a cette purge...",
  "On croise vos abonnements avec des fichiers confidentiels...",
  "Preparation des dossiers d'extradition numerique...",
  "Vos anciens amis regrettent deja leurs choix...",
  "Cette liste sera versee au dossier...",
  "Aucun follower n'est en securite...",
  "On negocie leur sortie un par un...",
  "Patience, la sentence approche..."
];

function startProgress() {
  els.progressWrap.classList.remove("hidden");
  let i = 0;
  els.progressText.textContent = FUN_MESSAGES[0];
  progressInterval = setInterval(() => {
    i = (i + 1) % FUN_MESSAGES.length;
    els.progressText.textContent = FUN_MESSAGES[i];
  }, 2200);
}

function stopProgress() {
  clearInterval(progressInterval);
  progressInterval = null;
  els.progressWrap.classList.add("hidden");
}

chrome.storage.local.get("lastUsername", (r) => {
  if (r.lastUsername) els.username.value = r.lastUsername;
});

async function refreshStats() {
  const nonFollowers = await getNonFollowers();
  currentNonFollowers = nonFollowers;
  const count = await getUnfollowCountLastHour();
  els.statNonFollowers.textContent = nonFollowers.length;
  els.statRateLimit.textContent = `${count}/${MAX_PER_HOUR}`;

  const history = await getScanHistory();
  if (history.length) {
    const last = history[history.length - 1];
    els.statFollowing.textContent = last.total_following;
    els.statFollowers.textContent = last.total_followers;
  }
  renderList();
  refreshAutopilotStatus();
}

function sortProfiles(list, sortBy) {
  const sorted = [...list];
  switch (sortBy) {
    case "username_desc":
      sorted.sort((a, b) => b.username.localeCompare(a.username));
      break;
    case "first_seen_asc":
      sorted.sort((a, b) => a.first_seen - b.first_seen);
      break;
    case "first_seen_desc":
      sorted.sort((a, b) => b.first_seen - a.first_seen);
      break;
    default:
      sorted.sort((a, b) => a.username.localeCompare(b.username));
  }
  return sorted;
}

function loadAvatar(imgEl, url, initial) {
  if (!url) {
    replaceWithFallback(imgEl, initial);
    return;
  }
  imgEl.classList.add("avatar-loading");
  chrome.runtime.sendMessage({ action: "FETCH_IMAGE_REQUEST", url }, (res) => {
    if (!imgEl.isConnected) return;
    imgEl.classList.remove("avatar-loading");
    if (res && res.success && res.dataUrl) {
      imgEl.src = res.dataUrl;
    } else {
      replaceWithFallback(imgEl, initial);
    }
  });
}

function replaceWithFallback(imgEl, initial) {
  const fallback = document.createElement("div");
  fallback.className = "avatar-fallback";
  fallback.textContent = initial;
  if (imgEl.isConnected) imgEl.replaceWith(fallback);
}

function renderList() {
  const search = els.searchInput.value.toLowerCase();
  const hideWl = els.hideWhitelisted.checked;
  const sortBy = els.sortSelect.value;

  let list = currentNonFollowers.filter((p) => {
    if (hideWl && p.whitelisted) return false;
    if (search && !p.username.toLowerCase().includes(search)) return false;
    return true;
  });

  list = sortProfiles(list, sortBy);

  els.listCount.textContent = `${list.length} profil(s)`;
  els.profileList.innerHTML = "";

  list.forEach((profile) => {
    const card = document.createElement("div");
    card.className = "profile-card";
    card.innerHTML = `
      <input type="checkbox" class="select-item" data-username="${profile.username}" />
      <img class="avatar-img" referrerpolicy="no-referrer" />
      <div class="profile-info">
        <a href="https://instagram.com/${profile.username}" target="_blank">@${profile.username}</a>
        <span class="full-name">${profile.full_name || ""}</span>
      </div>
      <div class="profile-actions">
        <button class="unfollow-btn" data-username="${profile.username}" data-id="${profile.user_id}">Desabonner</button>
        <label class="whitelist-toggle">
          <input type="checkbox" class="wl-toggle" data-username="${profile.username}" ${profile.whitelisted ? "checked" : ""} /> whitelist
        </label>
      </div>
    `;
    els.profileList.appendChild(card);

    const img = card.querySelector(".avatar-img");
    loadAvatar(img, profile.profile_pic_url, profile.username.charAt(0).toUpperCase());
  });

  document.querySelectorAll(".unfollow-btn").forEach((btn) => {
    btn.addEventListener("click", () => handleUnfollow(btn));
  });
  document.querySelectorAll(".wl-toggle").forEach((cb) => {
    cb.addEventListener("change", async () => {
      await toggleWhitelist(cb.dataset.username, cb.checked);
      await refreshStats();
    });
  });
}

async function handleUnfollow(btn) {
  const count = await getUnfollowCountLastHour();
  if (count >= MAX_PER_HOUR) {
    alert(`Limite atteinte (${MAX_PER_HOUR}/h). Reessayez plus tard ou utilisez l'auto-pilot.`);
    return;
  }
  btn.disabled = true;
  btn.textContent = "...";
  chrome.runtime.sendMessage(
    { action: "UNFOLLOW_REQUEST", userId: btn.dataset.id, username: btn.dataset.username },
    async (response) => {
      if (response && response.success) {
        btn.textContent = "Fait";
        await refreshStats();
      } else {
        btn.textContent = "Reessayer";
        btn.disabled = false;
        if (response && response.error) alert(response.error);
      }
    }
  );
}

els.scanBtn.addEventListener("click", () => {
  const username = els.username.value.trim().replace(/^@/, "");
  if (!username) return alert("Entrez votre nom d'utilisateur Instagram (sans le @).");

  els.scanBtn.disabled = true;
  els.scanStatus.textContent = "";
  startProgress();

  chrome.runtime.sendMessage({ action: "SCAN_REQUEST", username }, async (response) => {
    els.scanBtn.disabled = false;
    stopProgress();
    if (!response || !response.success) {
      els.scanStatus.textContent = "Erreur : " + (response?.error || "inconnue");
      return;
    }
    els.scanStatus.textContent = `Scan termine : ${response.nonFollowersCount} non-followers.`;
    await refreshStats();
  });
});

els.searchInput.addEventListener("input", renderList);
els.sortSelect.addEventListener("change", renderList);
els.hideWhitelisted.addEventListener("change", renderList);

els.selectAll.addEventListener("change", () => {
  document.querySelectorAll(".select-item").forEach((cb) => (cb.checked = els.selectAll.checked));
});

els.exportCSV.addEventListener("click", async () => {
  const csv = await exportNonFollowersCSV();
  downloadFile(csv, "non_followers.csv", "text/csv");
});
els.exportJSON.addEventListener("click", async () => {
  const json = await exportNonFollowersJSON();
  downloadFile(json, "non_followers.json", "application/json");
});

function downloadFile(content, filename, mime) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

els.startAutopilot.addEventListener("click", () => {
  const selected = Array.from(document.querySelectorAll(".select-item:checked")).map(
    (cb) => cb.dataset.username
  );
  const usernames = selected.length
    ? selected
    : currentNonFollowers.filter((p) => !p.whitelisted).map((p) => p.username);

  if (!usernames.length) return alert("Aucun profil a desabonner.");
  if (!confirm(`Demarrer l'auto-pilot sur ${usernames.length} profil(s) ? Rythme securise : max ${MAX_PER_HOUR}/h. Garde un onglet instagram.com ouvert.`)) return;

  chrome.runtime.sendMessage({ action: "START_AUTOPILOT", usernames }, () => {
    refreshAutopilotStatus();
  });
});

els.stopAutopilot.addEventListener("click", () => {
  chrome.runtime.sendMessage({ action: "STOP_AUTOPILOT" }, () => {
    refreshAutopilotStatus();
  });
});

function refreshAutopilotStatus() {
  chrome.runtime.sendMessage({ action: "AUTOPILOT_STATUS" }, (status) => {
    if (!status) return;
    els.autopilotStatus.textContent = status.active
      ? `Actif - file: ${status.queueLength} restants - ${status.count}/${status.max} cette heure`
      : `Inactif - ${status.count}/${status.max} cette heure`;
  });
}

setInterval(refreshAutopilotStatus, 15000);
refreshStats();
