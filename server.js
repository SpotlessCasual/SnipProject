import { stat } from "node:fs/promises";
import { resolve, sep } from "node:path";

const port = Number(process.env.PORT ?? 3000);
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error("PORT must be an integer between 1 and 65535.");
}

const configuredBaseUrl =
  process.env.BASE_URL ??
  (process.env.RAILWAY_PUBLIC_DOMAIN
    ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}`
    : `http://localhost:${port}`);
const baseUrl = new URL(configuredBaseUrl).origin;
const publicDirectory = process.env.PUBLIC_DIR
  ? resolve(process.env.PUBLIC_DIR)
  : null;
const links = new Map();
const alphabet = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    },
  });
}

function generateCode() {
  let code = "";
  while (code.length < 6) {
    const bytes = crypto.getRandomValues(new Uint8Array(8));
    for (const byte of bytes) {
      if (byte < 248) code += alphabet[byte % alphabet.length];
      if (code.length === 6) break;
    }
  }
  return code;
}

function isValidHttpUrl(value) {
  if (typeof value !== "string") return false;
  try {
    const url = new URL(value);
    return (url.protocol === "http:" || url.protocol === "https:") && !!url.hostname;
  } catch {
    return false;
  }
}

async function findPublicFile(pathname) {
  if (!publicDirectory) return null;

  let decodedPath;
  try {
    decodedPath = decodeURIComponent(pathname);
  } catch {
    return null;
  }

  const relativePath = decodedPath === "/" ? "index.html" : decodedPath.slice(1);
  const candidate = resolve(publicDirectory, relativePath);
  if (candidate !== publicDirectory && !candidate.startsWith(`${publicDirectory}${sep}`)) {
    return null;
  }

  try {
    const info = await stat(candidate);
    return info.isFile() ? candidate : null;
  } catch (error) {
    if (error.code === "ENOENT" || error.code === "ENOTDIR") return null;
    throw error;
  }
}

function withCors(response) {
  const headers = new Headers(response.headers);
  headers.set("Access-Control-Allow-Origin", "*");
  headers.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  headers.set("Access-Control-Allow-Headers", "Content-Type");
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

Bun.serve({
  port,
  async fetch(request) {
    const { pathname } = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type",
        },
      });
    }

    if (pathname === "/api/links" && request.method === "POST") {
      let body;
      try {
        body = await request.json();
      } catch (error) {
        if (error instanceof SyntaxError) {
          return jsonResponse({ error: "Request body must be valid JSON." }, 400);
        }
        throw error;
      }

      if (!isValidHttpUrl(body?.url)) {
        return jsonResponse({ error: "url must be a valid HTTP or HTTPS URL." }, 400);
      }

      let code = generateCode();
      while (links.has(code)) code = generateCode();

      const link = {
        code,
        url: body.url,
        shortUrl: `${baseUrl}/${code}`,
        hits: 0,
        createdAt: new Date().toISOString(),
      };
      links.set(code, link);
      return jsonResponse(link, 201);
    }

    if (pathname === "/api/links" && request.method === "GET") {
      return jsonResponse(Array.from(links.values()));
    }

    if (
      publicDirectory &&
      (request.method === "GET" || request.method === "HEAD") &&
      !pathname.startsWith("/api/")
    ) {
      const filePath = await findPublicFile(pathname);
      if (filePath) {
        const file = Bun.file(filePath);
        const response = new Response(file, { headers: { "Content-Type": file.type } });
        return request.method === "HEAD"
          ? withCors(new Response(null, { status: response.status, headers: response.headers }))
          : withCors(response);
      }
    }

    if (request.method === "GET" && pathname.startsWith("/") && !pathname.slice(1).includes("/")) {
      const link = links.get(pathname.slice(1));
      if (link) {
        link.hits += 1;
        return new Response(null, {
          status: 302,
          headers: {
            Location: link.url,
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type",
          },
        });
      }
    }

    return jsonResponse({ error: "Not found." }, 404);
  },
});

console.log(`Snip backend listening on ${baseUrl}`);
