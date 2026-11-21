
const EMOTIONS = [
  "😘", "❤️", "💜", "😍", "🥰",
  "😂", "🤣", "😊", "😢", "😭",
  "😡", "🤬", "😮", "😲", "🤔",
  "😎", "🥳", "🔥", "👏", "🙏",
  "🤗", "💯", "🤩", "😴", "🤯",
  "😇", "🥺", "😏", "🙄", "🤫",
  "🤭", "😬", "🤮", "🤒", "🤧",
  "😈", "👻", "💔", "💖", "💋"
];

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const {
      accessToken,
      action,
      postId,
      reaction
    } = req.body || {};

    if (!accessToken || !action || !postId) {
      return res.status(400).json({
        error: "Missing required fields"
      });
    }

    if (!/^[1-9]\d*$/.test(String(postId))) {
      return res.status(400).json({ error: "Invalid post ID" });
    }

    // Verify Pi account
    const piResponse = await fetch("https://api.minepi.com/v2/me", {
      headers: {
        Authorization: `Bearer ${accessToken}`
      }
    });

    if (!piResponse.ok) {
      return res.status(401).json({
        error: "Pi authentication failed"
      });
    }

    const piUser = await piResponse.json();

    if (!piUser.uid) {
      return res.status(401).json({ error: "Invalid Pi user" });
    }

    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SECRET_KEY;

    if (!supabaseUrl || !supabaseKey) {
      return res.status(500).json({
        error: "Database configuration missing"
      });
    }

    const tableUrl = `${supabaseUrl}/rest/v1/reactions`;

    const headers = {
      apikey: supabaseKey,
      Authorization: `Bearer ${supabaseKey}`,
      "Content-Type": "application/json"
    };

    // Add or change reaction
    if (action === "react") {
      if (!EMOTIONS.includes(reaction)) {
        return res.status(400).json({
          error: "Unsupported reaction"
        });
      }

      const response = await fetch(
        `${tableUrl}?on_conflict=post_id%2Cuser_id`,
        {
          method: "POST",
          headers: {
            ...headers,
            Prefer: "resolution=merge-duplicates,return=representation"
          },
          body: JSON.stringify({
            post_id: Number(postId),
            user_id: piUser.uid,
            reaction
          })
        }
      );

      const result = await response.json();

      if (!response.ok) {
        console.error("Reaction save error:", result);
        return res.status(500).json({
          error: "Could not save reaction"
        });
      }

      return res.status(200).json({
        success: true,
        reaction
      });
    }

    // Remove user's reaction
    if (action === "remove") {
      const url = new URL(tableUrl);
      url.searchParams.set("post_id", `eq.${postId}`);
      url.searchParams.set("user_id", `eq.${piUser.uid}`);

      const response = await fetch(url.toString(), {
        method: "DELETE",
        headers
      });

      if (!response.ok) {
        console.error("Reaction remove error:", await response.text());
        return res.status(500).json({
          error: "Could not remove reaction"
        });
      }

      return res.status(200).json({
        success: true,
        message: "Reaction removed"
      });
    }

    // Get reaction counts for a post
    if (action === "summary") {
      const url = new URL(tableUrl);
      url.searchParams.set("select", "user_id,reaction");
      url.searchParams.set("post_id", `eq.${postId}`);
      url.searchParams.set("limit", "1000");

      const response = await fetch(url.toString(), { headers });
      const rows = await response.json();

      if (!response.ok) {
        console.error("Reaction summary error:", rows);
        return res.status(500).json({
          error: "Could not load reactions"
        });
      }

      const counts = {};

      for (const row of rows) {
        counts[row.reaction] = (counts[row.reaction] || 0) + 1;
      }

      const myReaction =
        rows.find(row => row.user_id === piUser.uid)?.reaction || null;

      return res.status(200).json({
        success: true,
        counts,
        total: rows.length,
        myReaction
      });
    }

    return res.status(400).json({ error: "Invalid action" });

  } catch (error) {
    console.error("Reaction API error:", error);
    return res.status(500).json({
      error: "Reaction request failed"
    });
  }
}
