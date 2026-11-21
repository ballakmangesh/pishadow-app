
const ANIMATIONS = [
  "none",
  "flying-kiss",
  "floating-hearts",
  "laugh-burst",
  "fire",
  "sparkles",
  "celebration"
];

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const {
      accessToken,
      action,
      postId,
      commentId,
      parentId = null,
      content,
      animation = "none"
    } = req.body || {};

    if (!accessToken || !action || !postId) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    if (!/^[1-9]\d*$/.test(String(postId))) {
      return res.status(400).json({ error: "Invalid post ID" });
    }

    // Verify Pi account
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
      return res.status(500).json({ error: "Database configuration missing" });
    }

    const headers = {
      apikey: supabaseKey,
      Authorization: `Bearer ${supabaseKey}`,
      "Content-Type": "application/json"
    };

    const postsUrl = `${supabaseUrl}/rest/v1/posts`;
    const commentsUrl = `${supabaseUrl}/rest/v1/comments`;

    // Check post and its visibility
    const postQuery = new URL(postsUrl);
    postQuery.searchParams.set("select", "id,user_id,visibility");
    postQuery.searchParams.set("id", `eq.${postId}`);
    postQuery.searchParams.set("limit", "1");

    const postResponse = await fetch(postQuery.toString(), { headers });
    const posts = await postResponse.json();

    if (!postResponse.ok) {
      return res.status(500).json({ error: "Could not verify post" });
    }

    const post = posts[0];

    if (!post) {
      return res.status(404).json({ error: "Post not found" });
    }

    if (post.visibility !== "public" && post.user_id !== piUser.uid) {
      return res.status(403).json({ error: "You cannot access this post" });
    }

    // Create a comment or reply
    if (action === "create") {
      if (typeof content !== "string" || !content.trim() || content.length > 2000) {
        return res.status(400).json({ error: "Comment must be 1-2000 characters" });
      }

      if (!ANIMATIONS.includes(animation)) {
        return res.status(400).json({ error: "Invalid animation" });
      }

      if (parentId !== null && !/^[1-9]\d*$/.test(String(parentId))) {
        return res.status(400).json({ error: "Invalid reply ID" });
      }

      if (parentId !== null) {
        const parentQuery = new URL(commentsUrl);
        parentQuery.searchParams.set("select", "id,post_id");
        parentQuery.searchParams.set("id", `eq.${parentId}`);
        parentQuery.searchParams.set("post_id", `eq.${postId}`);
        parentQuery.searchParams.set("limit", "1");

        const parentResponse = await fetch(parentQuery.toString(), { headers });
        const parents = await parentResponse.json();

        if (!parentResponse.ok || !parents.length) {
          return res.status(400).json({ error: "Reply target not found" });
        }
      }

      const response = await fetch(commentsUrl, {
        method: "POST",
        headers: {
          ...headers,
          Prefer: "return=representation"
        },
        body: JSON.stringify({
          post_id: Number(postId),
          user_id: piUser.uid,
          parent_id: parentId === null ? null : Number(parentId),
          content: content.trim(),
          animation
        })
      });

      const result = await response.json();

      if (!response.ok) {
        console.error("Comment create error:", result);
        return res.status(500).json({ error: "Could not create comment" });
      }

      return res.status(201).json({
        success: true,
        comment: result[0]
      });
    }

    // List comments for a post
    if (action === "list") {
      const query = new URL(commentsUrl);
      query.searchParams.set("select", "*");
      query.searchParams.set("post_id", `eq.${postId}`);
      query.searchParams.set("order", "created_at.asc");
      query.searchParams.set("limit", "200");

      const response = await fetch(query.toString(), { headers });
      const comments = await response.json();

      if (!response.ok) {
        return res.status(500).json({ error: "Could not load comments" });
      }

      return res.status(200).json({
        success: true,
        comments
      });
    }

    // Edit your own comment
    if (action === "edit") {
      if (!commentId || !/^[1-9]\d*$/.test(String(commentId))) {
        return res.status(400).json({ error: "Invalid comment ID" });
      }

      if (typeof content !== "string" || !content.trim() || content.length > 2000) {
        return res.status(400).json({ error: "Comment must be 1-2000 characters" });
      }

      const query = new URL(commentsUrl);
      query.searchParams.set("id", `eq.${commentId}`);
      query.searchParams.set("post_id", `eq.${postId}`);
      query.searchParams.set("user_id", `eq.${piUser.uid}`);

      const response = await fetch(query.toString(), {
        method: "PATCH",
        headers: {
          ...headers,
          Prefer: "return=representation"
        },
        body: JSON.stringify({
          content: content.trim(),
          animation
        })
      });

      const result = await response.json();

      if (!response.ok) {
        return res.status(500).json({ error: "Could not edit comment" });
      }

      if (!result.length) {
        return res.status(404).json({ error: "Your comment was not found" });
      }

      return res.status(200).json({
        success: true,
        comment: result[0]
      });
    }

    // Delete your own comment
    if (action === "delete") {
      if (!commentId || !/^[1-9]\d*$/.test(String(commentId))) {
        return res.status(400).json({ error: "Invalid comment ID" });
      }

      const query = new URL(commentsUrl);
      query.searchParams.set("id", `eq.${commentId}`);
      query.searchParams.set("post_id", `eq.${postId}`);
      query.searchParams.set("user_id", `eq.${piUser.uid}`);

      const response = await fetch(query.toString(), {
        method: "DELETE",
        headers: {
          ...headers,
          Prefer: "return=representation"
        }
      });

      if (!response.ok) {
        return res.status(500).json({ error: "Could not delete comment" });
      }

      return res.status(200).json({
        success: true,
        message: "Comment deleted"
      });
    }

    return res.status(400).json({ error: "Invalid action" });

  } catch (error) {
    console.error("Comments API error:", error);
    return res.status(500).json({ error: "Comments request failed" });
  }
}
