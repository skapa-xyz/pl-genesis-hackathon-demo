#!/usr/bin/env node
import { McpServer, ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import axios from 'axios';
// import { withPaymentInterceptor } from 'x402-axios';
import { withCustomPaymentInterceptor } from './x402-custom';
import { createWalletClient, http, defineChain } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import dotenv from 'dotenv';
import { z } from 'zod';
import winston from 'winston';
import DailyRotateFile from 'winston-daily-rotate-file';
import path from 'path';
import fs from 'fs';

dotenv.config();

// Configure winston logger
let logger: winston.Logger;

// Create a no-op logger that doesn't write anywhere
const createSilentLogger = () => {
  return winston.createLogger({
    level: 'info',
    format: winston.format.combine(
      winston.format.timestamp(),
      winston.format.json()
    ),
    transports: [],
    silent: true
  });
};

try {
  // Try multiple locations for logs
  const possibleLogDirs = [
    path.join(__dirname, '..', 'logs'),
    path.join(process.env.HOME || '', '.weatherxm-mcp', 'logs'),
    path.join(process.env.TMPDIR || '/tmp', 'weatherxm-mcp-logs')
  ];
  
  let logsDir: string | null = null;
  
  for (const dir of possibleLogDirs) {
    try {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      // Test write access
      const testFile = path.join(dir, '.write-test');
      fs.writeFileSync(testFile, 'test');
      fs.unlinkSync(testFile);
      logsDir = dir;
      break;
    } catch (e) {
      // Try next location
    }
  }
  
  if (logsDir) {
    const transport = new DailyRotateFile({
      filename: path.join(logsDir, 'weatherxm-mcp-%DATE%.log'),
      datePattern: 'YYYY-MM-DD',
      zippedArchive: true,
      maxSize: '20m',
      maxFiles: '14d',
      createSymlink: false
    });
    
    logger = winston.createLogger({
      level: 'info',
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json()
      ),
      transports: [transport]
    });
  } else {
    logger = createSilentLogger();
  }
} catch (error) {
  // If all logging attempts fail, use silent logger
  logger = createSilentLogger();
}

const API_KEY = process.env.WEATHERXMPRO_API_KEY;

const X402_PRIVATE_KEY = process.env.X402_PRIVATE_KEY;
if (!X402_PRIVATE_KEY) {
  logger.error('X402_PRIVATE_KEY environment variable is required');
  throw new Error('X402_PRIVATE_KEY environment variable is required');
}

const baseUrl = "http://localhost:8081/api/v1";

// Create an MCP server
const server = new McpServer({
  name: "weatherxm-pro-mcp-server",
  version: "0.6.0"
});


// Define Filecoin Calibration testnet
const filecoinCalibration = defineChain({
  id: 314159,
  name: 'Filecoin Calibration',
  network: 'filecoin-calibration',
  nativeCurrency: {
    decimals: 18,
    name: 'testnet filecoin',
    symbol: 'tFIL',
  },
  rpcUrls: {
    default: { http: ['https://api.calibration.node.glif.io/rpc/v1'] },
  },
  blockExplorers: {
    default: { name: 'Filfox', url: 'https://calibration.filfox.info' },
  },
});

// Create account from private key
const privateKey = X402_PRIVATE_KEY.startsWith('0x') ? X402_PRIVATE_KEY : `0x${X402_PRIVATE_KEY}`;
const account = privateKeyToAccount(privateKey as `0x${string}`);

// Create a proper wallet client for Filecoin Calibration
const filecoinWallet = createWalletClient({
  account,
  chain: filecoinCalibration,
  transport: http()
});

// Create axios instance with optional API key
const headers: Record<string, string> = {};
if (API_KEY) {
  headers['X-API-KEY'] = API_KEY;
}

const baseAxiosInstance = axios.create({
  baseURL: baseUrl,
  headers
});

// Enable custom x402 payment interceptor with our Filecoin wallet
// This uses "USD for Filecoin Community" as the EIP-712 domain name
const axiosInstance = withCustomPaymentInterceptor(
  baseAxiosInstance, 
  filecoinWallet,
  logger
);

