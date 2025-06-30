import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import fs from "fs";
import path from "path";
import { execSync } from "child_process";

export function registerFlagOpenChildrenOfClosedParentTool(server: McpServer) {
  return server.tool(
    "flag-open-children-of-closed-parent",
    "Detect child items whose parent item is closed and child is not closed (using parents_link_added array).",
    async () => {
      // Always update data before reading
      try {
        execSync("python ./data/XsprintADO.py", { stdio: "inherit" });
      } catch (e) {
        return { content: [{ type: "text", text: "Failed to update data from Python script." }] };
      }
      const sprintInsightsPath = path.resolve(process.cwd(), "data/sprint_insights.json");
      let sprintInsights: any[] = [];
      try {
        sprintInsights = JSON.parse(fs.readFileSync(sprintInsightsPath, "utf-8"));
      } catch (e) {
        return { content: [{ type: "text", text: "Could not load sprint_insights.json" }] };
      }
      // Build a map of id -> item for quick lookup
      const itemMap = new Map<number, any>();
      for (const item of sprintInsights) {
        itemMap.set(item.id, item);
      }
      // Find child items whose parent is closed and child is not closed (using parents_link_added)
      const flaggedChildren = [];
      for (const item of sprintInsights) {
        if (item.parents_link_added && Array.isArray(item.parents_link_added)) {
          for (const parentIdStr of item.parents_link_added) {
            const parentId = Number(parentIdStr);
            if (itemMap.has(parentId)) {
              const parent = itemMap.get(parentId);
              if (
                (parent.current_state || "").toLowerCase() === "closed" &&
                (item.current_state || "").toLowerCase() !== "closed"
              ) {
                flaggedChildren.push({
                  child_id: item.id,
                  child_title: item.title,
                  child_state: item.current_state,
                  parent_id: parent.id,
                  parent_title: parent.title,
                  parent_state: parent.current_state,
                });
              }
            }
          }
        }
      }
      return {
        content: [
          {
            type: "text",
            text:
              flaggedChildren.length > 0
                ? `Child items whose parent is closed and child is not closed:\n` +
                  flaggedChildren.map(
                    c =>
                      `Child #${c.child_id} (${c.child_title}) [${c.child_state}] - Parent #${c.parent_id} (${c.parent_title}) [${c.parent_state}]`
                  ).join("\n")
                : "No open child items found with closed parent."
          }
        ]
      };
    }
  );
}
