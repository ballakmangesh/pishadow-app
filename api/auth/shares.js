
export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { accessToken, vibeId } = req.body || {};

    if (!accessToken || !Number.isSafeInteger(Number(vibeId)) ||
        Number(vibeId) <= 0) {
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
      return res.status(401).json({ error: "Invalid Pi user" });
    }

    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SECRET_KEY;

    if (!supabaseUrl || !supabaseKey) {
      return res.status(500).json({
        error: "Server configuration missing"
      });
    }

    const videoUrl = new URL(
      "/vibe/" + Number(vibeId),
      "https://pishadow-app.vercel.app"
    ).toString();

    return res.status(200).json({
      success: true,
      shareUrl: videoUrl,
      message: "Share link created"
    });
  } catch (error) {
    console.error("Share API error:", error);
    return res.status(500).json({
      error: "Server error"
    });
  }
}
