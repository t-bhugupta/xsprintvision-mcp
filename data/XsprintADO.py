import os
import json
import requests
from requests.auth import HTTPBasicAuth
from datetime import datetime, timedelta
from fetchCapacity import write_capacity_to_structured_json # type: ignore
from fetchPRnumber import get_pull_requests_for_work_item
import importlib.util

# -------------------- Configuration --------------------
config_path = os.path.join(os.path.dirname(__file__), "config.json")
with open(config_path, "r", encoding="utf-8") as f:
    config = json.load(f)

personal_access_token = config["personal_access_token"]
organization = config["organization"]
project = config["project"]
api_version = config["api_version"]
iteration_path = config["iteration_path"]
area_path = config["area_path"]
team = config.get("team")

auth = HTTPBasicAuth('', personal_access_token)
headers = {"Content-Type": "application/json"}

# Import and run fetch_efforts_from_ado from fetchEfforts.py
spec = importlib.util.spec_from_file_location("fetchEfforts", os.path.join(os.path.dirname(__file__), "fetchEfforts.py"))
fetchEfforts = importlib.util.module_from_spec(spec)
spec.loader.exec_module(fetchEfforts)
fetchEfforts.fetch_efforts_from_ado(config)

# -------------------- Work Item Queries --------------------
def get_area_and_iteration_work_items(area_path, iteration_path):
    url = f"https://dev.azure.com/{organization}/{project}/_apis/wit/wiql?api-version={api_version}"
    query = {
        "query": (
            f"SELECT [System.Id] FROM WorkItems "
            f"WHERE [System.AreaPath] = '{area_path}' "
            f"AND [System.IterationPath] = '{iteration_path}'"
        )
    }
    response = requests.post(url, json=query, auth=auth, headers=headers)
    if response.status_code != 200:
        print(f"[ERROR] Response status: {response.status_code}")
        print(f"[ERROR] Response content: {response.text}")
    response.raise_for_status()
    return [item["id"] for item in response.json().get("workItems", [])]

def get_work_item_details(work_item_id):
    url = f"https://dev.azure.com/{organization}/{project}/_apis/wit/workitems/{work_item_id}?api-version=7.1"
    response = requests.get(url, auth=auth, headers=headers)
    response.raise_for_status()
    return response.json()

def get_work_item_changes(work_item_id):
    url = f"https://dev.azure.com/{organization}/{project}/_apis/wit/workItems/{work_item_id}/updates?api-version={api_version}"
    response = requests.get(url, auth=auth, headers=headers)
    response.raise_for_status()
    return response.json()

# -------------------- Work Item History Parsing --------------------
def parse_changes(change_data):
    changes = []
    child_links = []
    parent_link = None
    comments = []
    resolved_date = None

    for change in change_data.get("value", []):
        revised_by = change.get("revisedBy", {}).get("displayName", "Unknown")
        revised_date = change.get("revisedDate", "Unknown")
        change_details = {
            "revisedBy": revised_by,
            "revisedDate": revised_date,
            "fields": []
        }
        for field, diff in change.get("fields", {}).items():
            old_value = diff.get("oldValue")
            new_value = diff.get("newValue")
            if field == "System.History" and new_value:
                comments.append((revised_date, revised_by, new_value))
            if field == "System.State" and new_value == "Resolved":
                resolved_date = revised_date
            change_details["fields"].append({
                "field": field,
                "oldValue": old_value,
                "newValue": new_value
            })
        relations_diff = change.get("relations", {})
        for rel in relations_diff.get("added", []):
            if rel.get("rel") == "System.LinkTypes.Hierarchy-Forward":
                child_links.append(int(rel.get("url", "").split("/")[-1]))
            if rel.get("rel") == "System.LinkTypes.Hierarchy-Reverse":
                parent_link = int(rel.get("url", "").split("/")[-1])
            change_details["fields"].append({
                "field": "Relation Added",
                "relType": rel.get("rel", "Unknown"),
                "url": rel.get("url", "")
            })
        if change_details["fields"]:
            changes.append(change_details)
    return changes, child_links, parent_link, comments, resolved_date

