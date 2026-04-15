const express = require("express");
const { createProxyMiddleware } = require("http-proxy-middleware");
const cheerio = require("cheerio");

const app = express();

// ----------------------
// Homepage
// ----------------------
app.get("/", (req, res) => {
    res.send(`
        <style>
            body {
                background: #0a0a0a;
                display: flex;
                justify-content: center;
                align-items: center;
                height: 100vh;
                margin: 0;
                font-family: Arial;
            }
            input {
                padding: 12px;
                width: 300px;
                border-radius: 25px;
                border: none;
                outline: none;
                background: #111;
                color: white;
            }
            button {
                padding: 12px 20px;
                border-radius: 25px;
                border: none;
                background: linear-gradient(45deg,#00ffc8,#007bff);
                color: white;
                cursor: pointer;
            }
        </style>

        <form method="GET" action="/proxy">
            <input name="url" placeholder="Enter URL..." />
            <button>Go</button>
        </form>
    `);
});

// ----------------------
// URL normalizer (ONLY ONCE)
// ----------------------
function ensureProtocol(url) {
    if (!url) return "";
    if (!url.startsWith("http://") && !url.startsWith("https://")) {
        return "https://" + url;
    }
    return url;
}

// ----------------------
// Proxy route
// ----------------------
app.use("/proxy", (req, res, next) => {
    let target = req.query.url;
    if (!target) return res.send("No URL provided");

    target = ensureProtocol(target);

    const proxy = createProxyMiddleware({
        target,
        changeOrigin: true,
        followRedirects: false, // we handle redirects ourselves

        pathRewrite: {
            "^/proxy": ""
        },

        selfHandleResponse: true,

        onProxyReq: (proxyReq) => {
            proxyReq.setHeader("accept-encoding", "identity");
        },

        onProxyRes: (proxyRes, req, res) => {

            // ----------------------
            // 🔥 HANDLE REDIRECTS
            // ----------------------
            const location = proxyRes.headers["location"];
            if (location) {
                const redirectUrl = `/proxy?url=${encodeURIComponent(location)}`;

                res.writeHead(proxyRes.statusCode, {
                    ...proxyRes.headers,
                    location: redirectUrl
                });

                return res.end();
            }

            let body = [];

            proxyRes.on("data", chunk => body.push(chunk));

            proxyRes.on("end", () => {
                const buffer = Buffer.concat(body);
                const contentType = proxyRes.headers["content-type"] || "";

                // non-html passthrough
                if (!contentType.includes("text/html")) {
                    res.writeHead(proxyRes.statusCode, proxyRes.headers);
                    return res.end(buffer);
                }

                let html = buffer.toString();

                try {
                    const $ = cheerio.load(html);
                    const base = new URL(target);

                    // rewrite links
                    $("a").each(function () {
                        const href = $(this).attr("href");
                        if (!href || href.startsWith("#") || href.startsWith("javascript:")) return;

                        try {
                            const absolute = new URL(href, base).href;
                            $(this).attr("href", `/proxy?url=${encodeURIComponent(absolute)}`);
                        } catch {}
                    });

                    // rewrite forms
                    $("form").each(function () {
                        const action = $(this).attr("action");
                        if (!action) return;

                        try {
                            const absolute = new URL(action, base).href;
                            $(this).attr("action", `/proxy?url=${encodeURIComponent(absolute)}`);
                        } catch {}
                    });

                    // rewrite assets
                    $("[src], [href]").each(function () {
                        const attr = $(this).attr("src") ? "src" : "href";
                        const val = $(this).attr(attr);

                        if (!val || val.startsWith("data:")) return;

                        try {
                            const absolute = new URL(val, base).href;
                            $(this).attr(attr, absolute);
                        } catch {}
                    });

                    $("head").prepend(`<base href="${base.href}">`);

                    html = $.html();
                } catch (err) {
                    console.log("HTML parse error:", err);
                }

                res.writeHead(proxyRes.statusCode, proxyRes.headers);
                res.end(html);
            });
        }
    });

    proxy(req, res, next);
});

// ----------------------
// Start server
// ----------------------
app.listen(3000, () => {
    console.log("✅ Proxy running: http://localhost:3000");
});
