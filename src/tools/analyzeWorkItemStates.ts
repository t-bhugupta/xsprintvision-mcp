import { execSync } from "child_process";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import fs from "fs";
import path from "path";

export function registerAnalyzeWorkItemStatesTool(server: McpServer) {
  return server.tool(
    "analyze-workitem-states",
    "Analyze sprint insights and return the count of work items by state (New, Committed, Active, Closed, Other) for Features, User Stories, and Tasks separately, ignoring removed items.",
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
      // Ignore items with current_state 'removed'
      const filtered = sprintInsights.filter(item => (item.current_state || '').toLowerCase() !== 'removed');
      // Separate features, user stories, and tasks
      const features = filtered.filter(item => (item.type || '').toLowerCase() === 'feature');
      const userStories = filtered.filter(item => (item.type || '').toLowerCase() === 'user story');
      const tasks = filtered.filter(item => (item.type || '').toLowerCase() === 'task');

      const getStateCounts = (items: any[]) => {
        const stateCounts = {
          New: 0,
          Committed: 0,
          Active: 0,
          Closed: 0,
          Other: 0,
        };
        for (const item of items) {
          const state = (item.current_state || "").toLowerCase();
          if (state === "new") stateCounts.New++;
          else if (state === "committed") stateCounts.Committed++;
          else if (state === "active") stateCounts.Active++;
          else if (state === "closed") stateCounts.Closed++;
          else stateCounts.Other++;
        }
        return stateCounts;
      };

      const featureCounts = getStateCounts(features);
      const userStoryCounts = getStateCounts(userStories);
      const taskCounts = getStateCounts(tasks);

      return {
        content: [
          { type: "text", text: `Work item state counts (Features):\nNew: ${featureCounts.New}\nCommitted: ${featureCounts.Committed}\nActive: ${featureCounts.Active}\nClosed: ${featureCounts.Closed}\nOther: ${featureCounts.Other}` },
          { type: "text", text: `Work item state counts (User Stories):\nNew: ${userStoryCounts.New}\nCommitted: ${userStoryCounts.Committed}\nActive: ${userStoryCounts.Active}\nClosed: ${userStoryCounts.Closed}\nOther: ${userStoryCounts.Other}` },
          { type: "text", text: `Work item state counts (Tasks):\nNew: ${taskCounts.New}\nCommitted: ${taskCounts.Committed}\nActive: ${taskCounts.Active}\nClosed: ${taskCounts.Closed}\nOther: ${taskCounts.Other}` },
        ],
      };
    }
  );
}

// If you ever need to read data files, use:
// const dataPath = path.resolve(process.cwd(), "data/yourfile.json");
