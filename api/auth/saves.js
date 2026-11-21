
export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { accessToken, action, vibeId } = req.body || {};

    if (!accessToken || !action) {
      return res.status(400).json({
        error: "Missing access token or action"
      });
    }

    if (!["save", "unsave", "list"].includes(action)) {
      return res.status(400).json({ error: "Invalid action" });
    }

    // Verify Pi user
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
        error: "Server configuration missing"
      });
    }

    const headers = {
      apikey: supabaseKey,
      Authorization: `Bearer ${supabaseKey}`,
      "Content-Type": "application/json",
      Prefer: "return=representation"
    };

    const tableUrl = `${supabaseUrl}/rest/v1/saved_vibes`;

    if (action === "list") {
      const url = new URL(tableUrl);
      url.searchParams.set("user_id", `eq.${piUser.uid}`);
      url.searchParams.set("select", "vibe_id");
      url.searchParams.set("order", "created_at.desc");

      const response = await fetch(url, { headers });
      const data = await response.json();

      if (!response.ok) {
        return res.status(500).json({
          error: "Could not load saved videos"
        });
      }

      return res.status(200).json({
        success: true,
        savedVibes: data
      });
    }

    if (!Number.isSafeInteger(Number(vibeId)) ||
        Number(vibeId) <= 0) {
      return res.status(400).json({
        error: "Valid vibe ID required"
      });
    }

    const url = new URL(tableUrl);
    url.searchParams.set("user_id", `eq.${piUser.uid}`);
    url.searchParams.set("vibe_id", `eq.${Number(vibeId)}`);

    if (action === "save") {
      const response = await fetch(tableUrl, {
        method: "POST",
        headers: {
          ...headers,
          Prefer: "resolution=ignore-duplicates,return=representation"
        },
        body: JSON.stringify({
          user_id: piUser.uid,
          vibe_id: Number(vibeId)
        })
      });

      if (!response.ok) {
        console.error("Save error:", await response.text());
        return res.status(500).json({
          error: "Could not save video"
        });
      }

      return res.status(200).json({
        success: true,
        message: "Video saved successfully"
      });
    }

    if (action === "unsave") {
      const response = await fetch(url, {
        method: "DELETE",
        headers
      });

      if (!response.ok) {
        console.error("Unsave error:", await response.text());
        return res.status(500).json({
          error: "Could not remove saved video"
        });
      }

      return res.status(200).json({
        success: true,
        message: "Video removed from saved list"
      });
    }
  } catch (error) {
    console.error("Saves API error:", error);
    return res.status(500).json({
      error: "Server error"
    });
  }
}
