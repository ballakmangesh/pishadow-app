
export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { accessToken, vibeId } = req.body || {};
    const id = Number(vibeId);

    if (
      !accessToken ||
      !Number.isSafeInteger(id) ||
      id <= 0
    ) {
      return res.status(400).json({
        error: "Valid access token and video ID required"
      });
    }

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
      return res.status(401).json({
        error: "Invalid Pi user"
      });
    }

    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SECRET_KEY;

    if (!supabaseUrl || !supabaseKey) {
      return res.status(500).json({
        error: "Server configuration missing"
      });
    }

    const response = await fetch(
      `${supabaseUrl}/rest/v1/vibe_views?on_conflict=vibe_id,user_id`,
      {
        method: "POST",
        headers: {
          apikey: supabaseKey,
          Authorization: `Bearer ${supabaseKey}`,
          "Content-Type": "application/json",
          Prefer: "resolution=ignore-duplicates,return=minimal"
        },
        body: JSON.stringify({
          vibe_id: id,
          user_id: piUser.uid
        })
      }
    );

    if (!response.ok) {
      console.error("View save error:", await response.text());
      return res.status(500).json({
        error: "Could not record video view"
      });
    }

    return res.status(200).json({
      success: true,
      message: "Video view recorded"
    });

  } catch (error) {
    console.error("Views API error:", error);
    return res.status(500).json({
      error: "Server error"
    });
  }
}
