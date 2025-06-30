import { execSync } from "child_process";
import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import fs from "fs";
import path from "path";

export function registerGetWorkItemsByStateTool(server: McpServer) {
  return server.tool(
    "get-workitems-by-state",
    "Get details of all work items in a particular current state (e.g., Active, Closed, etc.) from sprint_insights.json, excluding items with state 'removed', and separating by Feature, User Story, and Task.",
    {
      state: z.string().describe("The current state to filter work items by (case-insensitive, e.g., Active, Closed, etc.)"),
    },
    async (params: { state: string }) => {
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
      const state = (params.state || '').toLowerCase();
      // Exclude items with current_state 'removed'
      const filtered = sprintInsights.filter(item => (item.current_state || '').toLowerCase() !== 'removed');
      // Separate by type
      const features = filtered.filter(item => (item.type || '').toLowerCase() === 'feature' && (item.current_state || '').toLowerCase() === state);
      const userStories = filtered.filter(item => (item.type || '').toLowerCase() === 'user story' && (item.current_state || '').toLowerCase() === state);
      const tasks = filtered.filter(item => (item.type || '').toLowerCase() === 'task' && (item.current_state || '').toLowerCase() === state);

      return {
        content: [
          { type: "text", text: `Features (${features.length}):\n${features.map(i => `#${i.id}: ${i.title}`).join("\n") || 'None'}` },
          { type: "text", text: `User Stories (${userStories.length}):\n${userStories.map(i => `#${i.id}: ${i.title}`).join("\n") || 'None'}` },
          { type: "text", text: `Tasks (${tasks.length}):\n${tasks.map(i => `#${i.id}: ${i.title}`).join("\n") || 'None'}` },
        ],
      };
    }
  );
}
