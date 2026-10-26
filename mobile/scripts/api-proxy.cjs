const http = require("node:http");
const paths = new Set([
  "/health",
  "/v1/routes/compare",
  "/v1/shadows",
  "/v1/buildings",
]);
module.exports = function apiProxy(
  next,
  port = Number(process.env.UMBRA_COMPUTE_PORT ?? 8000),
) {
  if (!Number.isInteger(port) || port < 1 || port > 65535)
    throw Error("Invalid compute port");
  return (req, res, after) => {
    const url = new URL(req.url, "http://localhost");
    if (!url.pathname.startsWith("/umbra-api/")) return next(req, res, after);
    const path = url.pathname.slice("/umbra-api".length);
    const fail = (status, message) => {
      if (res.headersSent || res.destroyed) return;
      res.writeHead(status, {
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
      });
      res.end(JSON.stringify({ detail: message, code: "unavailable" }));
    };
    if (!paths.has(path) || url.search) {
      fail(404, "Not found");
      return;
    }
    if (req.method !== (path === "/health" ? "GET" : "POST")) {
      fail(405, "Method not allowed");
      return;
    }
    const upstream = http.request(
      {
        hostname: "127.0.0.1",
        port,
        path,
        method: req.method,
        headers: {
          "content-type": req.headers["content-type"] ?? "application/json",
          "accept-encoding": req.headers["accept-encoding"] ?? "gzip",
          ...(req.headers["content-length"]
            ? { "content-length": req.headers["content-length"] }
            : {}),
        },
      },
      (response) => {
        if (res.destroyed) {
          response.destroy();
          return;
        }
        res.writeHead(response.statusCode, response.headers);
        response.pipe(res);
      },
    );
    upstream.setTimeout(25000, () => upstream.destroy(Error("Timeout")));
    upstream.on("error", () =>
      fail(
        503,
        "Serverul de calcul nu răspunde. Pornește npm start din mobile.",
      ),
    );
    req.on("aborted", () => upstream.destroy());
    res.on("close", () => {
      if (!res.writableEnded) upstream.destroy();
    });
    req.pipe(upstream);
  };
};
