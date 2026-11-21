
export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { accessToken, limit = 10, offset = 0 } = req.body || {};

    if (!accessToken) {
      return res.status(400).json({ error: "Pi access token required" });
    }

    const pageSize = Number(limit);
    const pageOffset = Number(offset);

    if (
      !Number.isInteger(pageSize) ||
      pageSize < 1 ||
      pageSize > 30 ||
      !Number.isInteger(pageOffset) ||
      pageOffset < 0
    ) {
      return res.status(400).json({ error: "Invalid pagination" });
    }

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
      return res.status(500).json({ error: "Server configuration missing" });
    }

    const url = new URL(`${supabaseUrl}/rest/v1/reels`);
    url.searchParams.set(
      "select",
      "id,user_id,video_path,caption,text_settings,created_at"
    );
    url.searchParams.set("visibility", "eq.public");
    url.searchParams.set("order", "created_at.desc");
    url.searchParams.set("limit", String(pageSize));
    url.searchParams.set("offset", String(pageOffset));

    const response = await fetch(url, {
      headers: {
        apikey: supabaseKey,
        Authorization: `Bearer ${supabaseKey}`
      }
    });

    const data = await response.json();

    if (!response.ok) {
      console.error("Feed error:", data);
      return res.status(500).json({ error: "Could not load video feed" });
    }

    return res.status(200).json({
      success: true,
      viewerUid: piUser.uid,
      videos: data,
      limit: pageSize,
      offset: pageOffset
    });

  } catch (error) {
    console.error("Feed API error:", error);
    return res.status(500).json({ error: "Server error" });
  }
}
