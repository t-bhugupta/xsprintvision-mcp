import os
import json
import requests

def fetch_efforts_from_ado(config):
    personal_access_token = config["personal_access_token"]
    organization = config["organization"]
    project = config["project"]
    api_version = config.get("api_version", "7.1-preview")
    auth = ("", personal_access_token)
    headers = {"Content-Type": "application/json"}
    
    # Query for all tasks in the iteration/area
    wiql = {
        "query": (
            f"SELECT [System.Id] FROM WorkItems "
            f"WHERE [System.WorkItemType] = 'Task' "
            f"AND [System.AreaPath] = '{config['area_path']}' "
            f"AND [System.IterationPath] = '{config['iteration_path']}'"
        )
    }
    wiql_url = f"https://dev.azure.com/{organization}/{project}/_apis/wit/wiql?api-version={api_version}"
    resp = requests.post(wiql_url, headers=headers, auth=auth, json=wiql)
    resp.raise_for_status()
    work_item_ids = [item['id'] for item in resp.json().get('workItems', [])]
    
    # Fetch details in batches
    all_efforts = []
    for i in range(0, len(work_item_ids), 200):
        batch = work_item_ids[i:i+200]
        ids_str = ','.join(map(str, batch))
        url = f"https://dev.azure.com/{organization}/{project}/_apis/wit/workitems?ids={ids_str}&fields=System.Id,System.Title,Microsoft.VSTS.Scheduling.OriginalEstimate,Microsoft.VSTS.Scheduling.RemainingWork,Microsoft.VSTS.Scheduling.CompletedWork,System.State,System.AssignedTo&api-version={api_version}"
        details_resp = requests.get(url, headers=headers, auth=auth)
        details_resp.raise_for_status()
        for item in details_resp.json().get('value', []):
            fields = item.get('fields', {})
            # Exclude tasks with current state 'Removed'
            if str(fields.get('System.State', '')).lower() == 'removed':
                continue
            assigned_to = None
            assigned_field = fields.get('System.AssignedTo')
            if isinstance(assigned_field, dict):
                assigned_to = assigned_field.get('displayName')
            elif isinstance(assigned_field, str):
                assigned_to = assigned_field
            all_efforts.append({
                'id': item.get('id'),
                'title': fields.get('System.Title'),
                'original_estimate': fields.get('Microsoft.VSTS.Scheduling.OriginalEstimate'),
                'remaining_work': fields.get('Microsoft.VSTS.Scheduling.RemainingWork'),
                'completed_work': fields.get('Microsoft.VSTS.Scheduling.CompletedWork'),
                'state': fields.get('System.State'),
                'assigned_to': assigned_to,
            })
    # Save to file
    with open(os.path.join(os.path.dirname(__file__), 'task_efforts.json'), 'w') as f:
        json.dump(all_efforts, f, indent=2)
    print(f"Saved {len(all_efforts)} tasks to task_efforts.json")

if __name__ == "__main__":
    # If run directly, load config and fetch efforts
    config_path = os.path.join(os.path.dirname(__file__), "config.json")
    with open(config_path, "r", encoding="utf-8") as f:
        config = json.load(f)
    fetch_efforts_from_ado(config)
