const APP_ID = "936619743392459";

function humanDelay(minS = 2, maxS = 5) {
  const mean = (minS + maxS) / 2;
  const std = (maxS - minS) / 4;
  let delay = mean + std * (Math.random() + Math.random() + Math.random() - 1.5);
  delay = Math.max(minS, Math.min(maxS, delay));
  return new Promise((r) => setTimeout(r, delay * 1000));
}

async function getCSRFToken() {
  const cookie = await chrome.cookies.get({ url: "https://www.instagram.com", name: "csrftoken" });
  return cookie ? cookie.value : null;
}

async function igFetch(url, options = {}) {
  const csrf = await getCSRFToken();
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
  if (!res.ok) throw new Error(`Profil introuvable (${res.status}). Verifiez que vous etes connecte sur instagram.com.`);
  const data = await res.json();
  return data.data.user.id;
}

async function fetchList(userId, type, onProgress) {
  let items = [];
  let maxId = "";
  let hasNext = true;

  while (hasNext) {
    const url = `https://www.instagram.com/api/v1/friendships/${userId}/${type}/?count=50&max_id=${maxId}`;
    const res = await igFetch(url);
    if (!res.ok) throw new Error(`Erreur recuperation ${type}: ${res.status}`);
    const data = await res.json();

    items = items.concat(
      data.users.map((u) => ({
        username: u.username,
        full_name: u.full_name || "",
        profile_pic_url: u.profile_pic_url,
        user_id: u.pk
      }))
    );

    onProgress && onProgress(items.length);
    hasNext = !!data.next_max_id;
    maxId = data.next_max_id || "";
    if (hasNext) await humanDelay(2, 5);
  }
  return items;
}

async function unfollowUser(targetUserId) {
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
