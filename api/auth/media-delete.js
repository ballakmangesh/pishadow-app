
export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { accessToken, path } = req.body || {};

    if (!accessToken || typeof path !== "string") {
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

    // Only allow a generated file inside this user's folder
    const filePattern =
      /^([^/]+)\/([0-9a-f-]{36})\.(jpg|png|webp|gif|heic|heif|avif|mp4|webm|mov|3gp|mp3|m4a|wav|ogg)$/i;

    const match = path.match(filePattern);

    if (!match || match[1] !== piUser.uid) {
      return res.status(403).json({ error: "You can only delete your own media" });
    }

    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SECRET_KEY;

    if (!supabaseUrl || !supabaseKey) {
      return res.status(500).json({ error: "Storage configuration missing" });
    }

    const bucket = "pishadow-media";

    // Delete through Supabase Storage API
    const deleteResponse = await fetch(
      `${supabaseUrl}/storage/v1/object/${bucket}`,
      {
        method: "DELETE",
        headers: {
          apikey: supabaseKey,
          Authorization: `Bearer ${supabaseKey}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          prefixes: [path]
        })
      }
    );

    if (!deleteResponse.ok) {
      console.error("Supabase delete error:", await deleteResponse.text());
      return res.status(500).json({ error: "Could not delete media file" });
    }

    return res.status(200).json({
      success: true,
      message: "Media deleted successfully",
      path
    });

  } catch (error) {
    console.error("Media delete error:", error);
    return res.status(500).json({ error: "Media deletion failed" });
  }
}
