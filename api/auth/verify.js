
export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { accessToken } = req.body || {};

  if (!accessToken) {
    return res.status(400).json({ error: "Missing access token" });
  }

  try {
    const response = await fetch(
      "https://api.minepi.com/v2/me",
      {
        headers: {
          Authorization: `Bearer ${accessToken}`
        }
      }
    );

    const user = await response.json();

    if (!response.ok) {
      return res.status(401).json({ error: "Pi verification failed" });
    }

    return res.status(200).json({
      uid: user.uid,
      username: user.username
    });
  } catch (error) {
    return res.status(500).json({ error: "Server error" });
  }
}
