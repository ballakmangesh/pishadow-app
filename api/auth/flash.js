
const EFFECTS = [
  "none",
  "flying-kiss",
  "floating-hearts",
  "sparkles",
  "fire",
  "celebration"
];

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const {
      accessToken,
      action,
      content = "",
      mediaPath = null,
      flashType = "text",
      effect = "none",
      flashId
    } = req.body || {};

    if (!accessToken || !action) {
      return res.status(400).json({ error: "Missing required fields" });
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

    const tableUrl = `${supabaseUrl}/rest/v1/flashes`;

    const headers = {
      apikey: supabaseKey,
      Authorization: `Bearer ${supabaseKey}`,
      "Content-Type": "application/json"
    };

    // Create a Flash
    if (action === "create") {
      if (!["text", "photo", "video"].includes(flashType)) {
        return res.status(400).json({ error: "Invalid Flash type" });
      }

      if (typeof content !== "string" || content.length > 2000) {
        return res.status(400).json({ error: "Text is too long" });
      }

      if (!EFFECTS.includes(effect)) {
        return res.status(400).json({ error: "Invalid animation effect" });
      }

      if (flashType === "text" && !content.trim()) {
        return res.status(400).json({ error: "Text is required" });
      }

      if (flashType !== "text") {
        if (
          typeof mediaPath !== "string" ||
          !mediaPath.startsWith(`${piUser.uid}/`) ||
          mediaPath.includes("..")
        ) {
          return res.status(400).json({ error: "Invalid media path" });
        }
      }

      const expiresAt = new Date(
        Date.now() + 24 * 60 * 60 * 1000
      ).toISOString();

      const response = await fetch(tableUrl, {
        method: "POST",
        headers: {
          ...headers,
          Prefer: "return=representation"
        },
        body: JSON.stringify({
          user_id: piUser.uid,
          flash_type: flashType,
          content: content.trim(),
          media_path: mediaPath,
          effect,
          expires_at: expiresAt
        })
      });

      const result = await response.json();

      if (!response.ok) {
        console.error("Flash create error:", result);
        return res.status(500).json({ error: "Could not create Flash" });
      }

      return res.status(201).json({
        success: true,
        flash: result[0]
      });
    }

    // List your own active Flash posts
    if (action === "list") {
      const query = new URL(tableUrl);

      query.searchParams.set("select", "*");
      query.searchParams.set("user_id", `eq.${piUser.uid}`);
      query.searchParams.set("expires_at", `gt.${new Date().toISOString()}`);
      query.searchParams.set("order", "created_at.desc");
      query.searchParams.set("limit", "100");

      const response = await fetch(query.toString(), { headers });
      const flashes = await response.json();

      if (!response.ok) {
        console.error("Flash list error:", flashes);
        return res.status(500).json({ error: "Could not load Flash posts" });
      }

      return res.status(200).json({
        success: true,
        flashes
      });
    }

    // Delete your own Flash
    if (action === "delete") {
      if (!flashId || !/^[1-9]\d*$/.test(String(flashId))) {
        return res.status(400).json({ error: "Invalid Flash ID" });
      }

      const query = new URL(tableUrl);

      query.searchParams.set("id", `eq.${flashId}`);
      query.searchParams.set("user_id", `eq.${piUser.uid}`);

      const response = await fetch(query.toString(), {
        method: "DELETE",
        headers: {
          ...headers,
          Prefer: "return=representation"
        }
      });

      if (!response.ok) {
        console.error("Flash delete error:", await response.text());
        return res.status(500).json({ error: "Could not delete Flash" });
      }

      return res.status(200).json({
        success: true,
        message: "Flash deleted"
      });
    }

    return res.status(400).json({ error: "Invalid action" });

  } catch (error) {
    console.error("P!Flash API error:", error);
    return res.status(500).json({ error: "P!Flash request failed" });
  }
}
