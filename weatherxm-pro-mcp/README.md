# WeatherXM PRO MCP Server

An MCP server implementation exposing the WeatherXM PRO APIs as MCP tools, allowing clients to access weather station data, observations, and forecasts through the MCP protocol.

## Features

- Get stations near a location (latitude, longitude, radius)
- Get stations within a bounding box (min/max latitude and longitude)
- Get all available stations
- Get the latest observation for a specific station
- Get historical observations for a station on a specific date
- Search for H3 cells by region name
- Get stations in a specific H3 cell
- Get weather forecast (daily or hourly) for a specific H3 cell
- Get hyperlocal forecast for a station and variable
- Get forecast performance (FACT) for a station and variable
- Get forecast ranking (FACT) for a station

## Prerequisites

- Node.js and npm installed
- X402 private key for automatic payment handling
- (Optional) A valid WeatherXM PRO API key - not required when using X402 payments

## Configuration

Clone the repository to your local machine.

```bash
git clone https://github.com/WeatherXM/weatherxm-pro-mcp.git
```

## Installation

After cloning the repository, you need to install the dependencies and build the project before running the MCP server.

```bash
npm install
npm run build
```

## Server Configuration for MCP Clients

This is the common configuration for MCP clients such as Claude Desktop, Cursor, Windsurf Editor, VSCode and plugins such as RooCode and Cline.

```json
{
  "mcpServers": {
    "weatherxm-pro": {
      "command": "npx",
      "args": [
        "-y",
        "path to mcp"
      ],
      "env": {
        "X402_PRIVATE_KEY": "your-x402-private-key",
        "WEATHERXMPRO_API_KEY": "your-api-key-optional"
      }
    }
  }
}
```

Replace `"path to mcp"` with the actual path to the MCP server or package name and `"your-x402-private-key"` with your X402 private key. The WeatherXM PRO API key is optional when using X402 payments.
> Note: If you have other MCP servers in use in the client, you can add it to the existing `mcpServers` object.

### X402 Payment Integration

This MCP server uses [x402-axios](https://x402.gitbook.io/x402/getting-started/quickstart-for-buyers#id-3.-make-paid-requests-automatically) to automatically handle micropayments for API requests. The server connects to `http://localhost:8081` which should be running the WeatherXM PRO service with X402 payment support.

When using X402 payments:
1. The WeatherXM PRO API key is **optional** - authentication is handled through X402 payments
2. Ensure you have an X402 private key configured in your environment
3. The server will automatically handle payment negotiation for each API request
4. Payments are made transparently without requiring manual intervention

Note: You can still provide a WeatherXM PRO API key if needed, but it's not required when using X402 payments.

### Logging

The MCP server logs all activity to help with monitoring and debugging:

- **Log Locations** (tries in order):
  - `<project-dir>/logs/weatherxm-mcp-YYYY-MM-DD.log`
  - `~/.weatherxm-mcp/logs/weatherxm-mcp-YYYY-MM-DD.log`
  - `/tmp/weatherxm-mcp-logs/weatherxm-mcp-YYYY-MM-DD.log`
- **Log Rotation**: Daily rotation with 14 days retention
- **Log Content**: 
  - MCP tool invocations with parameters
  - HTTP requests (method, URL, headers, params)
  - HTTP responses (status, headers, data samples)
  - Errors and exceptions
  - Server startup configuration

Logs are written in JSON format for easy parsing and analysis. No output is sent to stdout/stderr except for the required MCP server startup message.

## Claude Desktop

Follow the steps below to use the WeatherXM PRO MCP server with Claude Desktop MCP client:

1. Edit the MCP settings file located at:

   ```
   ~/Library/Application Support/Claude/claude_desktop_config.json
   ```

2. Add the WeatherXM PRO MCP server configuration under the `mcpServers` object.
3. Restart Claude Desktop to apply the changes.
4. You can now use the server in Claude Desktop to run queries on the WeatherXM PRO MCP server.

## Cursor

Follow the steps below to use the WeatherXM PRO MCP server with Cursor:

1. Install [Cursor](https://cursor.sh/) on your machine.
2. In Cursor, go to Cursor > Cursor Settings > MCP > Add a new global MCP server.
3. Specify the same configuration as in the Server Configuration for MCP Clients section.
4. Save the configuration.
5. You will see weatherxm-pro as an added server in MCP servers list.
6. You can now use the WeatherXM PRO MCP server in Cursor to run queries.

## Windsurf Editor

Follow the steps below to use the WeatherXM PRO MCP server with [Windsurf Editor](https://windsurf.com/):

1. Install Windsurf Editor on your machine.
2. Navigate to Command Palette > Windsurf MCP Configuration Panel or Windsurf - Settings > Advanced > Cascade > Model Context Protocol (MCP) Servers.
3. Click on Add Server and then Add custom server.
4. Add the WeatherXM PRO MCP Server configuration from the Server Configuration for MCP Clients section.
5. Save the configuration.
6. You will see weatherxm-pro as an added server in MCP Servers list.
7. You can now use the WeatherXM PRO MCP server in Windsurf Editor to run queries.

## Docker Image

The MCP server can be built and run as a Docker container.

### Build

```bash
docker build -t weatherxm-pro-mcp .
```

### Run

```bash
docker run -d -p 3000:3000 -e WEATHERXMPRO_API_KEY="your-api-key" -e PORT=3000 weatherxm-pro-mcp
```

Replace `"your-api-key"` with your actual WeatherXM PRO API key.

## Troubleshooting Tips

- Ensure the path to your MCP server repository is correct in the configuration.
- Verify that your WeatherXM PRO API key is set correctly.
- Check that the MCP client configuration matches the server settings.
- Check the logs for any errors or warnings that may indicate issues with the MCP server.

## License

MIT License
