
import { randomUUID } from "node:crypto";

const MAX_SIZE = 50 * 1024 * 1024;

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

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({
      error: "Method not allowed"
    });
  }

  try {
    const {
      accessToken,
      fileName,
      mimeType,
      fileSize
    } = req.body || {};

    if (
      typeof accessToken !== "string" ||
      !accessToken ||
      typeof fileName !== "string" ||
      !fileName.trim() ||
      typeof mimeType !== "string" ||
      typeof fileSize !== "number"
    ) {
      return res.status(400).json({
        error: "Missing or invalid file details"
      });
    }

    if (
      !Number.isFinite(fileSize) ||
      fileSize <= 0 ||
      fileSize > MAX_SIZE
    ) {
      return res.status(400).json({
        error: "Maximum file size is 50 MB"
      });
    }

    if (!Object.hasOwn(extensionByType, mimeType)) {
      return res.status(400).json({
        error: "File type not allowed"
      });
    }

    // Verify Pi account
    const piResponse = await fetch(
      "https://api.minepi.com/v2/me",
      {
        headers: {
          Authorization: `Bearer ${accessToken}`
        }
      }
    );

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
        error: "Storage configuration missing"
      });
    }

    const bucket = "pishadow-media";
    const filePath =
      `${piUser.uid}/${randomUUID()}.${extensionByType[mimeType]}`;

    const encodedPath = filePath
      .split("/")
      .map(encodeURIComponent)
      .join("/");

    // Create signed upload token
    const signResponse = await fetch(
      `${supabaseUrl}/storage/v1/object/upload/sign/${bucket}/${encodedPath}`,
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

      return res.status(500).json({
        error: "Could not create upload permission"
      });
    }

    const signedUrl = new URL(
      signData.url,
      supabaseUrl
    );

    const uploadToken = signedUrl.searchParams.get("token");

    if (!uploadToken) {
      return res.status(500).json({
        error: "Upload token missing"
      });
    }

    // Direct Storage hostname for TUS
    const projectRef = new URL(supabaseUrl).hostname.split(".")[0];

    const uploadEndpoint =
      `https://${projectRef}.storage.supabase.co/storage/v1/upload/resumable`;

    return res.status(200).json({
      success: true,
      message: "Upload permission created 💜",
      bucket,
      path: filePath,
      mimeType,
      maxSize: MAX_SIZE,
      uploadMethod: "TUS",
      uploadEndpoint,
      uploadToken,
      signedUrl: signedUrl.toString()
    });

  } catch (error) {
    console.error("P!Vibes media error:", error);

    return res.status(500).json({
      error: "Media upload preparation failed"
    });
  }
}
