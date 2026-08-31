importScripts("db.js");

const MAX_PER_HOUR = 15;
const AUTO_PILOT_ALARM = "autoPilotTick";
const AUTO_SCAN_ALARM = "autoScanTick";
const ICON_DATA_URL = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAYAAACqaXHeAAAC7UlEQVR4nGNgGGBwwKrm/0Daz0gPSzZZd/xnYvjHwMTwnwFCwzCEz4hHzvjoBJq6kSaGr7bt/4/PU6QEADKfkeEfg87h6VR1M1UNW24/+T/MwbQKABhf4+BsqridKoYsdpyGkcRpHQAweZX98yjyA0Wa5zvP/I/qUPoHAIytsHchWX5hItfzc11n/2dggpowCPAj11iyahOyAmC229z/DIwMDIMNP3GLJjkQSEo20z0W/MefVAcuC6Crldixgii/EZ0CpnktGlRJnhB+6RVGVGogKgCm+CwZUp6H4dc+IQQDgWAATPJbNiQ9D8Nv/YLwBgILoQAgLo0MXYDXexMClw/K0p5U/D4wEGcqwBkAfcErh3TSR8cfg/2xBgLWAOgJXT2sPA/Dn0N9MQIBexkwzPM9MsDwalfk2mEZ+zD8NdIbJRVgpoARFPsMDGje7YhdN6xjH4a/x3rBUwFqCqDLANngAvAU0JawYUTEPgz/TPD4z8CAnAJGWN6HgdEAgLNGcgC0ZGz6z8Dwb6DdQnfwO8PtPyQFjMDSHwYgATBCkz8Dw2gAjAbAaAAwMDCM7ABoLt0yIqtAGGCq7fZhHOgxu4HEo1mAgYFhNABGA2A0AAbYFQMIRnxniImBgYGhpt6PcaCHqAYCs9bvYhwdEIGzRgNgAF0xgADu7arygBFVDrCX72BkYBidGEFN+BUlQSMiFXCWbINH9ejkKLpAWUHwsE4F3AVbUTL66AIJbIIlOaHDMhXw5mzGKOZxxnVRVviwCgT+rI1Y6zi8ib0gI3JYDJcJZqzHWcGPLpQkpCAvNWpIZwXh1HV4m3dExW9OcsyQDATR5DUE27ZEJ/CsxLghFQjiiauIatiT1fqfvXju/8G6YUImdilJfiI6BSCD1NjkQVk7kOp5BgYyA4CBgYEhOSZ1UGUJuZjFZKVmqnSAF68YwH2DEQO4bxAdLF9Fx52jYYNo5yg6WL2GhnuHQwbx3mFcYNM6CnaPB02gqRsBqGzBdfOJ5JwAAAAASUVORK5CYII=";

chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.set({ autoPilotActive: false });
  chrome.alarms.create(AUTO_SCAN_ALARM, { periodInMinutes: 60 });
});

async function findInstagramTab() {
  const tabs = await chrome.tabs.query({ url: "https://www.instagram.com/*" });
  return tabs[0] || null;
}

async function relayToContentScript(message) {
  const tab = await findInstagramTab();
  if (!tab) throw new Error("Aucun onglet instagram.com ouvert. Ouvrez instagram.com et reessayez.");
  return new Promise((resolve, reject) => {
    chrome.tabs.sendMessage(tab.id, message, (response) => {
      if (chrome.runtime.lastError) {
        reject(new Error("Impossible de contacter la page Instagram. Rechargez l'onglet instagram.com."));
      } else {
        resolve(response);
      }
    });
  });
}

