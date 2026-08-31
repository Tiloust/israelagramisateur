const MAX_PER_HOUR = 15;

const els = {
  username: document.getElementById("username"),
  scanBtn: document.getElementById("scanBtn"),
  scanStatus: document.getElementById("scanStatus"),
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
  profileList: document.getElementById("profileList"),
  historyChart: document.getElementById("historyChart")
};

let currentNonFollowers = [];

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
  drawChart(history);
  renderList();
  refreshAutopilotStatus();
}

function drawChart(history) {
  const ctx = els.historyChart.getContext("2d");
  const w = els.historyChart.width;
  const h = els.historyChart.height;
  ctx.clearRect(0, 0, w, h);
  if (history.length < 2) {
    ctx.fillStyle = "#999";
    ctx.font = "13px sans-serif";
    ctx.fillText("Scannez au moins deux fois pour voir l'evolution.", 16, h / 2);
    return;
  }

  const maxVal = Math.max(...history.map((s) => s.total_following), 1);
  const padding = 30;
  const stepX = (w - padding * 2) / (history.length - 1);

  function plot(key, color) {
    ctx.beginPath();
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    history.forEach((s, i) => {
      const x = padding + i * stepX;
      const y = h - padding - (s[key] / maxVal) * (h - padding * 2);
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    });
    ctx.stroke();
  }

  plot("total_following", "#833ab4");
  plot("total_followers", "#0095f6");
  plot("non_followers_count", "#ed4956");

  ctx.fillStyle = "#833ab4"; ctx.fillText("Abonnements", w - 220, 16);
  ctx.fillStyle = "#0095f6"; ctx.fillText("Abonnes", w - 220, 32);
  ctx.fillStyle = "#ed4956"; ctx.fillText("Non-followers", w - 220, 48);
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

  list.sort((a, b) => {
    if (sortBy === "first_seen") return a.first_seen - b.first_seen;
    return a.username.localeCompare(b.username);
  });

  els.listCount.textContent = `${list.length} profil(s)`;
  els.profileList.innerHTML = "";

  list.forEach((profile) => {
    const card = document.createElement("div");
    card.className = "profile-card";
    card.innerHTML = `
      <input type="checkbox" class="select-item" data-username="${profile.username}" />
      <img src="${profile.profile_pic_url}" referrerpolicy="no-referrer" />
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
  try {
    const ok = await unfollowUser(btn.dataset.id);
    if (ok) {
      await markUnfollowed(btn.dataset.username);
      btn.textContent = "✅";
      await refreshStats();
    } else {
      btn.textContent = "❌ Reessayer";
      btn.disabled = false;
    }
  } catch (e) {
    btn.textContent = "❌ Erreur";
    btn.disabled = false;
  }
}

els.scanBtn.addEventListener("click", async () => {
  const username = els.username.value.trim();
  if (!username) return alert("Entrez votre nom d'utilisateur Instagram.");

  els.scanBtn.disabled = true;
  els.scanStatus.textContent = "Connexion a Instagram...";

  try {
    const userId = await getUserId(username);
    const following = await fetchList(userId, "following", (n) => {
      els.scanStatus.textContent = `Abonnements charges : ${n}...`;
    });
    const followers = await fetchList(userId, "followers", (n) => {
      els.scanStatus.textContent = `Abonnes charges : ${n}...`;
    });

    await saveProfiles(following, followers);
    const nonFollowersCount = following.filter(
      (f) => !followers.some((x) => x.username === f.username)
    ).length;
    await addScanRecord(following.length, followers.length, nonFollowersCount);

    els.scanStatus.textContent = `Scan termine : ${nonFollowersCount} non-followers trouves.`;
    await refreshStats();
  } catch (e) {
    els.scanStatus.textContent = "Erreur : " + e.message;
  } finally {
    els.scanBtn.disabled = false;
  }
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
  if (!confirm(`Demarrer l'auto-pilot sur ${usernames.length} profil(s) ? Rythme securise : max ${MAX_PER_HOUR}/h.`)) return;

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
      ? `Actif · file: ${status.queueLength} restants · ${status.count}/${status.max} cette heure`
      : `Inactif · ${status.count}/${status.max} cette heure`;
  });
}

setInterval(refreshAutopilotStatus, 15000);
refreshStats();
