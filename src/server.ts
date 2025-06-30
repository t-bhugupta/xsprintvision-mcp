import fs from 'fs';
import path from 'path';
import express, { Request, Response } from "express";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";
import { fileURLToPath } from 'url';
import { registerListSprintWorkItemsTool } from "./tools/getworkitemslist.js";
import { registerGenerateWorkItemFieldSummaryTool } from "./tools/getWorkItemInsights.js";
import { registerGetWorkItemsByStateTool } from "./tools/getWorkItemsByState.js";
import { registerAnalyzeWorkItemStatesTool } from "./tools/analyzeWorkItemStates.js";
import { registerDetectLaggingTasksTool } from "./tools/detectLaggingTasks.js";
import { registerSprintCompletionRateTool } from "./tools/sprintCompletionRate.js";
import { registerFlagOpenChildrenOfClosedParentTool } from "./tools/flagOpenChildrenOfClosedParent.js";
import { registerDetectTasksWithoutOriginalEstimateTool } from "./tools/detectTasksWithoutOriginalEstimate.js";

// Polyfill __dirname for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const sprintDataPath = path.join(__dirname, '..', 'data', 'sprint_insights.json');
let sprintInsights: any[] = [];

try {
  const fileData = fs.readFileSync(sprintDataPath, 'utf-8');
  sprintInsights = JSON.parse(fileData);
  console.log(`Loaded ${sprintInsights.length} sprint items from sprint_insights.json`);
} catch (err) {
  console.error("Error loading sprint insights:", err);
}


const server = new McpServer({
  name: "mcp-streamable-http",
  version: "1.0.0",
});

// Register tools
const getWorkItemsList = registerListSprintWorkItemsTool(server);
const getWorkItemfieldSummary = registerGenerateWorkItemFieldSummaryTool(server);
const getWorkItemsByState = registerGetWorkItemsByStateTool(server);
const analyzeWorkItemStates = registerAnalyzeWorkItemStatesTool(server);
const detectLaggingTasks = registerDetectLaggingTasksTool(server);
const sprintCompletionRate = registerSprintCompletionRateTool(server);
const flagOpenChildrenOfClosedParent = registerFlagOpenChildrenOfClosedParentTool(server);
const detectTasksWithoutOriginalEstimate = registerDetectTasksWithoutOriginalEstimateTool(server);


const app = express();
app.use(express.json());

const transport: StreamableHTTPServerTransport =
  new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined, // set to undefined for stateless servers
  });

// Setup routes for the server
const setupServer = async () => {
  await server.connect(transport);
};

app.post("/mcp", async (req: Request, res: Response) => {
  console.log("Received MCP request:", req.body);
  try {
    await transport.handleRequest(req, res, req.body);
  } catch (error) {
    console.error("Error handling MCP request:", error);
    if (!res.headersSent) {
      res.status(500).json({
        jsonrpc: "2.0",
        error: {
          code: -32603,
          message: "Internal server error",
        },
        id: null,
      });
    }
  }
});

app.get("/mcp", async (req: Request, res: Response) => {
  console.log("Received GET MCP request");
  res.writeHead(405).end(
    JSON.stringify({
      jsonrpc: "2.0",
      error: {
        code: -32000,
        message: "Method not allowed.",
      },
      id: null,
    })
  );
});

app.delete("/mcp", async (req: Request, res: Response) => {
  console.log("Received DELETE MCP request");
  res.writeHead(405).end(
    JSON.stringify({
      jsonrpc: "2.0",
      error: {
        code: -32000,
        message: "Method not allowed.",
      },
      id: null,
    })
  );
});

// Start the server
const PORT = process.env.PORT || 3000;
setupServer()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`MCP Streamable HTTP Server listening on port ${PORT}`);
    });
  })
  .catch((error) => {
    console.error("Failed to set up the server:", error);
    process.exit(1);
  });