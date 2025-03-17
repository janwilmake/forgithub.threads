//todo: improve using https://openapi.actionschema.com/serper.json

/**
 * Serper X Finder - A Cloudflare Worker that uses Serper.dev to find X posts
 * that mention a specific GitHub repository.
 *
 * This service creates the "X to GitHub" side of the bridge between social discussion
 * and code repositories.
 */

export interface Env {
  SERPER_SECRET: string;
}

interface SerperResponse {
  organic: {
    title: string;
    link: string;
    snippet: string;
    date?: string;
  }[];
  searchParameters: {
    q: string;
    gl: string;
    hl: string;
  };
}

interface XPost {
  title: string;
  url: string;
  snippet: string;
  date?: string;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    // Set up CORS to allow requests from any origin
    if (request.method === "OPTIONS") {
      return handleCORS();
    }

    try {
      const url = new URL(request.url);
      const repoUrl = url.searchParams.get("repo");

      if (!repoUrl) {
        return new Response(
          JSON.stringify({ error: "Missing 'repo' parameter" }),
          {
            status: 400,
            headers: getCORSHeaders(),
          },
        );
      }

      // Extract owner and repo name from GitHub URL
      const repoInfo = extractRepoInfo(repoUrl);

      if (!repoInfo) {
        return new Response(
          JSON.stringify({ error: "Invalid GitHub repository URL" }),
          {
            status: 400,
            headers: getCORSHeaders(),
          },
        );
      }

      const { owner, repo } = repoInfo;
      const results = await findXPostsForRepo(owner, repo, env.SERPER_SECRET);

      return new Response(JSON.stringify(results), {
        headers: getCORSHeaders(),
      });
    } catch (error) {
      return new Response(
        JSON.stringify({ error: error.message || "An error occurred" }),
        {
          status: 500,
          headers: getCORSHeaders(),
        },
      );
    }
  },
};

/**
 * Extracts owner and repository name from a GitHub URL
 */
function extractRepoInfo(url: string): { owner: string; repo: string } | null {
  // Handle different GitHub URL formats
  const patterns = [
    /github\.com\/([^\/]+)\/([^\/]+)/, // github.com/owner/repo
    /github\.com\/([^\/]+)\/([^\/]+)\.git/, // github.com/owner/repo.git
    /raw\.githubusercontent\.com\/([^\/]+)\/([^\/]+)/, // raw.githubusercontent.com/owner/repo
  ];

  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match && match[1] && match[2]) {
      return {
        owner: match[1],
        repo: match[2].replace(".git", ""),
      };
    }
  }

  return null;
}

/**
 * Uses Serper.dev to find X posts that mention a specific GitHub repository
 */
async function findXPostsForRepo(
  owner: string,
  repo: string,
  apiKey: string,
): Promise<{ posts: XPost[]; query: string }> {
  // Create search query for exact repository matches
  const query = `site:x.com "${owner}/${repo}"`;

  const response = await fetch("https://google.serper.dev/search", {
    method: "POST",
    headers: {
      "X-API-KEY": apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      q: query,
      gl: "us",
      hl: "en",
      num: 100, // Request maximum results
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Serper API error: ${response.status} - ${errorText}`);
  }

  const data = (await response.json()) as SerperResponse;

  // Transform the results to a cleaner format
  const posts: XPost[] = data.organic.map((result) => ({
    title: result.title,
    url: result.link,
    snippet: result.snippet,
    date: result.date,
  }));

  return {
    posts,
    query: data.searchParameters.q,
  };
}

/**
 * Returns CORS headers for cross-origin requests
 */
function getCORSHeaders(): HeadersInit {
  return {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
}

/**
 * Handles CORS preflight requests
 */
function handleCORS(): Response {
  return new Response(null, {
    status: 204,
    headers: getCORSHeaders(),
  });
}
