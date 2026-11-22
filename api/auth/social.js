
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SECRET_KEY;

async function piUser(accessToken) {
  const response = await fetch("https://api.minepi.com/v2/me", {
    headers: { Authorization: `Bearer ${accessToken}` }
  });

  if (!response.ok) throw new Error("Pi authentication failed");

  const user = await response.json();
  return user.uid;
}

async function db(path, method = "GET", body) {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    method,
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      "Content-Type": "application/json",
      Prefer: "return=representation"
    },
    ...(body ? { body: JSON.stringify(body) } : {})
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.message || data.error || "Database error");
  }

  return data;
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "POST only" });
  }

  try {
    const {
      accessToken,
      action,
      postId,
      emoji,
      content,
      animation,
      vibeId
    } = req.body || {};

    if (!accessToken || !action) {
      return res.status(400).json({ error: "Missing accessToken or action" });
    }

    if (!SUPABASE_URL || !SUPABASE_KEY) {
      return res.status(500).json({ error: "Supabase environment variables missing" });
    }

    const uid = await piUser(accessToken);

    // REACTIONS
    if (action === "react") {
      if (!postId || !emoji) {
        return res.status(400).json({ error: "postId and emoji required" });
      }

      const rows = await db("reactions?on_conflict=post_id,user_id", "POST", {
        post_id: postId,
        user_id: uid,
        emoji
      });

      return res.status(200).json({ success: true, reactions: rows });
    }

    // COMMENTS
    if (action === "comment") {
      if (!postId || !content) {
        return res.status(400).json({ error: "postId and content required" });
      }

      const rows = await db("comments", "POST", {
        post_id: postId,
        user_id: uid,
        content,
        animation: animation || "none"
      });

      return res.status(200).json({ success: true, comment: rows[0] });
    }

    if (action === "list_comments") {
      if (!postId) {
        return res.status(400).json({ error: "postId required" });
      }

      const rows = await db(
        `comments?post_id=eq.${encodeURIComponent(postId)}&order=created_at.asc`
      );

      return res.status(200).json({ comments: rows });
    }

    // SAVE / UNSAVE
    if (action === "save" || action === "unsave") {
      if (!vibeId) {
        return res.status(400).json({ error: "vibeId required" });
      }

      if (action === "save") {
        const rows = await db("saved_vibes", "POST", {
          user_id: uid,
          vibe_id: vibeId
        });

        return res.status(200).json({ success: true, saved: rows });
      }

      await db(
        `saved_vibes?user_id=eq.${encodeURIComponent(uid)}&vibe_id=eq.${encodeURIComponent(vibeId)}`,
        "DELETE"
      );

      return res.status(200).json({ success: true, unsaved: true });
    }

    // SHARE
    if (action === "share") {
      if (!vibeId) {
        return res.status(400).json({ error: "vibeId required" });
      }

      return res.status(200).json({
        success: true,
        shareUrl: `https://pishadow-app.vercel.app/vibe/${encodeURIComponent(vibeId)}`
      });
    }

    // VIDEO VIEW
    if (action === "view") {
      if (!vibeId) {
        return res.status(400).json({ error: "vibeId required" });
      }

      const rows = await db("vibe_views", "POST", {
        vibe_id: vibeId,
        user_id: uid
      });

      return res.status(200).json({ success: true, view: rows[0] });
    }

    return res.status(400).json({ error: "Unknown action" });

  } catch (error) {
    console.error("Social API error:", error);
    return res.status(500).json({ error: error.message || "Server error" });
  }
}

