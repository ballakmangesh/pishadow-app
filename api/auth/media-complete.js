
export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { accessToken, path } = req.body || {};

    if (!accessToken || !path) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    // Verify Pi user
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

    // Allow only this user's generated media file path
    const match = path.match(
      /^([^/]+)\/([0-9a-f-]{36})\.(jpg|png|webp|gif|heic|heif|avif|mp4|webm|mov|3gp|mp3|m4a|wav|ogg)$/i
    );

    if (!match || match[1] !== piUser.uid) {
      return res.status(403).json({ error: "Invalid media path" });
    }

    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SECRET_KEY;

    if (!supabaseUrl || !supabaseKey) {
      return res.status(500).json({ error: "Storage configuration missing" });
    }

    const fileName = match[2] + "." + match[3];
    const bucket = "pishadow-media";

    // Check whether the uploaded file exists
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
          limit: 100,
          offset: 0
        })
      }
    );

    if (!listResponse.ok) {
      console.error("Storage list failed:", await listResponse.text());
      return res.status(500).json({ error: "Could not verify uploaded file" });
    }

    const files = await listResponse.json();

    const uploadedFile = Array.isArray(files)
      ? files.find(file => file.name === fileName)
      : null;

    if (!uploadedFile) {
      return res.status(404).json({ error: "Uploaded file not found" });
    }

    return res.status(200).json({
      success: true,
      message: "Media upload verified",
      path,
      bucket
    });

  } catch (error) {
    console.error("Media completion error:", error);
    return res.status(500).json({ error: "Media verification failed" });
  }
}
