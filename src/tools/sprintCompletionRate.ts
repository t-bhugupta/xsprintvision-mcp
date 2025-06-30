import { execSync } from "child_process";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export function registerSprintCompletionRateTool(server: McpServer) {
  return server.tool(
    "sprint-completion-rate",
    "Calculate Sprint completion rate: Completion Rate (%) = (Completed Work / Total Capacity) × 100. Total capacity is the sum of (number of working days * capacityPerDay for each user) minus the sum of (number of days off for each user * capacityPerDay).",
    async () => {
      try {
        execSync("python ./data/XsprintADO.py", { stdio: "inherit" });
      } catch (e) {
        return { content: [{ type: "text", text: "Failed to update data from Python script." }] };
      }
      // Always read the latest capacity and efforts data after running the Python script
      const capacityPath = path.resolve(process.cwd(), "data/capacity_structured.json");
      let capacityData: any = null;
      try {
        capacityData = JSON.parse(fs.readFileSync(capacityPath, "utf-8"));
      } catch (e) {
        return { content: [{ type: "text", text: "Could not load capacity_structured.json" }] };
      }
      const totalWorkingDays = capacityData.totalWorkingDays;
      const users = capacityData.users;
      // Only consider users with nonzero capacityPerDay
      const validUsers = users.filter((u: any) => u.capacityPerDay && u.capacityPerDay[0] && u.capacityPerDay[0].capacityPerDay > 0);
      // Calculate total capacity as sum((working days * capacityPerDay) - (daysOff * capacityPerDay)) for each user
      const totalCapacity = validUsers.reduce((sum: number, u: any) => {
        const capPerDay = u.capacityPerDay[0].capacityPerDay;
        const daysOff = u.numberOfDaysOff || 0;
        return sum + ((totalWorkingDays * capPerDay) - (daysOff * capPerDay));
      }, 0);
      // Always read the latest completed work from task_efforts.json after running the Python script
      const effortsPath = path.resolve(process.cwd(), "data/task_efforts.json");
      let effortsData: any[] = [];
      try {
        effortsData = JSON.parse(fs.readFileSync(effortsPath, "utf-8"));
      } catch (e) {
        return { content: [{ type: "text", text: "Could not load task_efforts.json" }] };
      }
      // Sum completed work for all tasks
      const completedWork = effortsData.reduce((sum, t) => sum + (t.completed_work || 0), 0);
      // Calculate completion rate
      const completionRate = totalCapacity > 0 ? (completedWork / totalCapacity) * 100 : 0;
      return {
        content: [
          { type: "text", text: `Sprint completion rate: ${completionRate.toFixed(2)}%` },
          { type: "text", text: `Completed work : ${completedWork}` },
          { type: "text", text: `Total capacity : ${totalCapacity}` },
        ]
      };
    }
  );
}
