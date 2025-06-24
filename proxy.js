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
    if (process.env.DEBUG === 'true') {
      console.log(`[${new Date().toISOString()}] DEBUG: Blocking request with method ${req.method} for ${req.originalUrl}. Responding with 405.`);
    }
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
        const bodyBuffer = Buffer.concat(body); // Keep it as a buffer first

        // Check if the response is JSON and needs to be inspected
        if (proxyRes.headers['content-type'] && proxyRes.headers['content-type'].includes('application/json')) {
          const bodyString = bodyBuffer.toString(); // Now convert to string for inspection
          let isSensitive = false;

          if (process.env.DEBUG === 'true') {
            // Log the string version for readable debug output
            console.log(`[${new Date().toISOString()}] DEBUG: Response from Discord for ${req.originalUrl}`);
            console.log(`  - Status: ${proxyRes.statusCode}`);
            console.log('  - Headers:', JSON.stringify(proxyRes.headers, null, 2));
            console.log('  - Body:', bodyString);
          }

          try {
            const data = JSON.parse(bodyString);
            if (data && data.token && data.url) {
              isSensitive = true;
            }
          } catch (e) {
            // Not valid JSON, so not sensitive. Let it pass through.
          }

          if (isSensitive) {
            if (process.env.DEBUG === 'true') {
              console.log(`[${new Date().toISOString()}] DEBUG: Sensitive response detected. Blocking and sending 204.`);
            }
            console.log(`[${new Date().toISOString()}] Blocked webhook info response for ${req.method} ${req.originalUrl}`);
            res.status(204).send(); // Send "No Content" and stop
            return; // IMPORTANT: exit here to prevent forwarding
          }
        } else if (process.env.DEBUG === 'true') {
          // For non-JSON, log that we are forwarding binary data
          console.log(`[${new Date().toISOString()}] DEBUG: Response from Discord for ${req.originalUrl}`);
          console.log(`  - Status: ${proxyRes.statusCode}`);
          console.log('  - Headers:', JSON.stringify(proxyRes.headers, null, 2));
          console.log(`  - Body: <Binary data, length: ${bodyBuffer.length}>`);
        }

        // If we've reached here, the response is not sensitive (or not JSON)
        // Forward the original response buffer
        if (process.env.DEBUG === 'true') {
          console.log(`[${new Date().toISOString()}] DEBUG: Forwarding non-sensitive response to client.`);
        }
        console.log(`[${new Date().toISOString()}] ${req.method} ${req.originalUrl} -> ${proxyRes.statusCode}`);
        res.writeHead(proxyRes.statusCode, proxyRes.headers);
        res.end(bodyBuffer); // Send the raw buffer to prevent corruption
      });
    },
    onError: (err, req, res) => {
      console.error('Proxy error:', err);
      res.status(500).send('Proxy error');
    },
    selfHandleResponse: true, // Let us handle the response to filter it
  });

  // Middleware for optional request logging
  const requestLogger = (req, res, next) => {
    if (process.env.DEBUG === 'true') {
      console.log(`[${new Date().toISOString()}] DEBUG: Incoming Request for ${req.originalUrl}`);
      console.log(`  - Method: ${req.method}`);
      console.log('  - Headers:', JSON.stringify(req.headers, null, 2));
    }
    next();
  };

  // Apply the logger, then the method filter, then the proxy
  app.use(path, requestLogger, methodFilter, proxy);
}

app.get('/', (req, res) => {
  res.status(404).send('Not Found');
});

app.listen(PORT, () => {
  console.log(`Reverse proxy server listening on port ${PORT}`);
});
