
export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const {
      accessToken,
      action,
      postType,
      content = "",
      mediaPath = null,
      visibility = "public",
      limit = 30,
      offset = 0
    } = req.body || {};

    if (!accessToken) {
      return res.status(400).json({ error: "Missing access token" });
    }

    // Verify Pi account
    const piResponse = await fetch("https://api.minepi.com/v2/me", {
      headers: {
        Authorization: `Bearer ${accessToken}`
      }
    });

    if (!piResponse.ok) {
      return res.status(401).json({ error: "Pi authentication failed" });
    }

    const piUser = await piResponse.json();

    if (!piUser.uid) {
      return res.status(401).json({ error: "Invalid Pi user" });
    }

    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SECRET_KEY;

    if (!supabaseUrl || !supabaseKey) {
      return res.status(500).json({ error: "Database configuration missing" });
    }

    const headers = {
      apikey: supabaseKey,
      Authorization: `Bearer ${supabaseKey}`,
      "Content-Type": "application/json"
    };

    const tableUrl = `${supabaseUrl}/rest/v1/posts`;

    // Create a post
    if (action === "create") {
      if (!["text", "photo", "video"].includes(postType)) {
        return res.status(400).json({ error: "Invalid post type" });
      }

      if (typeof content !== "string" || content.length > 5000) {
        return res.status(400).json({ error: "Post text is too long" });
      }

      if (!["public", "private"].includes(visibility)) {
        return res.status(400).json({ error: "Invalid visibility" });
      }

      if (postType === "text" && !content.trim()) {
        return res.status(400).json({ error: "Post text is required" });
      }

      if (postType !== "text") {
        if (
          typeof mediaPath !== "string" ||
          !mediaPath.startsWith(`${piUser.uid}/`) ||
          mediaPath.includes("..")
        ) {
          return res.status(400).json({ error: "Invalid media path" });
        }
      }

      const insertResponse = await fetch(tableUrl, {
        method: "POST",
        headers: {
          ...headers,
          Prefer: "return=representation"
        },
        body: JSON.stringify({
          user_id: piUser.uid,
          post_type: postType,
          content: content.trim(),
          media_path: mediaPath,
          visibility
        })
      });

      const result = await insertResponse.json();

      if (!insertResponse.ok) {
        console.error("Post creation error:", result);
        return res.status(500).json({ error: "Could not create post" });
      }

      return res.status(201).json({
        success: true,
        post: result[0]
      });
    }

    // List only the logged-in user's posts
    if (action === "list") {
      const safeLimit = Math.min(Math.max(Number(limit) || 30, 1), 100);
      const safeOffset = Math.max(Number(offset) || 0, 0);

      const params = new URLSearchParams({
        select: "*",
        user_id: `eq.${piUser.uid}`,
        order: "created_at.desc",
        limit: String(safeLimit),
        offset: String(safeOffset)
      });

      const listResponse = await fetch(
        `${tableUrl}?${params.toString()}`,
        { headers }
      );

      const posts = await listResponse.json();

      if (!listResponse.ok) {
        console.error("Post list error:", posts);
        return res.status(500).json({ error: "Could not load posts" });
      }

      return res.status(200).json({
        success: true,
        posts
      });
    }

    return res.status(400).json({ error: "Invalid action" });

  } catch (error) {
    console.error("Posts API error:", error);
    return res.status(500).json({ error: "Posts request failed" });
  }
}
