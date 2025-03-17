/**
 * Threads for GitHub
 *
 * A Cloudflare Worker that links GitHub repositories with related X (Twitter) threads
 * by searching repository content for X/Twitter links using ZIPObject API.
 */

// Define types for environment variables
interface Env {
  ADMIN_SECRET: string;
}

// Define types for the API response
interface ZipObjectFile {
  matches: string[][];
}

interface ZipObjectResponse {
  files?: Record<string, ZipObjectFile>;
}

// Define type for a Twitter link
interface TwitterLink {
  id: number;
  login: string;
  url: string;
  text?: string;
  source: string;
}

// The URL pattern for the API: /[owner]/[repo][/tree/[branch]/[...path]]
const API_URL_PATTERN =
  /^\/([^\/]+)\/([^\/]+)(?:\/tree\/([^\/]+)(?:\/(.+))?)?$/;

// Regular expression to match X/Twitter links
// Will be used as a base64 encoded string for ZIPObject API
const TWITTER_LINK_REGEX =
  "https:\\/\\/(x|twitter)\\.com\\/(.+)\\/status\\/(\\d+)";

/**
 * Handle incoming requests to the Threads for GitHub API
 */
export default {
  fetch: async (request: Request, env: Env): Promise<Response> => {
    const url = new URL(request.url);
    const path = url.pathname;

    // Check if the path matches our API pattern
    const match = path.match(API_URL_PATTERN);
    if (!match) {
      return new Response(JSON.stringify({ error: "Invalid URL format" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Extract repository information from the path
    const [, owner, repo, branch = "main", subPath = ""] = match;

    try {
      // Fetch X/Twitter links from the GitHub repository
      const links = await fetchTwitterLinksFromRepo(
        env,
        owner,
        repo,
        branch,
        subPath,
      );

      return new Response(JSON.stringify(links, undefined, 2), {
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
      });
    } catch (error) {
      console.error("Error fetching links:", error);

      return new Response(
        JSON.stringify({
          error: error instanceof Error ? error.message : "An error occurred",
        }),
        {
          status: (error as { status?: number }).status || 500,
          headers: { "Content-Type": "application/json" },
        },
      );
    }
  },
};

/**
 * Fetch X/Twitter links from a GitHub repository using ZIPObject API
 */
async function fetchTwitterLinksFromRepo(
  env: Env,
  owner: string,
  repo: string,
  branch: string,
  subPath: string,
): Promise<TwitterLink[]> {
  // Base URL for GitHub repository
  const githubRepoUrl = `https://github.com/${owner}/${repo}`;

  // Construct path for subpath if provided
  const pathSuffix = subPath ? `/tree/${branch}/${subPath}` : "";

  // Encode the Twitter link regex for the ZIPObject API (btoa only, searchParams.append handles the URI encoding)
  const encodedRegex = btoa(TWITTER_LINK_REGEX);

  // Construct the ZIPObject API URL
  const zipObjectUrl = new URL(
    `https://zipobject.vercel.app/${githubRepoUrl}${pathSuffix}`,
  );

  // Add query parameters for the ZIPObject API
  zipObjectUrl.searchParams.append("regex", encodedRegex);
  zipObjectUrl.searchParams.append("omitTree", "true");
  zipObjectUrl.searchParams.append("searchCaseSensitive", "false");

  console.log(`Fetching from ZIPObject API: ${zipObjectUrl.toString()}`);

  // Fetch data from ZIPObject API
  const response = await fetch(zipObjectUrl.toString(), {
    headers: {
      Authorization: `Bearer ${env.ADMIN_SECRET}`,
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    const error = new Error(
      `ZIPObject API error (${response.status}): ${errorText}`,
    );
    (error as any).status = response.status;
    throw error;
  }

  const data: ZipObjectResponse = await response.json();

  // Process the response to extract matches
  const links = extractTwitterLinksFromResponse(data);

  return links;
}

/**
 * Extract X/Twitter links from the ZIPObject API response
 */
function extractTwitterLinksFromResponse(
  data: ZipObjectResponse,
): TwitterLink[] {
  const links: TwitterLink[] = [];
  const uniqueLinks = new Set<string>();

  // Go through each file that has matches
  if (data.files) {
    Object.entries(data.files).forEach(([filePath, fileData]) => {
      if (fileData.matches && fileData.matches.length > 0) {
        // Process each match in the file
        fileData.matches.forEach((match) => {
          // Based on the corrected format:
          // [fullUrl, platform, username, statusId]
          if (match.length >= 4) {
            const platform = match[1]; // 'x' or 'twitter'
            const username = match[2];
            const statusId = match[3];

            // Create a unique key for this link
            const linkKey = `${username}/${statusId}`;

            // Only add unique links
            if (!uniqueLinks.has(linkKey)) {
              uniqueLinks.add(linkKey);

              links.push({
                id: Number(statusId),
                login: username,
                url: match[0], // Use the already captured full URL
                source: "github",
              });
            }
          }
        });
      }
    });
  }

  return links;
}
