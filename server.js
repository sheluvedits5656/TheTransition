const express = require("express");
const { createProxyMiddleware } = require("http-proxy-middleware");
const cheerio = require("cheerio");
const URL = require("url");

const app = express();

// basic homepage
app.get("/", (req, res) => {
    res.send(`
        <form method="GET" action="/proxy">
            <input name="url" placeholder="example.com" />
            <button type="submit">Go</button>
        </form>
    `);
});

// function to ensure URL has protocol
function ensureProtocol(url) {
    if (!url) return "";
    if (!url.startsWith("http://") && !url.startsWith("https://")) {
        return "https://" + url;
    }
    return url;
}

// proxy route with HTML rewriting
app.use("/proxy", async (req, res, next) => {
    let target = req.query.url;
    
    if (!target) return res.send("No URL provided");
    
    // Add protocol if missing
    target = ensureProtocol(target);
    
    // Create a custom proxy middleware that will intercept and modify the response
    const proxy = createProxyMiddleware({
        target: target,
        changeOrigin: true,
        pathRewrite: {
            "^/proxy": "",
        },
        selfHandleResponse: true, // Important: we'll handle the response ourselves
       onProxyRes: function (proxyRes, req, res) {
    let body = [];

    proxyRes.on("data", function (chunk) {
        body.push(chunk);
    });

    proxyRes.on("end", function () {
        const buffer = Buffer.concat(body);
        const contentType = proxyRes.headers["content-type"] || "";

        // ✅ If NOT HTML → send raw buffer (fixes weird symbols)
        if (!contentType.includes("text/html")) {
            res.writeHead(proxyRes.statusCode, proxyRes.headers);
            return res.end(buffer);
        }

        // ✅ Only HTML gets converted to string
        let bodyStr = buffer.toString();

        try {
            const $ = cheerio.load(bodyStr);
            const targetDomain = new URL(target).hostname;

            $("a").each(function () {
                const href = $(this).attr("href");
                if (href && !href.startsWith("#") && !href.startsWith("javascript:")) {
                    const absoluteUrl = new URL(href, target).href;
                    const urlObj = new URL(absoluteUrl);

                    if (urlObj.hostname === targetDomain) {
                        $(this).attr("href", `/proxy?url=${encodeURIComponent(absoluteUrl)}`);
                    }
                }
            });

            bodyStr = $.html();
        } catch (e) {
            console.error("HTML parse error:", e);
        }

        res.send(bodyStr);
    });
}
                        
                        // Rewrite CSS, JS, image sources
                        $('link, script, img').each(function() {
                            const src = $(this).attr('href') || $(this).attr('src');
                            if (src) {
                                const absoluteUrl = new URL(src, target).href;
                                const urlObj = new URL(absoluteUrl);
                                
                                if (urlObj.hostname === targetDomain) {
                                    if ($(this).is('link, script')) {
                                        $(this).attr('href', absoluteUrl);
                                        $(this).attr('src', absoluteUrl);
                                    } else {
                                        $(this).attr('src', absoluteUrl);
                                    }
                                }
                            }
                        });
                        
                        body = $.html();
                    } catch (e) {
                        console.error('Error parsing HTML:', e);
                        // If parsing fails, just return the original body
                    }
                }
                
                // Send the modified response
                res.send(body);
            });
        }
    });
    
    proxy(req, res, next);
});

app.listen(3000, () => {
    console.log("Proxy running on http://localhost:3000");
});
