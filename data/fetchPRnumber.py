import requests
from requests.auth import HTTPBasicAuth
import os
import json

def get_pull_requests_for_work_item(config, work_item_id):
    """
    Fetches pull requests linked to a specific work item (task or user story) from Azure DevOps.
    Args:
        config (dict): Azure DevOps configuration.
        work_item_id (int or str): The ID of the work item.
    Returns:
        list: List of pull request details linked to the work item.
    """
    organization = config["organization"]
    project = config["project"]
    personal_access_token = config["personal_access_token"]
    api_version = config.get("api_version", "7.1-preview.1")
    auth = HTTPBasicAuth('', personal_access_token)
    headers = {"Content-Type": "application/json"}

    # 1. Get work item relations (to find PR links)
    url = f"https://dev.azure.com/{organization}/{project}/_apis/wit/workitems/{work_item_id}?$expand=relations&api-version={api_version}"
    response = requests.get(url, auth=auth, headers=headers)
    response.raise_for_status()
    work_item = response.json()
    pr_links = []
    for rel in work_item.get("relations", []):
        if rel.get("rel", "").endswith("ArtifactLink") and "PullRequestId" in rel.get("url", ""):
            pr_links.append(rel["url"])

    # 2. Fetch PR details for each PR link
    pr_details = []
    for pr_url in pr_links:
        # The PR URL is in the format: vstfs:///Git/PullRequestId/{projectId}%2F{repoId}%2F{prId}
        # Extract PR ID and repo ID
        try:
            artifact_id = pr_url.split("/PullRequestId/")[-1]
            parts = artifact_id.split("%2F")
            if len(parts) == 3:
                project_id, repo_id, pr_id = parts
                # Get PR details
                pr_api_url = f"https://dev.azure.com/{organization}/{project}/_apis/git/repositories/{repo_id}/pullrequests/{pr_id}?api-version={api_version}"
                pr_resp = requests.get(pr_api_url, auth=auth, headers=headers)
                if pr_resp.status_code == 200:
                    pr_details.append(pr_resp.json())
        except Exception as e:
            print(f"[ERROR] Could not parse PR link: {pr_url} ({e})")
    return pr_details

def write_prs_to_structured_json(config, insights_path=None, output_path=None):
    """
    Writes structured pull request data for closed work items to a JSON file.
    Args:
        config (dict): Azure DevOps configuration.
        insights_path (str, optional): Path to the insights JSON file. Defaults to sprint_insights.json in the current directory.
        output_path (str, optional): Path to the output JSON file. Defaults to pr_structured.json in the current directory.
    """
    if insights_path is None:
        insights_path = os.path.join(os.path.dirname(__file__), "sprint_insights.json")
    if output_path is None:
        output_path = os.path.join(os.path.dirname(__file__), "pr_structured.json")
    with open(insights_path, "r", encoding="utf-8") as f:
        insights = json.load(f)
    pr_structured = []
    for item in insights:
        # Remove the closed state check, include all work items
        prs = get_pull_requests_for_work_item(config, item["id"])
        pr_structured.append({
            "id": item["id"],
            "title": item.get("title", ""),
            "type": item.get("type", ""),
            "pull_requests": prs
        })
    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(pr_structured, f, indent=2)
    print(f"[INFO] Structured PR data written to {output_path}")

# Ensure this function is always available for import
__all__ = ["get_pull_requests_for_work_item", "write_prs_to_structured_json"]

if __name__ == "__main__":
    config_path = os.path.join(os.path.dirname(__file__), "config.json")
    with open(config_path, "r", encoding="utf-8") as f:
        config = json.load(f)
    write_prs_to_structured_json(config)
