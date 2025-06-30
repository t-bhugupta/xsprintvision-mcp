import { execSync } from "child_process";
import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import fs from "fs";
import path from "path";

export function registerGenerateWorkItemFieldSummaryTool(server: McpServer) {
  return server.tool(
    "generate-workitem-field-summary",
    "Generate a field summary for a specific work item by its ID from sprint_insights.json",
    {
      id: z.number().describe("The ID of the work item to fetch field summary for"),
    },
    async (params: { id: number }) => {
      try {
        execSync("python ./data/XsprintADO.py", { stdio: "inherit" });
      } catch (e) {
        return { content: [{ type: "text", text: "Failed to update data from Python script." }] };
      }
      // Always read the latest sprint_insights.json after running the Python script
      const sprintInsightsPath = path.resolve(process.cwd(), "data/sprint_insights.json");
      let sprintInsights: any[] = [];
      try {
        sprintInsights = JSON.parse(fs.readFileSync(sprintInsightsPath, "utf-8"));
      } catch (e) {
        return { content: [{ type: "text", text: "Could not load sprint_insights.json" }] };
      }
      const item = sprintInsights.find((wi) => wi.id === params.id && (wi.current_state || '').toLowerCase() !== 'removed');
      if (!item) {
        return {
          content: [
            {
              type: "text",
              text: `No work item found with ID ${params.id}.`,
            },
          ],
        };
      }
      return {
        content: [
          {
            type: "text",
            text: `Field summary for work item ID ${params.id}:`,
          },
          {
            type: "text",
            text: JSON.stringify(item, null, 2),
          },
        ],
      };
    }
  );
}
