const express = require("express");
const { createProxyMiddleware } = require("http-proxy-middleware");

const app = express();

// basic homepage
app.get("/", (req, res) => {
    res.send(`
        <form method="GET" action="/proxy">
            <input name="url" placeholder="https://example.com" />
            <button type="submit">Go</button>
        </form>
    `);
});

// proxy route
app.use("/proxy", (req, res, next) => {
    const target = req.query.url;

    if (!target) return res.send("No URL provided");

    return createProxyMiddleware({
        target: target,
        changeOrigin: true,
        pathRewrite: {
            "^/proxy": "",
        },
    })(req, res, next);
});

app.listen(3000, () => {
    console.log("Proxy running on http://localhost:3000");
});