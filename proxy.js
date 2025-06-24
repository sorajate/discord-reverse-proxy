process.noDeprecation = true;
require('dotenv').config();
const express = require('express');
const { createProxyMiddleware } = require('http-proxy-middleware');

const app = express();
const PORT = process.env.PORT || 3000;

// Find all webhook URLs from environment variables
const webhooks = {};
for (const key in process.env) {
  if (key.startsWith('DISCORD_WEBHOOK_')) {
    const index = key.replace('DISCORD_WEBHOOK_', '');
    const targetUrl = process.env[key];
    if (targetUrl) {
      webhooks[index] = targetUrl;
    }
  }
}

if (Object.keys(webhooks).length === 0) {
  console.error('No Discord webhook URLs found in .env file.');
  console.error('Please add at least one webhook with the format DISCORD_WEBHOOK_1=your_url');
  process.exit(1);
}

console.log('Setting up the following webhook proxies:');

// Dynamically create a proxy for each webhook
for (const index in webhooks) {
  const path = `/discord${index}`;
  const target = webhooks[index];
  const targetHost = new URL(target).hostname;

  console.log(`- http://localhost:${PORT}${path} -> ${target.substring(0, 40)}...`);

  app.use(
    path,
    createProxyMiddleware({
      target,
      changeOrigin: true,
      pathRewrite: {
        // Remove the proxy path from the start of the URL
        // e.g., /discord1/anything -> /anything
        [`^${path}`]: '',
      },
      onProxyReq: (proxyReq, req, res) => {
        // Set the host header to the Discord API host
        proxyReq.setHeader('Host', targetHost);

        // By not using a body parser in Express, we can let the proxy
        // handle the raw request stream. This is crucial for forwarding
        // any content type, including multipart/form-data for file uploads.
      },
      onProxyRes: (proxyRes, req, res) => {
        console.log(`[${new Date().toISOString()}] ${req.method} ${req.originalUrl} -> ${proxyRes.statusCode}`);
      },
      onError: (err, req, res) => {
        console.error('Proxy error:', err);
        res.status(500).send('Proxy error');
      },
    })
  );
}

app.get('/', (req, res) => {
  res.send('Discord Reverse Proxy is running.');
});

app.listen(PORT, () => {
  console.log(`Reverse proxy server listening on port ${PORT}`);
});
