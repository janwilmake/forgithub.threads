/**
 * Threads for GitHub
 *
 * Main entry point that combines GitHub repository searches and Google search results
 * for X/Twitter threads related to GitHub repositories.
 */

import githubHandler from "./github";
import googleHandler from "./google";

// Define environment variables interface
interface Env {
  ADMIN_SECRET: string;
  SERPER_API_KEY: string;
}

// Common thread interface
interface Thread {
  id: number | string;
  login: string;
  url: string;
  text?: string;
}

export default {
  fetch: async (request: Request, env: Env): Promise<Response> => {
    const url = new URL(request.url);
    const path = url.pathname;

    // Parse path segments: /owner/repo/page/branch/path
    const segments = path.split("/").filter(Boolean);
    if (segments.length < 2) {
      return new Response(JSON.stringify({ error: "Invalid URL format" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const [owner, repo, page = "", branch = "main", ...pathParts] = segments;
    const subPath = pathParts.join("/");

    try {
      // Determine which searches to run
      const promises: Promise<any>[] = [];

      // Skip GitHub search if page is explicitly "google"
      if (page !== "google") {
        const githubUrl = new URL(
          `/${owner}/${repo}${subPath ? `/tree/${branch}/${subPath}` : ""}`,
          request.url,
        );
        promises.push(
          githubHandler
            .fetch(new Request(githubUrl), env)
            .then((r) => (r.ok ? r.json() : []))
            .catch(() => []),
        );
      } else {
        promises.push(Promise.resolve([]));
      }

      // Skip Google search if page is explicitly "github"
      if (page !== "github") {
        const googleUrl = new URL(`/${owner}/${repo}`, request.url);
        promises.push(
          googleHandler
            .fetch(new Request(googleUrl), env)
            .then((r) => (r.ok ? r.json() : []))
            .catch(() => []),
        );
      } else {
        promises.push(Promise.resolve([]));
      }

      // Wait for both searches to complete
      const [githubResults, googleResults] = await Promise.all(promises);

      // Merge and deduplicate results
      const merged = mergeResults(githubResults, googleResults);

      return new Response(JSON.stringify(merged, null, 2), {
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
      });
    } catch (error) {
      return new Response(
        JSON.stringify({
          error: error instanceof Error ? error.message : "An error occurred",
        }),
        {
          status: 500,
          headers: { "Content-Type": "application/json" },
        },
      );
    }
  },
};

/**
 * Merge and deduplicate results from GitHub and Google searches
 */
function mergeResults(
  githubResults: Thread[],
  googleResults: Thread[],
): Thread[] {
  const uniqueMap = new Map();

  // Process GitHub results
  githubResults.forEach((thread) => {
    uniqueMap.set(`${thread.login}_${thread.id}`, thread);
  });

  // Add or enhance with Google results
  googleResults.forEach((thread) => {
    const key = `${thread.login}_${thread.id}`;
    if (uniqueMap.has(key)) {
      // If already exists, add text from Google result
      const existing = uniqueMap.get(key);
      if (thread.text) existing.text = thread.text;
    } else {
      uniqueMap.set(key, thread);
    }
  });

  return Array.from(uniqueMap.values());
}
