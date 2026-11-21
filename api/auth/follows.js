
export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { accessToken, action, followingId } = req.body || {};

    if (!accessToken) {
      return res.status(401).json({ error: "Please login with Pi" });
    }

    const piResponse = await fetch("https://api.minepi.com/v2/me", {
      headers: {
        Authorization: `Bearer ${accessToken}`
      }
    });

    if (!piResponse.ok) {
      return res.status(401).json({ error: "Pi login verification failed" });
    }

    const piData = await piResponse.json();
    const piUser = piData.user || piData;
    const followerId = piUser.uid;

    if (!followerId) {
      return res.status(401).json({ error: "Pi UID not found" });
    }

    const supabaseUrl = process.env.SUPABASE_URL;
    const secretKey = process.env.SUPABASE_SECRET_KEY;

    if (!supabaseUrl || !secretKey) {
      return res.status(500).json({ error: "Server configuration missing" });
    }

    const headers = {
      apikey: secretKey,
      "Content-Type": "application/json"
    };

    if (action === "follow") {
      if (!followingId || followingId === followerId) {
        return res.status(400).json({ error: "Invalid profile to follow" });
      }

      const response = await fetch(`${supabaseUrl}/rest/v1/follows`, {
        method: "POST",
        headers: {
          ...headers,
          Prefer: "resolution=ignore-duplicates,return=minimal"
        },
        body: JSON.stringify({
          follower_id: followerId,
          following_id: followingId
        })
      });

      if (!response.ok) {
        return res.status(500).json({ error: "Could not save follow" });
      }
    } else if (action === "unfollow") {
      if (!followingId || followingId === followerId) {
        return res.status(400).json({ error: "Invalid profile" });
      }

      const query = new URLSearchParams({
        follower_id: `eq.${followerId}`,
        following_id: `eq.${followingId}`
      });

      const response = await fetch(
        `${supabaseUrl}/rest/v1/follows?${query}`,
        {
          method: "DELETE",
          headers
        }
      );

      if (!response.ok) {
        return res.status(500).json({ error: "Could not remove follow" });
      }
    } else if (action !== "stats") {
      return res.status(400).json({ error: "Invalid action" });
    }

    const countQuery = async (column, uid) => {
      const query = new URLSearchParams({
        select: "id",
        [column]: `eq.${uid}`
      });

      const response = await fetch(
        `${supabaseUrl}/rest/v1/follows?${query}`,
        {
          headers: {
            ...headers,
            Prefer: "count=exact",
            Range: "0-0"
          }
        }
      );

      if (!response.ok) {
        throw new Error("Could not load follow counts");
      }

      const range = response.headers.get("content-range");
      return Number(range?.split("/")[1] || 0);
    };

    const followingCount = await countQuery("follower_id", followerId);
    const followersCount = followingId
      ? await countQuery("following_id", followingId)
      : 0;

    return res.status(200).json({
      success: true,
      followingCount,
      followersCount
    });

  } catch (error) {
    return res.status(500).json({ error: "Server error" });
  }
}
