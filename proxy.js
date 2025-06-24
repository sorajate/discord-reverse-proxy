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

  // Middleware to allow only POST requests to be forwarded
  const methodFilter = (req, res, next) => {
    // Allow POST requests, and GET requests that have query parameters.
    if (req.method === 'POST' || (req.method === 'GET' && Object.keys(req.query).length > 0)) {
      return next();
    }

    // Block all other requests.
    res.status(405).send('Method Not Allowed');
  };

  const proxy = createProxyMiddleware({
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
    },
    onProxyRes: (proxyRes, req, res) => {
      const body = [];
      proxyRes.on('data', (chunk) => {
        body.push(chunk);
      });
      proxyRes.on('end', () => {
        const bodyString = Buffer.concat(body).toString();
        let isSensitive = false;

        // Only try to parse JSON if the content type is correct
        if (proxyRes.headers['content-type'] && proxyRes.headers['content-type'].includes('application/json')) {
          try {
            const data = JSON.parse(bodyString);
            // Check for the sensitive keys that indicate a webhook info response
            if (data && data.token && data.url) {
              isSensitive = true;
            }
          } catch (e) {
            // Not valid JSON, so not the sensitive response
          }
        }

        if (isSensitive) {
          console.log(`[${new Date().toISOString()}] Blocked webhook info response for ${req.method} ${req.originalUrl}`);
          res.status(204).send(); // Send "No Content" to hide the response
        } else {
          console.log(`[${new Date().toISOString()}] ${req.method} ${req.originalUrl} -> ${proxyRes.statusCode}`);
          res.writeHead(proxyRes.statusCode, proxyRes.headers);
          res.end(bodyString);
        }
      });
    },
    onError: (err, req, res) => {
      console.error('Proxy error:', err);
      res.status(500).send('Proxy error');
    },
    selfHandleResponse: true, // Let us handle the response to filter it
  });

  // Apply the method filter before the proxy
  app.use(path, methodFilter, proxy);
}

app.get('/', (req, res) => {
  res.status(404).send('Not Found');
});

app.listen(PORT, () => {
  console.log(`Reverse proxy server listening on port ${PORT}`);
});
