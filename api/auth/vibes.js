
const ALLOWED_ANIMATIONS = [
  "none",
  "pop",
  "fade",
  "slide",
  "zoom",
  "bounce",
  "typewriter",
  "neon",
  "glow",
  "rainbow",
  "3d"
];

const ALLOWED_ALIGNMENTS = [
  "left",
  "center",
  "right"
];

function validOwnedPath(path, uid) {
  return (
    typeof path === "string" &&
    path.startsWith(`${uid}/`) &&
    !path.includes("..") &&
    path.length <= 500
  );
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({
      error: "Method not allowed"
    });
  }

  const {
    accessToken,
    action,
    id,
    videoPath,
    caption,
    visibility,
    textSettings
  } = req.body || {};

  if (!accessToken || typeof accessToken !== "string") {
    return res.status(401).json({
      error: "Pi access token required"
    });
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SECRET_KEY;

  if (!supabaseUrl || !supabaseKey) {
    return res.status(500).json({
      error: "Server configuration missing"
    });
  }

  try {
    // 1. Verify Pi account
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
        error: "Pi verification failed"
      });
    }

    const piUser = await piResponse.json();
    const uid = piUser.uid;

    if (!uid) {
      return res.status(401).json({
        error: "Invalid Pi account"
      });
    }

    const tableUrl = `${supabaseUrl}/rest/v1/reels`;

    const headers = {
      apikey: supabaseKey,
      Authorization: `Bearer ${supabaseKey}`,
      "Content-Type": "application/json",
      Prefer: "return=representation"
    };

    // 2. Create Vibe
    if (action === "create") {
      if (!validOwnedPath(videoPath, uid)) {
        return res.status(400).json({
          error: "Invalid video path"
        });
      }

      const safeCaption =
        typeof caption === "string"
          ? caption.trim()
          : "";

      if (safeCaption.length > 2000) {
        return res.status(400).json({
          error: "Caption too long"
        });
      }

      const safeVisibility =
        visibility === "private"
          ? "private"
          : "public";

      const safeTextSettings = {
        font: "default",
        fontSize: 28,
        color: "#ffffff",
        animation: "none",
        alignment: "center",
        position: "bottom"
      };

      if (textSettings && typeof textSettings === "object") {
        if (
          textSettings.animation &&
          ALLOWED_ANIMATIONS.includes(textSettings.animation)
        ) {
          safeTextSettings.animation = textSettings.animation;
        }

        if (
          textSettings.alignment &&
          ALLOWED_ALIGNMENTS.includes(textSettings.alignment)
        ) {
          safeTextSettings.alignment = textSettings.alignment;
        }

        if (
          typeof textSettings.font === "string" &&
          textSettings.font.length <= 50
        ) {
          safeTextSettings.font = textSettings.font;
        }

        if (
          typeof textSettings.color === "string" &&
          /^#[0-9a-fA-F]{6}$/.test(textSettings.color)
        ) {
          safeTextSettings.color = textSettings.color;
        }

        if (
          Number.isInteger(textSettings.fontSize) &&
          textSettings.fontSize >= 10 &&
          textSettings.fontSize <= 100
        ) {
          safeTextSettings.fontSize = textSettings.fontSize;
        }
      }

      const response = await fetch(tableUrl, {
        method: "POST",
        headers,
        body: JSON.stringify({
          user_id: uid,
          video_path: videoPath,
          caption: safeCaption,
          visibility: safeVisibility,
          text_settings: safeTextSettings
        })
      });

      const result = await response.json();

      if (!response.ok) {
        console.error("Create Vibe error:", result);

        return res.status(400).json({
          error: "Could not create Vibe"
        });
      }

      return res.status(201).json({
        success: true,
        message: "P!Vibe created successfully 💜",
        vibe: result[0]
      });
    }

    // 3. List own Vibes
    if (action === "list") {
      const query = new URLSearchParams({
        select: "id,user_id,video_path,caption,visibility,text_settings,created_at",
        user_id: `eq.${uid}`,
        order: "created_at.desc",
        limit: "50"
      });

      const response = await fetch(
        `${tableUrl}?${query}`,
        { headers }
      );

      const result = await response.json();

      if (!response.ok) {
        return res.status(400).json({
          error: "Could not load Vibes"
        });
      }

      return res.status(200).json({
        success: true,
        vibes: result
      });
    }

    // 4. Delete own Vibe
    if (action === "delete") {
      if (!Number.isSafeInteger(Number(id)) || Number(id) <= 0) {
        return res.status(400).json({
          error: "Invalid Vibe ID"
        });
      }

      const query = new URLSearchParams({
        id: `eq.${Number(id)}`,
        user_id: `eq.${uid}`
      });

      const response = await fetch(
        `${tableUrl}?${query}`,
        {
          method: "DELETE",
          headers
        }
      );

      if (!response.ok) {
        return res.status(400).json({
          error: "Could not delete Vibe"
        });
      }

      return res.status(200).json({
        success: true,
        message: "Vibe deleted successfully 💜"
      });
    }

    return res.status(400).json({
      error: "Invalid action"
    });

  } catch (error) {
    console.error("P!Vibes API error:", error);

    return res.status(500).json({
      error: "Server error"
    });
  }
}
