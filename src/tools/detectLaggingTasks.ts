import { execSync } from "child_process";
import fs from 'fs';
import path from 'path';
import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

interface CapacityUser {
  name: string;
  capacityPerDay: { activity: string; capacityPerDay: number }[];
  numberOfDaysOff: number;
}

interface CapacityData {
  totalWorkingDays: number;
  users: CapacityUser[];
}

interface SprintTask {
  id: number;
  title: string;
  type: string;
  assigned_date?: string;
  created_by?: string;
  current_state?: string;
  remaining_work?: number;
  assigned_to?: string;
}

function getSprintEndDate(configPath: string): Date | null {
  try {
    const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    const iterationPath: string = config.iteration_path || '';
    // Extract the date range in parentheses, e.g., (Jun 15 - Jun 28)
    const match = iterationPath.match(/\(([^)]+)\)/);
    if (!match) return null;
    const range = match[1];
    // Extract the end date (e.g., Jun 28)
    const endMatch = range.match(/-\s*([A-Za-z]+\s+\d{1,2})/);
    if (!endMatch) return null;
    const endDateStr = endMatch[1] + ' ' + new Date().getFullYear();
    const endDate = new Date(endDateStr);
    return endDate;
  } catch {
    return null;
  }
}

function getDaysLeftInSprint(configPath: string): number {
  const endDate = getSprintEndDate(configPath);
  if (!endDate) return 0;
  const today = new Date();
  // Set time to 00:00:00 for accurate day diff
  endDate.setHours(0,0,0,0);
  today.setHours(0,0,0,0);
  let daysLeft = 0;
  let current = new Date(today);
  while (current <= endDate) {
    const day = current.getDay();
    if (day !== 0 && day !== 6) { // 0 = Sunday, 6 = Saturday
      daysLeft++;
    }
    current.setDate(current.getDate() + 1);
  }
  return daysLeft;
}

function detectLaggingTasks(
  capacityPath: string,
  sprintInsightsPath: string,
  laggingFactor: number = 1,
  configPath: string = path.join(__dirname, '../../data/config.json')
) {
  const capacityData: CapacityData = JSON.parse(fs.readFileSync(capacityPath, 'utf-8'));
  const sprintInsights: SprintTask[] = JSON.parse(fs.readFileSync(sprintInsightsPath, 'utf-8'));
  const daysLeft = getDaysLeftInSprint(configPath);

  // Build a map of user -> total capacity (sum of all activities * days left)
  const userCapacity: Record<string, number> = {};
  for (const user of capacityData.users) {
    const totalCapacityPerDay = user.capacityPerDay.reduce((sum, act) => sum + (act.capacityPerDay || 0), 0);
    const totalCapacity = totalCapacityPerDay * daysLeft;
    userCapacity[user.name] = totalCapacity;
  }

  // Build a map of user -> total remaining work (sum of all their tasks' remaining work)
  const userRemainingWork: Record<string, number> = {};
  const userTasks: Record<string, SprintTask[]> = {};
  for (const task of sprintInsights) {
    if (!task.assigned_to || typeof task.remaining_work !== 'number') continue;
    userRemainingWork[task.assigned_to] = (userRemainingWork[task.assigned_to] || 0) + task.remaining_work;
    if (!userTasks[task.assigned_to]) userTasks[task.assigned_to] = [];
    userTasks[task.assigned_to].push(task);
  }

  // Find users whose total remaining work >= capacity * laggingFactor
  const laggingUsers = Object.keys(userRemainingWork).filter(user => {
    const capacity = userCapacity[user] ?? 0;
    if (!capacity) return false;
    return userRemainingWork[user] >= capacity * laggingFactor;
  });

  // Prepare output: for each lagging user, show their total remaining work, capacity, and only list their tasks with remaining work > 0
  const laggingResults = laggingUsers.map(user => {
    const tasksWithWork = (userTasks[user] || []).filter(task => (task.remaining_work ?? 0) > 0);
    return {
      user,
      total_remaining_work: userRemainingWork[user],
      user_capacity: userCapacity[user],
      threshold: userCapacity[user] * laggingFactor,
      tasks: tasksWithWork,
    };
  });

  return laggingResults;
}

// CLI usage example
function run() {
  const capacityPath = path.resolve(process.cwd(), "data/capacity_structured.json");
  const sprintInsightsPath = path.resolve(process.cwd(), "data/sprint_insights.json");
  const laggingFactor = 1;
  const laggingTasks = detectLaggingTasks(capacityPath, sprintInsightsPath, laggingFactor);
  console.log('Lagging tasks:', JSON.stringify(laggingTasks, null, 2));
}

// Remove CommonJS entrypoint block for ES module compatibility

export { detectLaggingTasks };

export function registerDetectLaggingTasksTool(server: McpServer) {
  return server.tool(
    "detect-lagging-tasks",
    "Detect tasks where remaining work is greater than or equal to user capacity times lagging factor.",
    {
      laggingFactor: z.number().optional().describe("Lagging factor (default 1)")
    },
    async (params: { laggingFactor?: number }) => {
      try {
        execSync("python ./data/XsprintADO.py", { stdio: "inherit" });
      } catch (e) {
        return { content: [{ type: "text", text: "Failed to update data from Python script." }] };
      }
      const laggingFactor = params.laggingFactor ?? 1;
      const capacityPath = path.resolve(process.cwd(), "data/capacity_structured.json");
      const sprintInsightsPath = path.resolve(process.cwd(), "data/sprint_insights.json");
      // Always read the latest data after running the Python script
      const laggingTasks = detectLaggingTasks(capacityPath, sprintInsightsPath, laggingFactor);
      return {
        content: [
          {
            type: "text",
            text: `Found ${laggingTasks.length} lagging tasks (remaining work >= capacity * lagging factor):`
          },
          {
            type: "text",
            text: JSON.stringify(laggingTasks, null, 2)
          }
        ]
      };
    }
  );
}
