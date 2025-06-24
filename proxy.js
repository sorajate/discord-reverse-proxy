process.noDeprecation = true;
require('dotenv').config();
const express = require('express');
const { createProxyMiddleware } = require('http-proxy-middleware');
const zlib = require('zlib');

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
        const bodyBuffer = Buffer.concat(body);

        const forwardResponse = (buffer) => {
          const headers = { ...proxyRes.headers };
          // Since we buffered the response, we are no longer streaming chunked data.
          // We must remove the chunked encoding header and set the content length.
          delete headers['transfer-encoding'];
          headers['content-length'] = buffer.length;

          if (process.env.DEBUG === 'true') {
            console.log(`[${new Date().toISOString()}] DEBUG: Forwarding response to client.`);
          }
          console.log(`[${new Date().toISOString()}] ${req.method} ${req.originalUrl} -> ${proxyRes.statusCode}`);
          res.writeHead(proxyRes.statusCode, headers);
          res.end(buffer);
        };

        // Only inspect JSON responses for sensitive data
        if (proxyRes.headers['content-type'] && proxyRes.headers['content-type'].includes('application/json')) {
          const encoding = proxyRes.headers['content-encoding'];
          let decompressedBuffer;

          try {
            if (encoding === 'gzip') {
              decompressedBuffer = zlib.gunzipSync(bodyBuffer);
            } else if (encoding === 'deflate') {
              decompressedBuffer = zlib.inflateSync(bodyBuffer);
            } else if (encoding === 'br') {
              decompressedBuffer = zlib.brotliDecompressSync(bodyBuffer);
            } else {
              decompressedBuffer = bodyBuffer;
            }
          } catch (err) {
            if (process.env.DEBUG === 'true') {
              console.error(`[${new Date().toISOString()}] DEBUG: Decompression failed. Forwarding original response.`, err);
            }
            forwardResponse(bodyBuffer);
            return;
          }

          const bodyString = decompressedBuffer.toString();
          if (process.env.DEBUG === 'true') {
            console.log(`[${new Date().toISOString()}] DEBUG: Inspected Response Body:`, bodyString);
          }

          try {
            const data = JSON.parse(bodyString);
            if (data && data.token && data.url) {
              // Sensitive data found, block the response
              if (process.env.DEBUG === 'true') {
                console.log(`[${new Date().toISOString()}] DEBUG: Sensitive response detected. Blocking and sending 204.`);
              }
              console.log(`[${new Date().toISOString()}] Blocked webhook info response for ${req.method} ${req.originalUrl}`);
              res.status(204).send();
              return;
            }
          } catch (e) {
            // Not valid JSON, so not sensitive.
          }
        }

        // If we reach here, the response is not JSON or not sensitive.
        // Forward the original response buffer.
        forwardResponse(bodyBuffer);
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