// Helper function to format log timestamp
const getTimestamp = () => new Date().toISOString();

// Helper function to log tool invocations
const logToolInvocation = (toolName: string, params: any) => {
  logger.info('MCP tool invoked', { tool: toolName, parameters: params });
};

// Add request interceptor for logging
axiosInstance.interceptors.request.use(
  (config) => {
    logger.info('HTTP Request', {
      method: config.method?.toUpperCase(),
      url: config.url,
      headers: config.headers,
      params: config.params,
      data: config.data
    });
    return config;
  },
  (error) => {
    logger.error('HTTP Request Error', { error: error.message });
    return Promise.reject(error);
  }
);

// Add response interceptor for logging
axiosInstance.interceptors.response.use(
  (response) => {
    logger.info('HTTP Response', {
      status: response.status,
      statusText: response.statusText,
      url: response.config.url,
      headers: response.headers,
      dataSize: response.data ? JSON.stringify(response.data).length : 0,
      dataSample: response.data ? JSON.stringify(response.data).substring(0, 500) : null
    });
    return response;
  },
  (error) => {
    if (error.response) {
      logger.error('HTTP Response Error', {
        status: error.response.status,
        statusText: error.response.statusText,
        url: error.config?.url,
        headers: error.response.headers,
        errorData: error.response.data
      });
    } else {
      logger.error('Network Error', { 
        error: error.message,
        stack: error.stack,
        code: error.code
      });
    }
    return Promise.reject(error);
  }
);

// Add MCP tool for getStationsNear
server.tool(
  "get_stations_near",
  {
    lat: z.number().describe("Latitude of the center of the area"),
    lon: z.number().describe("Longitude of the center of the area"),
    radius: z.number().describe("Radius in meters for which stations are queried"),
  },
  async ({ lat, lon, radius }) => {
    logToolInvocation('get_stations_near', { lat, lon, radius });
    try {
      const response = await axiosInstance.get('/stations/near', {
        params: { lat, lon, radius },
      });
      return {
        content: [{ type: "text", text: JSON.stringify(response.data) }],
      };
    } catch (error: any) {
      if (axios.isAxiosError(error)) {
        return {
          content: [{ type: "text", text: `WeatherXM API error: ${error.response?.data.message ?? error.message}` }],
          isError: true,
        };
      }
      throw error;
    }
  }
);

// Add MCP tool for getStationsBounds
server.tool(
  "get_stations_bounds",
  {
    min_lat: z.number().describe("Minimum latitude of the bounding box"),
    min_lon: z.number().describe("Minimum longitude of the bounding box"),
    max_lat: z.number().describe("Maximum latitude of the bounding box"),
    max_lon: z.number().describe("Maximum longitude of the bounding box"),
  },
  async ({ min_lat, min_lon, max_lat, max_lon }) => {
    logToolInvocation('get_stations_bounds', { min_lat, min_lon, max_lat, max_lon });
    try {
      const response = await axiosInstance.get('/stations/bounds', {
        params: { min_lat, min_lon, max_lat, max_lon },
      });
      return {
        content: [{ type: "text", text: JSON.stringify(response.data) }],
      };
    } catch (error: any) {
      if (axios.isAxiosError(error)) {
        return {
          content: [{ type: "text", text: `WeatherXM API error: ${error.response?.data.message ?? error.message}` }],
          isError: true,
        };
      }
      throw error;
    }
  }
);

// Add MCP tool for getAllStations
server.tool(
  "get_all_stations",
  {},
  async () => {
    logToolInvocation('get_all_stations', {});
    try {
      const response = await axiosInstance.get('/stations');
      return {
        content: [{ type: "text", text: JSON.stringify(response.data) }],
      };
    } catch (error: any) {
      if (axios.isAxiosError(error)) {
        return {
          content: [{ type: "text", text: `WeatherXM API error: ${error.response?.data.message ?? error.message}` }],
          isError: true,
        };
      }
      throw error;
    }
  }
);

