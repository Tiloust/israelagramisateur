const DB_NAME = "IUTProDatabase";
const DB_VERSION = 1;

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains("profiles")) {
        const store = db.createObjectStore("profiles", { keyPath: "username" });
        store.createIndex("is_follower", "is_follower");
        store.createIndex("unfollowed", "unfollowed");
        store.createIndex("whitelisted", "whitelisted");
      }
      if (!db.objectStoreNames.contains("scans")) {
        db.createObjectStore("scans", { keyPath: "id", autoIncrement: true });
      }
      if (!db.objectStoreNames.contains("unfollow_log")) {
        db.createObjectStore("unfollow_log", { keyPath: "id", autoIncrement: true });
      }
      if (!db.objectStoreNames.contains("queue")) {
        db.createObjectStore("queue", { keyPath: "username" });
      }
    };
    req.onsuccess = (e) => resolve(e.target.result);
    req.onerror = (e) => reject(e.target.error);
  });
}

async function tx(storeName, mode, fn) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(storeName, mode);
    const store = transaction.objectStore(storeName);
    const result = fn(store);
    transaction.oncomplete = () => resolve(result);
    transaction.onerror = (e) => reject(e.target.error);
  });
}

async function saveProfiles(following, followers) {
  const followerSet = new Set(followers.map((f) => f.username));
  const now = Date.now();
  const db = await openDB();
  const transaction = db.transaction("profiles", "readwrite");
  const store = transaction.objectStore("profiles");

  for (const profile of following) {
    const existingReq = store.get(profile.username);
    await new Promise((resolve) => {
      existingReq.onsuccess = () => {
        const existing = existingReq.result;
        store.put({
          username: profile.username,
          full_name: profile.full_name,
          profile_pic_url: profile.profile_pic_url,
          user_id: profile.user_id,
          is_following: 1,
          is_follower: followerSet.has(profile.username) ? 1 : 0,
          whitelisted: existing ? existing.whitelisted : 0,
          unfollowed: existing ? existing.unfollowed : 0,
          unfollowed_at: existing ? existing.unfollowed_at : null,
          first_seen: existing ? existing.first_seen : now,
          last_seen: now
        });
        resolve();
      };
    });
  }

  return new Promise((resolve) => {
    transaction.oncomplete = () => resolve();
  });
}

async function addScanRecord(totalFollowing, totalFollowers, nonFollowersCount) {
  return tx("scans", "readwrite", (store) => {
    store.add({
      timestamp: Date.now(),
      total_following: totalFollowing,
      total_followers: totalFollowers,
      non_followers_count: nonFollowersCount
    });
  });
}

async function getScanHistory() {
  const db = await openDB();
  return new Promise((resolve) => {
    const store = db.transaction("scans", "readonly").objectStore("scans");
    const req = store.getAll();
    req.onsuccess = () => resolve(req.result.sort((a, b) => a.timestamp - b.timestamp));
  });
}

async function getAllProfiles() {
  const db = await openDB();
  return new Promise((resolve) => {
    const req = db.transaction("profiles", "readonly").objectStore("profiles").getAll();
    req.onsuccess = () => resolve(req.result);
  });
}

async function getNonFollowers() {
  const all = await getAllProfiles();
  return all.filter((p) => p.is_following === 1 && p.is_follower === 0 && p.unfollowed === 0);
}

async function toggleWhitelist(username, value) {
  return tx("profiles", "readwrite", (store) => {
    const req = store.get(username);
    req.onsuccess = () => {
      const profile = req.result;
      if (profile) {
        profile.whitelisted = value ? 1 : 0;
        store.put(profile);
      }
    };
  });
}

async function markUnfollowed(username) {
  const now = Date.now();
  await tx("profiles", "readwrite", (store) => {
    const req = store.get(username);
    req.onsuccess = () => {
      const profile = req.result;
      if (profile) {
        profile.unfollowed = 1;
        profile.unfollowed_at = now;
        store.put(profile);
      }
    };
  });
  return tx("unfollow_log", "readwrite", (store) => {
    store.add({ username, timestamp: now });
  });
}

async function getUnfollowCountLastHour() {
  const db = await openDB();
  return new Promise((resolve) => {
    const req = db.transaction("unfollow_log", "readonly").objectStore("unfollow_log").getAll();
    req.onsuccess = () => {
      const oneHourAgo = Date.now() - 3600000;
      resolve(req.result.filter((l) => l.timestamp > oneHourAgo).length);
    };
  });
}

async function setQueue(usernames) {
  const db = await openDB();
  const transaction = db.transaction("queue", "readwrite");
  const store = transaction.objectStore("queue");
  store.clear();
  usernames.forEach((u) => store.put({ username: u, added_at: Date.now() }));
  return new Promise((resolve) => (transaction.oncomplete = () => resolve()));
}

async function getQueue() {
  const db = await openDB();
  return new Promise((resolve) => {
    const req = db.transaction("queue", "readonly").objectStore("queue").getAll();
    req.onsuccess = () => resolve(req.result);
  });
}

async function popFromQueue(username) {
  return tx("queue", "readwrite", (store) => {
    store.delete(username);
  });
}

async function clearQueue() {
  return tx("queue", "readwrite", (store) => {
    store.clear();
  });
}

async function exportNonFollowersJSON() {
  const nonFollowers = await getNonFollowers();
  return JSON.stringify(nonFollowers, null, 2);
}

async function exportNonFollowersCSV() {
  const nonFollowers = await getNonFollowers();
  const header = "username,full_name,profile_url,whitelisted\n";
  const rows = nonFollowers
    .map(
      (p) =>
        `${p.username},"${(p.full_name || "").replace(/"/g, "'")}",https://instagram.com/${p.username},${p.whitelisted ? "yes" : "no"}`
    )
    .join("\n");
  return header + rows;
}
