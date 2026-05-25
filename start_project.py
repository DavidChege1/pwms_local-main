import subprocess
import os
import signal
import sys
import time
import threading

def cleanup_ports():
    """Kills any processes listening on ports 9091 or 9092."""
    print("[INFO] Cleaning up ports 9091 and 9092...")
    if sys.platform == "win32":
        # Windows: Find PIDs using netstat and kill them
        try:
            # Check 9091 and 9092
            for port in [9091, 9092]:
                output = subprocess.check_output(f"netstat -ano | findstr LISTENING | findstr :{port}", shell=True, text=True)
                for line in output.strip().split('\n'):
                    pid = line.strip().split()[-1]
                    if pid != '0':
                        subprocess.run(f"taskkill /F /PID {pid}", shell=True, capture_output=True)
                        print(f"[CLEANUP] Killed process {pid} on port {port}")
        except subprocess.CalledProcessError:
            pass # No processes found on these ports
    else:
        # Linux/Mac: use lsof
        subprocess.run("fuser -k 9091/tcp 9092/tcp", shell=True, capture_output=True)

def stream_output(process, prefix):
    """Callback to stream process output to console."""
    for line in iter(process.stdout.readline, ''):
        if line:
            print(f"[{prefix}] {line.strip()}")
    process.stdout.close()

def start_processes():
    cleanup_ports()
    print("[INFO] Starting PWMS Project...")
    
    # 1. Start Backend (FastAPI) as a module
    print("[BACKEND] Starting on port 9092...")
    # Using sys.executable to ensure we use the same Python environment that ran this script
    backend_process = subprocess.Popen(
        [sys.executable, "-m", "backend.main"],
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
        bufsize=1,
        universal_newlines=True,
        env={**os.environ, "PYTHONPATH": os.getcwd()}
    )

    # 2. Start Frontend (Vite)
    print("[FRONTEND] Starting Frontend (Vite)...")
    # Vite usually runs on Node/NPM. Shell=True is often needed on Windows for .cmd files like npm.
    frontend_process = subprocess.Popen(
        ["npm", "run", "dev", "--", "--host"],
        cwd="frontend",
        shell=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
        bufsize=1,
        universal_newlines=True
    )

    # Start threads to stream output so the user can see errors
    threading.Thread(target=stream_output, args=(backend_process, "BACKEND"), daemon=True).start()
    threading.Thread(target=stream_output, args=(frontend_process, "FRONTEND"), daemon=True).start()

    def signal_handler(sig, frame):
        print("\n[STOP] Stopping PWMS Project...")
        backend_process.terminate()
        frontend_process.terminate()
        sys.exit(0)

    signal.signal(signal.SIGINT, signal_handler)

    print("\n[SUCCESS] Both processes are launching!")
    print("Backend: http://0.0.0.0:9092")
    print("Frontend: http://0.0.0.0:9091\n")
    print("Wait a few seconds for servers to ready up. Press Ctrl+C to stop everything.\n")

    # Monitor processes
    try:
        while True:
            if backend_process.poll() is not None:
                print("\n[ERROR] Backend process stopped unexpectedly.")
                break
            if frontend_process.poll() is not None:
                print("\n[ERROR] Frontend process stopped unexpectedly.")
                break
            time.sleep(1)
    except KeyboardInterrupt:
        pass
    finally:
        signal_handler(None, None)

if __name__ == "__main__":
    start_processes()
