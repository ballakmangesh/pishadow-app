
import { randomUUID } from "node:crypto";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { accessToken, fileName, mimeType, fileSize } = req.body || {};

    if (!accessToken || !fileName || !mimeType || !fileSize) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    const maxSize = 50 * 1024 * 1024;

    if (!Number.isFinite(fileSize) || fileSize <= 0 || fileSize > maxSize) {
      return res.status(400).json({ error: "File must be under 50 MB" });
    }

    const allowedTypes = [
      "image/jpeg",
      "image/png",
      "image/webp",
      "image/gif",
      "image/heic",
      "image/heif",
      "image/avif",
      "video/mp4",
      "video/webm",
      "video/quicktime",
      "video/3gpp",
      "audio/mpeg",
      "audio/mp4",
      "audio/wav",
      "audio/ogg"
    ];

    if (!allowedTypes.includes(mimeType)) {
      return res.status(400).json({ error: "File type not allowed" });
    }

    // Verify Pi access token
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
      return res.status(500).json({ error: "Server storage configuration missing" });
    }

    const extensionByType = {
      "image/jpeg": "jpg",
      "image/png": "png",
      "image/webp": "webp",
      "image/gif": "gif",
      "image/heic": "heic",
      "image/heif": "heif",
      "image/avif": "avif",
      "video/mp4": "mp4",
      "video/webm": "webm",
      "video/quicktime": "mov",
      "video/3gpp": "3gp",
      "audio/mpeg": "mp3",
      "audio/mp4": "m4a",
      "audio/wav": "wav",
      "audio/ogg": "ogg"
    };

    const filePath = `${piUser.uid}/${randomUUID()}.${extensionByType[mimeType]}`;
    const bucket = "pishadow-media";

    const signResponse = await fetch(
      `${supabaseUrl}/storage/v1/object/upload/sign/${bucket}/${filePath}`,
      {
        method: "POST",
        headers: {
          apikey: supabaseKey,
          Authorization: `Bearer ${supabaseKey}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({})
      }
    );

    const signData = await signResponse.json();

    if (!signResponse.ok || !signData.url) {
      console.error("Supabase signing error:", signData);
      return res.status(500).json({ error: "Could not create upload URL" });
    }

    const signedUrl = new URL(signData.url, supabaseUrl).toString();

    return res.status(200).json({
      success: true,
      path: filePath,
      bucket,
      signedUrl,
      mimeType
    });

  } catch (error) {
    console.error("Media signing error:", error);
    return res.status(500).json({ error: "Media upload preparation failed" });
  }
}