# -------------------- Main Execution --------------------
def process_sprint_insights():
    print(f"[DEBUG] Querying work items in iteration: {iteration_path}")
    work_item_ids = get_area_and_iteration_work_items(area_path, iteration_path)
    if not work_item_ids:
        print("No work items found for this iteration path.")
        return
    sprint_insights = []
    for work_item_id in work_item_ids:
        try:
            metadata = get_work_item_details(work_item_id)
            fields = metadata.get("fields", {})
            raw_changes = get_work_item_changes(work_item_id)
            parsed_history, child_links, parent_link, comments, resolved_date = parse_changes(raw_changes)
            title = fields.get("System.Title", "N/A")
            work_type = fields.get("System.WorkItemType", "N/A")
            current_state = fields.get("System.State", "N/A")
            area = fields.get("System.AreaPath", "N/A")
            iteration = fields.get("System.IterationPath", "N/A")
            priority = fields.get("Microsoft.VSTS.Common.Priority", "N/A")
            target_date = fields.get("Microsoft.VSTS.Scheduling.TargetDate", "N/A")
            created_date = fields.get("System.CreatedDate", "N/A")
            created_by = fields.get("System.CreatedBy", {}).get("displayName", "Unknown")
            description = fields.get("System.Description", "")
            stack_rank = fields.get("Microsoft.VSTS.Common.StackRank", "N/A")
            original_estimate = fields.get("Microsoft.VSTS.Scheduling.OriginalEstimate", 0)
            remaining_work = fields.get("Microsoft.VSTS.Scheduling.RemainingWork", 0)
            completed_work = fields.get("Microsoft.VSTS.Scheduling.CompletedWork", 0)
            effort_time = (completed_work or 0) + (remaining_work or 0)
            tags = fields.get("System.Tags", "")
            assigned_date = None
            for change in parsed_history:
                for field in change["fields"]:
                    if field["field"] == "System.AssignedTo" and field["newValue"]:
                        assigned_date = change["revisedDate"]
                        break
                if assigned_date:
                    break
            parents_added = []
            children_added = []
            tags_added = set()
            state_changes = []
            prev_state = None
            for change in parsed_history:
                for field in change["fields"]:
                    if field["field"] == "Relation Added":
                        rel_type = field.get("relType", "")
                        work_id = field.get("url", "").split("/")[-1]
                        if "Forward" in rel_type:
                            children_added.append(work_id)
                        elif "Reverse" in rel_type:
                            parents_added.append(work_id)
                    if field["field"] == "System.Tags" and field["newValue"]:
                        for tag in str(field["newValue"]).split(";"):
                            tags_added.add(tag.strip())
                    if field["field"] == "System.State":
                        if prev_state is not None:
                            state_changes.append({
                                "from": prev_state,
                                "to": field["newValue"],
                                "date": change["revisedDate"]
                            })
                        prev_state = field["newValue"]
            assigned_to = fields.get("System.AssignedTo", {})
            assigned_to_display = assigned_to.get("displayName") if isinstance(assigned_to, dict) else assigned_to or "Unassigned"
            insight = {
                "id": work_item_id,
                "title": title,
                "type": work_type,
                "current_state": current_state,
                "priority": priority,
                "target_date": target_date,
                "created_date": created_date,
                "created_by": created_by,
                "description": description,
                "assigned_to": assigned_to_display,
                "assigned_date": assigned_date,
                "original_estimate": original_estimate,
                "remaining_work": remaining_work,
                "effort_time": effort_time,
                "parents_link_added": parents_added,
                "child_links_added": children_added,
                "tags_added": list(tags_added) if tags_added else tags.split(';') if tags else [],
                "comments_added": [
                    {"date": date, "author": author, "comment": comment}
                    for date, author, comment in comments
                ],
                "state_changes": state_changes
            }
            sprint_insights.append(insight)
        except Exception as e:
            print(f"[ERROR] Could not process work item {work_item_id}: {e}")
    # After sprint_insights is built, add PR info for closed work items
    def add_pull_requests_to_closed_items(sprint_insights, config):
        for item in sprint_insights:
            if str(item.get("current_state", "")).lower() == "closed":
                pr_list = get_pull_requests_for_work_item(config, item["id"])
                item["pull_requests"] = pr_list

    add_pull_requests_to_closed_items(sprint_insights, config)
    output_path = os.path.join(os.path.dirname(__file__), "sprint_insights.json")
    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(sprint_insights, f, indent=2)
    print(f"[INFO] Sprint insights written to {output_path}")
    print(f"[INFO] Total work items processed for area '{area_path}' and iteration '{iteration_path}': {len(work_item_ids)}")

# -------------------- Team Capacity --------------------
# Team capacity logic is now handled by capacity_utils.py
# If you need to write structured capacity data, just call:
# write_capacity_to_structured_json(config)
if __name__ == "__main__":
    process_sprint_insights()
    write_capacity_to_structured_json(config)

    print("[INFO] Processing complete.")