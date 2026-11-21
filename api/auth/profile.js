
export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { accessToken, action, displayName, bio } = req.body || {};

    if (!accessToken || !["get", "update"].includes(action)) {
      return res.status(400).json({ error: "Invalid request" });
    }

    const piResponse = await fetch("https://api.minepi.com/v2/me", {
      headers: { Authorization: `Bearer ${accessToken}` }
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

    const url = new URL(`${supabaseUrl}/rest/v1/profiles`);
    url.searchParams.set("user_id", `eq.${piUser.uid}`);
    url.searchParams.set("select", "user_id,display_name,bio");

    const headers = {
      apikey: supabaseKey,
      Authorization: `Bearer ${supabaseKey}`,
      "Content-Type": "application/json"
    };

    if (action === "get") {
      const response = await fetch(url, { headers });
      const data = await response.json();

      if (!response.ok) {
        return res.status(500).json({ error: "Could not load profile" });
      }

      return res.status(200).json({
        success: true,
        profile: data[0] || {
          user_id: piUser.uid,
          display_name: piUser.username || "",
          bio: ""
        }
      });
    }

    if (typeof displayName !== "string" || typeof bio !== "string") {
      return res.status(400).json({ error: "Invalid profile details" });
    }

    if (displayName.length > 40 || bio.length > 300) {
      return res.status(400).json({ error: "Profile text is too long" });
    }

    const response = await fetch(
      `${supabaseUrl}/rest/v1/profiles?on_conflict=user_id`,
      {
        method: "POST",
        headers: {
          ...headers,
          Prefer: "resolution=merge-duplicates,return=representation"
        },
        body: JSON.stringify({
          user_id: piUser.uid,
          display_name: displayName.trim(),
          bio: bio.trim()
        })
      }
    );

    const data = await response.json();

    if (!response.ok) {
      console.error("Profile save error:", data);
      return res.status(500).json({ error: "Could not save profile" });
    }

    return res.status(200).json({
      success: true,
      profile: data[0]
    });

  } catch (error) {
    console.error("Profile API error:", error);
    return res.status(500).json({ error: "Server error" });
  }
}