async function scanAndSave(username) {
  const result = await relayToContentScript({ action: "CS_SCAN", username });
  if (!result || !result.success) throw new Error(result?.error || "Scan echoue");
  const lostFollowers = await saveProfilesAndDetectLost(result.following, result.followers);
  const nonFollowersCount = result.following.filter(
    (f) => !result.followers.some((x) => x.username === f.username)
  ).length;
  await addScanRecord(result.following.length, result.followers.length, nonFollowersCount);
  if (lostFollowers.length) {
    notify(
      "Quelqu'un vous a unfollow",
      lostFollowers.length === 1
        ? `@${lostFollowers[0]} ne vous suit plus.`
        : `${lostFollowers.length} comptes ne vous suivent plus.`
    );
  }
  return { nonFollowersCount, lostFollowers };
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  (async () => {
    if (msg.action === "SCAN_REQUEST") {
      try {
        await chrome.storage.local.set({ lastUsername: msg.username });
        const r = await scanAndSave(msg.username);
        sendResponse({ success: true, ...r });
      } catch (e) {
        sendResponse({ success: false, error: e.message });
      }
    }

    if (msg.action === "UNFOLLOW_REQUEST") {
      try {
        const result = await relayToContentScript({ action: "CS_UNFOLLOW", userId: msg.userId });
        if (result && result.success) await markUnfollowed(msg.username);
        sendResponse(result);
      } catch (e) {
        sendResponse({ success: false, error: e.message });
      }
    }

    if (msg.action === "FETCH_IMAGE_REQUEST") {
      try {
        const result = await relayToContentScript({ action: "CS_FETCH_IMAGE", url: msg.url });
        sendResponse(result);
      } catch (e) {
        sendResponse({ success: false, error: e.message });
      }
    }

    if (msg.action === "START_AUTOPILOT") {
      await setQueue(msg.usernames);
      await chrome.storage.local.set({ autoPilotActive: true });
      chrome.alarms.create(AUTO_PILOT_ALARM, { periodInMinutes: 5 });
      processAutoPilotTick();
      sendResponse({ success: true });
    }

    if (msg.action === "STOP_AUTOPILOT") {
      await chrome.storage.local.set({ autoPilotActive: false });
      chrome.alarms.clear(AUTO_PILOT_ALARM);
      await clearQueue();
      sendResponse({ success: true });
    }

    if (msg.action === "AUTOPILOT_STATUS") {
      const { autoPilotActive } = await chrome.storage.local.get("autoPilotActive");
      const queue = await getQueue();
      const count = await getUnfollowCountLastHour();
      sendResponse({ active: !!autoPilotActive, queueLength: queue.length, count, max: MAX_PER_HOUR });
    }
  })();
  return true;
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === AUTO_PILOT_ALARM) processAutoPilotTick();
  if (alarm.name === AUTO_SCAN_ALARM) processAutoScanTick();
});

async function processAutoScanTick() {
  try {
    const tab = await findInstagramTab();
    if (!tab) return;
    const { lastUsername } = await chrome.storage.local.get("lastUsername");
    if (!lastUsername) return;
    await scanAndSave(lastUsername);
  } catch (e) {
    console.warn("Auto-scan echoue:", e.message);
  }
}

async function processAutoPilotTick() {
  const { autoPilotActive } = await chrome.storage.local.get("autoPilotActive");
  if (!autoPilotActive) return;

  const queue = await getQueue();
  if (queue.length === 0) {
    await chrome.storage.local.set({ autoPilotActive: false });
    chrome.alarms.clear(AUTO_PILOT_ALARM);
    notify("Auto-pilot termine", "La file de desabonnement est vide.");
    return;
  }

  const countLastHour = await getUnfollowCountLastHour();
  if (countLastHour >= MAX_PER_HOUR) {
    notify("Auto-pilot en pause", `Limite de ${MAX_PER_HOUR}/h atteinte. Reprise au prochain cycle.`);
    return;
  }

  const remainingBudget = MAX_PER_HOUR - countLastHour;
  const batch = queue.slice(0, Math.min(remainingBudget, 3));
  const profiles = await getAllProfiles();
  const profileMap = new Map(profiles.map((p) => [p.username, p]));

  for (const item of batch) {
    const profile = profileMap.get(item.username);
    if (!profile || profile.whitelisted) {
      await popFromQueue(item.username);
      continue;
    }
    try {
      const result = await relayToContentScript({ action: "CS_UNFOLLOW", userId: profile.user_id });
      if (result && result.success) {
        await markUnfollowed(profile.username);
        notify("Desabonnement effectue", `@${profile.username}`);
      } else {
        notify("Echec desabonnement", `@${profile.username}`);
      }
    } catch (e) {
      notify("Auto-pilot en pause", e.message);
      break;
    }
    await popFromQueue(item.username);
  }
}

function notify(title, message) {
  chrome.notifications.create({ type: "basic", iconUrl: ICON_DATA_URL, title, message });
}
