const APP_ID = "936619743392459";

function humanDelay(minS = 2, maxS = 5) {
  const mean = (minS + maxS) / 2;
  const std = (maxS - minS) / 4;
  let delay = mean + std * (Math.random() + Math.random() + Math.random() - 1.5);
  delay = Math.max(minS, Math.min(maxS, delay));
  return new Promise((r) => setTimeout(r, delay * 1000));
}

function getCSRFToken() {
  const match = document.cookie.match(/csrftoken=([^;]+)/);
  return match ? match[1] : null;
}

async function igFetch(url, options = {}) {
  const csrf = getCSRFToken();
  const headers = Object.assign(
    { "x-ig-app-id": APP_ID, "x-csrftoken": csrf || "" },
    options.headers || {}
  );
  return fetch(url, { ...options, headers, credentials: "include" });
}

async function getUserId(username) {
  const res = await igFetch(
    `https://www.instagram.com/api/v1/users/web_profile_info/?username=${encodeURIComponent(username)}`
  );
  if (!res.ok) throw new Error(`Profil introuvable (${res.status}).`);
  const data = await res.json();
  return data.data.user.id;
}

async function fetchList(userId, type) {
  let items = [];
  let maxId = "";
  let hasNext = true;
  while (hasNext) {
    const url = `https://www.instagram.com/api/v1/friendships/${userId}/${type}/?count=50&max_id=${maxId}`;
    const res = await igFetch(url);
    if (!res.ok) throw new Error(`Erreur ${type}: ${res.status}`);
    const data = await res.json();
    items = items.concat(
      data.users.map((u) => ({
        username: u.username,
        full_name: u.full_name || "",
        profile_pic_url: u.profile_pic_url,
        user_id: u.pk
      }))
    );
    hasNext = !!data.next_max_id;
    maxId = data.next_max_id || "";
    if (hasNext) await humanDelay(2, 5);
  }
  return items;
}

async function unfollow(targetUserId) {
  const res = await igFetch(
    `https://www.instagram.com/api/v1/friendships/destroy/${targetUserId}/`,
    {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: "container_module=unfollow_tracker_pro"
    }
  );
  return res.ok;
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.action === "CS_SCAN") {
    (async () => {
      try {
        const userId = await getUserId(msg.username);
        const following = await fetchList(userId, "following");
        await humanDelay(2, 4);
        const followers = await fetchList(userId, "followers");
        sendResponse({ success: true, following, followers });
      } catch (e) {
        sendResponse({ success: false, error: e.message });
      }
    })();
    return true;
  }

  if (msg.action === "CS_UNFOLLOW") {
    (async () => {
      try {
        const ok = await unfollow(msg.userId);
        sendResponse({ success: ok });
      } catch (e) {
        sendResponse({ success: false, error: e.message });
      }
    })();
    return true;
  }
});
