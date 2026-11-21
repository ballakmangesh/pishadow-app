
export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { accessToken, limit = 50, offset = 0 } = req.body || {};

    if (!accessToken) {
      return res.status(400).json({ error: "Missing access token" });
    }

    const safeLimit = Math.min(Math.max(Number(limit) || 50, 1), 100);
    const safeOffset = Math.max(Number(offset) || 0, 0);

    // Verify Pi login
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
      return res.status(500).json({ error: "Storage configuration missing" });
    }

    const bucket = "pishadow-media";

    // List only this user's files
    const listResponse = await fetch(
      `${supabaseUrl}/storage/v1/object/list/${bucket}`,
      {
        method: "POST",
        headers: {
          apikey: supabaseKey,
          Authorization: `Bearer ${supabaseKey}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          prefix: piUser.uid,
          limit: safeLimit,
          offset: safeOffset,
          sortBy: {
            column: "created_at",
            order: "desc"
          }
        })
      }
    );

    if (!listResponse.ok) {
      console.error("Media list error:", await listResponse.text());
      return res.status(500).json({ error: "Could not load media files" });
    }

    const files = await listResponse.json();

    const media = Array.isArray(files)
      ? files
          .filter(file => file.name && file.id)
          .map(file => ({
            name: file.name,
            path: `${piUser.uid}/${file.name}`,
            size: file.metadata?.size ?? null,
            mimeType: file.metadata?.mimetype ?? null,
            createdAt: file.created_at ?? null
          }))
      : [];

    return res.status(200).json({
      success: true,
      media,
      count: media.length,
      limit: safeLimit,
      offset: safeOffset
    });

  } catch (error) {
    console.error("Media list error:", error);
    return res.status(500).json({ error: "Could not load media" });
  }
}
