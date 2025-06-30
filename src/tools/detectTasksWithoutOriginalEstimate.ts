import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import fs from "fs";
import path from "path";
import { execSync } from "child_process";

export function registerDetectTasksWithoutOriginalEstimateTool(server: McpServer) {
  return server.tool(
    "detect-tasks-without-original-estimate",
    "Detect tasks that do not have any original estimate (null, undefined, or 0).",
    async () => {
      // Always update data before reading
      try {
        execSync("python ./data/XsprintADO.py", { stdio: "inherit" });
      } catch (e) {
        return { content: [{ type: "text", text: "Failed to update data from Python script." }] };
      }
      // Read from sprint_insights.json to get type info
      const sprintInsightsPath = path.resolve(process.cwd(), "data/sprint_insights.json");
      let sprintInsights: any[] = [];
      try {
        sprintInsights = JSON.parse(fs.readFileSync(sprintInsightsPath, "utf-8"));
      } catch (e) {
        return { content: [{ type: "text", text: "Could not load sprint_insights.json" }] };
      }
      // Read from task_efforts.json to get estimate info
      const effortsPath = path.resolve(process.cwd(), "data/task_efforts.json");
      let effortsData: any[] = [];
      try {
        effortsData = JSON.parse(fs.readFileSync(effortsPath, "utf-8"));
      } catch (e) {
        return { content: [{ type: "text", text: "Could not load task_efforts.json" }] };
      }
      // Build a map of id -> type from sprint_insights
      const typeMap = new Map<number, string>();
      for (const item of sprintInsights) {
        typeMap.set(item.id, (item.type || '').toLowerCase());
      }
      // Find tasks with no original estimate (null, undefined, or 0)
      const tasksWithoutEstimate = effortsData.filter(
        t => (typeMap.get(t.id) === 'task') && (t.original_estimate === null || t.original_estimate === undefined || t.original_estimate === 0)
      );
      return {
        content: [
          {
            type: "text",
            text:
              tasksWithoutEstimate.length > 0
                ? `Tasks without original estimate:\n` +
                  tasksWithoutEstimate.map(
                    t => `Task #${t.id}: ${t.title} (Assigned to: ${t.assigned_to || 'Unassigned'})`
                  ).join("\n")
                : "All tasks have an original estimate."
          }
        ]
      };
    }
  );
}
