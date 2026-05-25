import sys
import os
# Add current directory to path so we can import backend
sys.path.append(os.getcwd())

from backend.main import app

for route in app.routes:
    print(f"Path: {route.path}, Name: {route.name}, Methods: {getattr(route, 'methods', 'WS')}")
