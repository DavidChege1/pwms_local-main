import requests
from typing import Any, Dict, List
from notifier.logger import log

_TIMEOUT = 5

def fetch_dispatch_history(api_base_url: str) -> List[Dict[str, Any]]:
    url = f"{api_base_url}/dispatch"
    try:
        resp = requests.get(url, timeout=_TIMEOUT)
        if resp.status_code == 200:
            data = resp.json()
            log.info("Fetched %d dispatch signals.", len(data))
            return data
        log.warning("Fetch returned status %d: %s", resp.status_code, resp.text)
    except requests.RequestException as exc:
        log.error("Failed to fetch dispatch history: %s", exc)
    return []

def update_dispatch_status(api_base_url: str, signal_id: int, status: str, comments: str = "") -> bool:
    url = f"{api_base_url}/dispatch/{signal_id}"
    payload = {"status": status, "comments": comments}
    try:
        resp = requests.patch(url, json=payload, timeout=_TIMEOUT)
        if resp.status_code == 200:
            log.info("Signal %d updated to %s.", signal_id, status)
            return True
        log.warning("Update signal %d failed (%d): %s", signal_id, resp.status_code, resp.text)
    except requests.RequestException as exc:
        log.error("Failed to update signal %d: %s", signal_id, exc)
    return False