// Add MCP tool for getLatestObservation
server.tool(
  "get_latest_observation",
  {
    station_id: z.string().describe("The unique identifier of the station"),
  },
  async ({ station_id }) => {
    logToolInvocation('get_latest_observation', { station_id });
    try {
      const response = await axiosInstance.get(`/stations/${station_id}/latest`);
      return {
        content: [{ type: "text", text: JSON.stringify(response.data) }],
      };
    } catch (error: any) {
      if (axios.isAxiosError(error)) {
        return {
          content: [{ type: "text", text: `WeatherXM API error: ${error.response?.data.message ?? error.message}` }],
          isError: true,
        };
      }
      throw error;
    }
  }
);

// Add MCP tool for getHistoricalObservations
server.tool(
  "get_historical_observations",
  {
    station_id: z.string().describe("The unique identifier of the station"),
    date: z.string().describe("Date (YYYY-MM-DD) for historical observations"),
  },
  async ({ station_id, date }) => {
    logToolInvocation('get_historical_observations', { station_id, date });
    try {
      const response = await axiosInstance.get(`/stations/${station_id}/history`, {
        params: { date },
      });
      return {
        content: [{ type: "text", text: JSON.stringify(response.data) }],
      };
    } catch (error: any) {
      if (axios.isAxiosError(error)) {
        return {
          content: [{ type: "text", text: `WeatherXM API error: ${error.response?.data.message ?? error.message}` }],
          isError: true,
        };
      }
      throw error;
    }
  }
);

// Add MCP tool for searchCellsInRegion
server.tool(
  "search_cells_in_region",
  {
    region_query: z.string().describe("The name of the region to search for cells"),
  },
  async ({ region_query }) => {
    logToolInvocation('search_cells_in_region', { region_query });
    try {
      const response = await axiosInstance.get('/cells/search', {
        params: { query: region_query },
      });
      return {
        content: [{ type: "text", text: JSON.stringify(response.data) }],
      };
    } catch (error: any) {
      if (axios.isAxiosError(error)) {
        return {
          content: [{ type: "text", text: `WeatherXM API error: ${error.response?.data.message ?? error.message}` }],
          isError: true,
        };
      }
      throw error;
    }
  }
);

// Add MCP tool for getStationsInCell
server.tool(
  "get_stations_in_cell",
  {
    cell_index: z.string().describe("The H3 index of the cell to return stations for"),
  },
  async ({ cell_index }) => {
    logToolInvocation('get_stations_in_cell', { cell_index });
    try {
      const response = await axiosInstance.get(`/cells/${cell_index}/stations`);
      return {
        content: [{ type: "text", text: JSON.stringify(response.data) }],
      };
    } catch (error: any) {
      if (axios.isAxiosError(error)) {
        return {
          content: [{ type: "text", text: `WeatherXM API error: ${error.response?.data.message ?? error.message}` }],
          isError: true,
        };
      }
      throw error;
    }
  }
);

// Add MCP tool for getForecastForCell
server.tool(
  "get_forecast_for_cell",
  {
    forecast_cell_index: z.string().describe("The H3 index of the cell to get forecast for"),
    forecast_from: z.string().describe("The first day for which to get forecast data (YYYY-MM-DD)"),
    forecast_to: z.string().describe("The last day for which to get forecast data (YYYY-MM-DD)"),
    forecast_include: z.enum(['daily', 'hourly']).describe('Types of forecast to include'),
  },
  async ({ forecast_cell_index, forecast_from, forecast_to, forecast_include }) => {
    logToolInvocation('get_forecast_for_cell', { forecast_cell_index, forecast_from, forecast_to, forecast_include });
    try {
      const response = await axiosInstance.get(`/cells/${forecast_cell_index}/forecast/wxmv1`, {
        params: {
          from: forecast_from,
          to: forecast_to,
          include: forecast_include,
        },
      });
      return {
        content: [{ type: "text", text: JSON.stringify(response.data) }],
      };
    } catch (error: any) {
      if (axios.isAxiosError(error)) {
        return {
          content: [{ type: "text", text: `WeatherXM API error: ${error.response?.data.message ?? error.message}` }],
          isError: true,
        };
      }
      throw error;
    }
  }
);


