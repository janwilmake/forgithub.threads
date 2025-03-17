/**
 * X.com Repository Tweets API
 *
 * This Cloudflare Worker searches for tweets mentioning GitHub repositories
 * using the Serper.dev Google SERP API and returns formatted results.
 */

// Define API key environment variable
interface Env {
  SERPER_API_KEY: string;
}

// Search result interface from Serper API
interface SerperResponse {
  organic: {
    title: string;
    link: string;
    snippet: string;
    position: number;
  }[];
}

// Our formatted tweet result
interface TweetResult {
  id: string;
  login: string;
  url: string;
  text: string;
  source: string;
}

// Extract tweet ID and username from X.com URL
function extractTweetInfo(url: string): { id: string; login: string } | null {
  const regex = /x\.com\/([^\/]+)\/status\/(\d+)/;
  const match = url.match(regex);

  if (!match) return null;

  return {
    login: match[1],
    id: match[2],
  };
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    // Parse the URL
    const url = new URL(request.url);
    const pathParts = url.pathname.split("/").filter(Boolean);

    // Check if we have at least owner and repo
    if (pathParts.length < 2) {
      return new Response(
        JSON.stringify({
          error: "Missing owner and repo parameters. Use /owner/repo format.",
        }),
        {
          status: 400,
          headers: {
            "Content-Type": "application/json",
          },
        },
      );
    }

    const owner = pathParts[0];
    const repo = pathParts[1];

    try {
      // Construct the query for Serper API
      const query = `site:x.com ${owner}/${repo}`;

      // Call Serper API
      const serperResponse = await fetch("https://google.serper.dev/search", {
        method: "POST",
        headers: {
          "X-API-KEY": env.SERPER_API_KEY,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          q: query,
          autocorrect: false,
          num: 50,
        }),
      });

      if (!serperResponse.ok) {
        const errorText = await serperResponse.text();
        throw new Error(
          `Serper API error: ${serperResponse.status} ${errorText}`,
        );
      }

      const data = (await serperResponse.json()) as SerperResponse;

      // Filter and format results
      const tweets: TweetResult[] = [];

      for (const result of data.organic) {
        const tweetInfo = extractTweetInfo(result.link);

        if (tweetInfo) {
          tweets.push({
            id: tweetInfo.id,
            login: tweetInfo.login,
            url: result.link,
            text: `${result.title} ${result.snippet}`,
            source: "google",
          });
        }
      }

      // Return the formatted results
      return new Response(JSON.stringify(tweets, undefined, 2), {
        headers: {
          "Content-Type": "application/json;charset=utf8",
          "Access-Control-Allow-Origin": "*",
        },
      });
    } catch (error) {
      // Handle errors
      console.error("Error:", error);

      return new Response(
        JSON.stringify({
          error:
            error instanceof Error ? error.message : "Unknown error occurred",
        }),
        {
          status: 500,
          headers: {
            "Content-Type": "application/json",
          },
        },
      );
    }
  },
};
