# Discord Reverse Proxy

This project is a simple but powerful reverse proxy for your Discord webhooks. It allows you to create multiple, protected endpoints that forward requests to your Discord webhook URLs, keeping them safe and manageable.

## Features

- **Multiple Endpoints**: Configure as many webhook endpoints as you need.
- **Drop-in Replacement**: Use the proxy URL directly in your applications instead of the original webhook URL.
- **File Uploads**: Seamlessly forwards all request types, including `multipart/form-data` for file uploads.
- **Dynamic Configuration**: Add, remove, or change webhooks by simply editing the `.env` file—no code changes required.

## Prerequisites

- [Node.js](https://nodejs.org/) (v14 or higher)
- [npm](https://www.npmjs.com/)

## Installation

1.  **Clone the repository or download the source code.**

2.  **Install the dependencies:**

    ```bash
    npm install
    ```

## Configuration

1.  **Create a `.env` file** in the root of the project by copying the example:

    ```bash
    cp .env.example .env
    ```

2.  **Edit the `.env` file** to add your Discord webhook URLs. The number at the end of the variable name determines the proxy endpoint.

    For example:

    ```
    # /discord1 will point to this webhook
    DISCORD_WEBHOOK_1=https://discord.com/api/webhooks/your_webhook_id_1/your_webhook_token_1

    # /discord2 will point to this one
    DISCORD_WEBHOOK_2=https://discord.com/api/webhooks/your_webhook_id_2/your_webhook_token_2
    ```

## Running the Server

Start the reverse proxy server with the following command:

```bash
npm start
```

The server will run on `http://localhost:3000` by default. You will see a list of the configured proxy endpoints in the console.

## Usage

To use the proxy, replace your original Discord webhook URL with the corresponding proxy URL in your application.

-   **Original URL**: `https://discord.com/api/webhooks/your_webhook_id_1/your_webhook_token_1`
-   **Proxy URL**: `http://localhost:3000/discord1`

Any request sent to the proxy URL will be securely forwarded to the original Discord webhook, including all headers, body content, and file uploads.