// Add MCP tool for getHyperlocalForecast
server.tool(
  "get_hyperlocal_forecast",
  {
    station_id: z.string().describe("The station to get the forecast for."),
    variable: z.string().describe("The weather variable to get the forecast for."),
    timezone: z.string().optional().describe("The timezone to get forecast for. Defaults to station location timezone."),
  },
  async ({ station_id, variable, timezone }) => {
    logToolInvocation('get_hyperlocal_forecast', { station_id, variable, timezone });
    const allowedVariables = ["temperature", "humidity", "precipitation", "windSpeed", "windDirection"];
    if (!allowedVariables.includes(variable)) {
      return {
        content: [{ type: "text", text: `Invalid variable provided: ${variable}. Allowed variables are: ${allowedVariables.join(", ")}` }],
        isError: true,
      };
    }
    try {
      const response = await axiosInstance.get(`/stations/${station_id}/hyperlocal`, {
        params: { variable, timezone },
      });
      return {
        content: [{ type: "text", text: JSON.stringify(response.data) }],
      };
    } catch (error: any) {
      if (axios.isAxiosError(error)) {
        return {
          content: [{ type: "text", text: `WeatherXM API error: ${error.response?.data.message ?? error.message}` }],
          isError: true,
        };
      }
      throw error;
    }
  }
);

// Add MCP tool for getFactPerformance
server.tool(
  "get_fact_performance",
  {
    station_id: z.string().describe("The station to get the forecast performance for."),
    variable: z.string().describe("The weather variable to get the forecast for."),
  },
  async ({ station_id, variable }) => {
    logToolInvocation('get_fact_performance', { station_id, variable });
    const allowedVariables = ["temperature", "humidity", "precipitation", "windSpeed", "windDirection"];
    if (!allowedVariables.includes(variable)) {
      return {
        content: [{ type: "text", text: `Invalid variable provided: ${variable}. Allowed variables are: ${allowedVariables.join(", ")}` }],
        isError: true,
      };
    }
    try {
      const response = await axiosInstance.get(`/stations/${station_id}/fact/performance`, {
        params: { variable },
      });
      return {
        content: [{ type: "text", text: JSON.stringify(response.data) }],
      };
    } catch (error: any) {
      if (axios.isAxiosError(error)) {
        return {
          content: [{ type: "text", text: `WeatherXM API error: ${error.response?.data.message ?? error.message}` }],
          isError: true,
        };
      }
      throw error;
    }
  }
);

// Add MCP tool for getFactRanking
server.tool(
  "get_fact_ranking",
  {
    station_id: z.string().describe("The station to get the forecast ranking for."),
  },
  async ({ station_id }) => {
    logToolInvocation('get_fact_ranking', { station_id });
    try {
      const response = await axiosInstance.get(`/stations/${station_id}/fact/ranking`);
      return {
        content: [{ type: "text", text: JSON.stringify(response.data) }],
      };
    } catch (error: any) {
      if (axios.isAxiosError(error)) {
        return {
          content: [{ type: "text", text: `WeatherXM API error: ${error.response?.data.message ?? error.message}` }],
          isError: true,
        };
      }
      throw error;
    }
  }
);

// Start the server
async function run() {
  logger.info('Starting WeatherXM PRO MCP server', {
    version: '0.6.0',
    baseUrl,
    apiKeyProvided: !!API_KEY,
    x402Configured: !!X402_PRIVATE_KEY,
    availableTools: ['get_stations_near', 'get_stations_bounds', 'get_all_stations', 'get_latest_observation', 'get_historical_observations', 'search_cells_in_region', 'get_stations_in_cell', 'get_forecast_for_cell', 'get_hyperlocal_forecast', 'get_fact_performance', 'get_fact_ranking']
  });
  
  const transport = new StdioServerTransport();
  await server.connect(transport);
  logger.info('WeatherXM PRO MCP server running on stdio');
  // Only output required MCP server message to stderr
  console.error('WeatherXM PRO MCP server running on stdio');
}

run().catch(error => {
  logger.error('Error running MCP server', { error: error.message, stack: error.stack });
  process.exit(1);
});
