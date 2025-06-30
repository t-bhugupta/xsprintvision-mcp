import { execSync } from "child_process";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import fs from "fs";
import path from "path";

export function registerListSprintWorkItemsTool(server: McpServer) {
  return server.tool(
    "list-sprint-work-items",
    "List all work items in the sprint, grouped by Feature, User Story, and Task, including assigned user and current state. Excludes items with state 'removed'.",
    async () => {
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
      // Exclude items with current_state 'removed'
      const filteredItems = sprintInsights.filter(item => (item.current_state || '').toLowerCase() !== 'removed');
      const features = filteredItems.filter(item => (item.type || '').toLowerCase() === 'feature');
      const userStories = filteredItems.filter(item => (item.type || '').toLowerCase() === 'user story');
      const tasks = filteredItems.filter(item => (item.type || '').toLowerCase() === 'task');

      const formatList = (items: any[]) =>
        items.length > 0
          ? items.map(i => `#${i.id}: ${i.title} | Assigned to: ${i.assigned_to || 'Unassigned'} | State: ${i.current_state || 'Unknown'}`).join("\n")
          : "None";

      return {
        content: [
          { type: "text", text: `Features:\n${formatList(features)}` },
          { type: "text", text: `User Stories:\n${formatList(userStories)}` },
          { type: "text", text: `Tasks:\n${formatList(tasks)}` },
        ],
      };
    }
  );
}
