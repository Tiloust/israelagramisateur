document.getElementById("openDashboard").addEventListener("click", () => {
  chrome.tabs.create({ url: chrome.runtime.getURL("dashboard.html") });
});

chrome.runtime.sendMessage({ action: "AUTOPILOT_STATUS" }, (status) => {
  if (status) {
    document.getElementById("quickStats").textContent = status.active
      ? `Auto-pilot actif · file: ${status.queueLength} · ${status.count}/${status.max} cette heure`
      : `Auto-pilot inactif · ${status.count}/${status.max} desabonnements cette heure`;
  }
});
