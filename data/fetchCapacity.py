import requests
from requests.auth import HTTPBasicAuth
import json
from datetime import datetime, timedelta
import os

def get_iteration_id_and_dates(organization, project, team, api_version, auth, headers, iteration_path):
    url = f"https://dev.azure.com/{organization}/{project}/{team}/_apis/work/teamsettings/iterations?api-version={api_version}"
    response = requests.get(url, auth=auth, headers=headers)
    response.raise_for_status()
    iterations = response.json().get("value", [])
    for it in iterations:
        if it.get("path") == iteration_path:
            return it.get("id"), it.get("attributes", {}).get("startDate"), it.get("attributes", {}).get("finishDate")
    return None, None, None

def write_capacity_to_structured_json(config):
    personal_access_token = config["personal_access_token"]
    organization = config["organization"]
    project = config["project"]
    api_version = config["api_version"]
    iteration_path = config["iteration_path"]
    team = config["team"]
    auth = HTTPBasicAuth('', personal_access_token)
    headers = {"Content-Type": "application/json"}

    iteration_id, iteration_start, iteration_end = get_iteration_id_and_dates(
        organization, project, team, api_version, auth, headers, iteration_path)
    if not iteration_id:
        return

    # Calculate total working days (excluding weekends)
    total_working_days = 0
    if iteration_start and iteration_end:
        start = datetime.strptime(iteration_start[:10], "%Y-%m-%d")
        end = datetime.strptime(iteration_end[:10], "%Y-%m-%d")
        delta = end - start
        for i in range(delta.days + 1):
            day = start + timedelta(days=i)
            if day.weekday() < 5:  # Monday=0, Sunday=6
                total_working_days += 1

    # Get capacities for this iteration (force API version 7.0)
    cap_url = f"https://dev.azure.com/{organization}/{project}/{team}/_apis/work/teamsettings/iterations/{iteration_id}/capacities?api-version=7.0"
    cap_response = requests.get(cap_url, auth=auth, headers=headers)
    cap_response.raise_for_status()
    capacities = cap_response.json().get("teamMembers", [])
    structured = []
    for cap in capacities:
        user = cap.get("teamMember", {}).get("displayName", "Unknown")
        activities = cap.get("activities", [])
        days_off = cap.get("daysOff", [])
        num_days_off = 0
        for d in days_off:
            start = datetime.strptime(d["start"][:10], "%Y-%m-%d")
            end = datetime.strptime(d["end"][:10], "%Y-%m-%d")
            for i in range((end - start).days + 1):
                day = start + timedelta(days=i)
                if day.weekday() < 5:
                    num_days_off += 1
        structured.append({
            "name": user,
            "capacityPerDay": [
                {"activity": act.get("name"), "capacityPerDay": act.get("capacityPerDay")} for act in activities
            ],
            "numberOfDaysOff": num_days_off
        })
    output = {
        "totalWorkingDays": total_working_days,
        "users": structured
    }
    output_path = os.path.join(os.path.dirname(__file__), "capacity_structured.json")
    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(output, f, indent=2)
    print(f"[INFO] Structured capacity data written to {output_path}")
    print(f"[INFO] Total working days in iteration: {total_working_days}")
