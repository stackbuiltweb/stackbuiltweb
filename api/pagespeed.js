// Server-side proxy for Google PageSpeed Insights API v5.
// Keeps the API key out of client source. Reads PAGESPEED_API_KEY from env.
//
// Usage from the browser:
//   GET /api/pagespeed?url=https://example.com&strategy=mobile
//
// Env var required in Vercel project settings:
//   PAGESPEED_API_KEY  (restrict this key to PageSpeed Insights API only)

export default async function handler(req, res) {
  // Only allow requests from stackbuiltweb.com (referer-based soft check).
  // Server-side fetches from other origins are blocked.
  const referer = req.headers.referer || req.headers.referrer || "";
  const allowedHosts = [
    "stackbuiltweb.com",
    "www.stackbuiltweb.com",
    "localhost",
  ];
  if (referer) {
    try {
      const refHost = new URL(referer).hostname;
      const isAllowed =
        allowedHosts.includes(refHost) || refHost.endsWith(".vercel.app");
      if (!isAllowed) {
        return res.status(403).json({ error: "forbidden referer" });
      }
    } catch (_) {
      // malformed referer — let it through rather than hard-block
    }
  }

  const targetUrl = req.query?.url || "";
  const strategy = req.query?.strategy || "mobile";

  if (!targetUrl) {
    return res.status(400).json({ error: "url query param required" });
  }
  try {
    const parsed = new URL(targetUrl);
    if (!["http:", "https:"].includes(parsed.protocol)) {
      throw new Error("bad protocol");
    }
  } catch (_) {
    return res.status(400).json({ error: "invalid url" });
  }

  const apiKey = process.env.PAGESPEED_API_KEY;
  if (!apiKey) {
    return res
      .status(500)
      .json({ error: "PAGESPEED_API_KEY env var not configured on server" });
  }

  const psiUrl =
    "https://www.googleapis.com/pagespeedonline/v5/runPagespeed?" +
    "url=" +
    encodeURIComponent(targetUrl) +
    "&strategy=" +
    encodeURIComponent(strategy) +
    "&category=performance&category=accessibility&category=seo&category=best-practices" +
    "&key=" +
    encodeURIComponent(apiKey);

  try {
    const upstream = await fetch(psiUrl);
    const body = await upstream.text();

    // Cache successful responses at the edge for 1 hour.
    if (upstream.ok) {
      res.setHeader(
        "Cache-Control",
        "public, s-maxage=3600, stale-while-revalidate=600"
      );
    }
    res.setHeader("Content-Type", "application/json");
    return res.status(upstream.status).send(body);
  } catch (err) {
    return res
      .status(502)
      .json({ error: "upstream fetch failed", detail: String(err) });
  }
}
