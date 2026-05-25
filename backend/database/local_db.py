import sqlite3
import os
import json

# Path to the SQLite database
DB_PATH = os.path.join("backend", "data", "persistence.db")
# Path to the legacy JSON file for migration
JSON_PLAN_FILE = os.path.join("backend", "data", "daily_plan.json")

def init_db():
    """
    Initializes the SQLite database and migrates data from JSON if necessary.
    """
    os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    
    # Create the daily_queue table
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS daily_queue (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            DocNum INTEGER,
            LpoNo TEXT,
            Customer TEXT,
            ProductCode TEXT,
            Description TEXT,
            Remaining_Qnty REAL,
            Priority INTEGER
        )
    """)
    
    # Create the dispatch_signals table
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS dispatch_signals (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            DocNum INTEGER,
            Customer TEXT,
            ProductCode TEXT,
            Description TEXT,
            Quantity REAL,
            TimeSent DATETIME DEFAULT CURRENT_TIMESTAMP,
            Status TEXT DEFAULT 'PENDING',
            Comments TEXT,
            Recipient TEXT DEFAULT 'dispatch'
        )
    """)
    
    # Create the dispatch_archive table (for historical logging)
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS dispatch_archive (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            DocNum INTEGER,
            Customer TEXT,
            ProductCode TEXT,
            Description TEXT,
            Quantity REAL,
            TimeSent DATETIME,
            Status TEXT,
            Comments TEXT,
            Recipient TEXT,
            ArchivedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
            ArchivedBy TEXT
        )
    """)
    conn.commit()
    
    # Check if the table is empty and migration is needed
    cursor.execute("SELECT COUNT(*) FROM daily_queue")
    count = cursor.fetchone()[0]
    
    if count == 0 and os.path.exists(JSON_PLAN_FILE):
        print(f"[INFO] Migrating legacy plan from {JSON_PLAN_FILE} to SQLite...")
        try:
            with open(JSON_PLAN_FILE, "r") as f:
                data = json.load(f)
                # Handle both {"queue": [...]} and raw list formats
                queue = data.get("queue", []) if isinstance(data, dict) else (data if isinstance(data, list) else [])
                
                for job in queue:
                    cursor.execute("""
                        INSERT INTO daily_queue (DocNum, LpoNo, Customer, ProductCode, Description, Remaining_Qnty, Priority)
                        VALUES (?, ?, ?, ?, ?, ?, ?)
                    """, (
                        job.get("DocNum"), 
                        job.get("LpoNo"), 
                        job.get("Customer"),
                        job.get("ProductCode"), 
                        job.get("Description"), 
                        job.get("Remaining_Qnty", 0.0), 
                        job.get("Priority", 0)
                    ))
            conn.commit()
            print("[INFO] Migration complete.")
            
            # HEALTH CHECK: Rename legacy file to avoid repeated migration attempts
            try:
                os.rename(JSON_PLAN_FILE, JSON_PLAN_FILE + ".migrated")
                print(f"[INFO] Legacy file renamed to {JSON_PLAN_FILE}.migrated")
            except Exception as e:
                print(f"[WARN] Failed to rename legacy file: {e}")
                
        except Exception as e:
            print(f"[ERROR] Migration failed: {e}")
            
    conn.close()

def get_daily_queue():
    """
    Retrieves the current production queue ordered by priority.
    """
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()
    try:
        cursor.execute("SELECT * FROM daily_queue ORDER BY Priority ASC")
        rows = cursor.fetchall()
        return [dict(row) for row in rows]
    finally:
        conn.close()

def save_daily_queue(jobs):
    """
    Overwrites the current production queue with a new list of jobs.
    """
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    try:
        cursor.execute("DELETE FROM daily_queue")
        for job in jobs:
            cursor.execute("""
                INSERT INTO daily_queue (DocNum, LpoNo, Customer, ProductCode, Description, Remaining_Qnty, Priority)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            """, (
                job.get("DocNum"), 
                job.get("LpoNo"), 
                job.get("Customer"),
                job.get("ProductCode"), 
                job.get("Description"), 
                job.get("Remaining_Qnty", 0.0), 
                job.get("Priority", 0)
            ))
        conn.commit()
    finally:
        conn.close()

# ─────────────────────────────────────────────────────────────────────────────
# DISPATCH SIGNALS
# ─────────────────────────────────────────────────────────────────────────────

def get_dispatch_signals(limit=50):
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()
    try:
        cursor.execute("SELECT * FROM dispatch_signals ORDER BY TimeSent DESC LIMIT ?", (limit,))
        rows = cursor.fetchall()
        signals = []
        for row in rows:
            sig = dict(row)
            # Ensure timestamp is ISO8601 UTC for the frontend (EAT Nairobi conversion)
            if sig.get('TimeSent') and 'Z' not in sig['TimeSent']:
                sig['TimeSent'] = sig['TimeSent'].replace(' ', 'T') + 'Z'
            signals.append(sig)
        return signals
    finally:
        conn.close()

def save_dispatch_signal(data):
    """Saves a signal but checks for existing PENDING duplicates first."""
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    try:
        # Check for existing PENDING signal for the same DocNum and ProductCode
        cursor.execute("SELECT id FROM dispatch_signals WHERE DocNum = ? AND ProductCode = ? AND Status = 'PENDING'", 
                       (data.get("DocNum"), data.get("ProductCode")))
        if cursor.fetchone():
            return None # Indicate duplicate
            
        cursor.execute("""
            INSERT INTO dispatch_signals (DocNum, Customer, ProductCode, Description, Quantity, Recipient)
            VALUES (?, ?, ?, ?, ?, ?)
        """, (
            data.get("DocNum"),
            data.get("Customer"),
            data.get("ProductCode"),
            data.get("Description"),
            data.get("Quantity"),
            data.get("Recipient", "dispatch")
        ))
        signal_id = cursor.lastrowid
        conn.commit()
        return signal_id
    finally:
        conn.close()

def update_dispatch_status(signal_id, status, comments):
    """Updates status ONLY if it is currently PENDING to avoid race conditions."""
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    try:
        cursor.execute("""
            UPDATE dispatch_signals 
            SET Status = ?, Comments = ?
            WHERE id = ? AND Status = 'PENDING'
        """, (status, comments, signal_id))
        rows_affected = cursor.rowcount
        conn.commit()
        return rows_affected > 0 # Returns True if successfully updated
    finally:
        conn.close()

def archive_all_dispatches(user_name="System"):
    """
    Moves all signals from dispatch_signals to dispatch_archive and clears the active list.
    """
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    try:
        # Copy to archive
        cursor.execute("""
            INSERT INTO dispatch_archive (DocNum, Customer, ProductCode, Description, Quantity, TimeSent, Status, Comments, Recipient, ArchivedBy)
            SELECT DocNum, Customer, ProductCode, Description, Quantity, TimeSent, Status, Comments, Recipient, ?
            FROM dispatch_signals
        """, (user_name,))
        
        # Delete from active
        cursor.execute("DELETE FROM dispatch_signals")
        conn.commit()
        return True
    except Exception as e:
        print(f"Error archiving dispatches: {e}")
        return False
    finally:
        conn.close()

def auto_archive_old_dispatches(days=3):
    """
    Moves any dispatch signals older than X days into the archive.
    """
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    try:
        # Move old records
        cursor.execute(f"""
            INSERT INTO dispatch_archive (
                DocNum, Customer, ProductCode, Description, Quantity, 
                TimeSent, Status, Comments, Recipient, ArchivedBy
            )
            SELECT 
                DocNum, Customer, ProductCode, Description, Quantity, 
                TimeSent, Status, Comments, Recipient, 'System (Auto)'
            FROM dispatch_signals
            WHERE datetime(TimeSent) <= datetime('now', '-{days} days')
        """)
        
        # Delete moved records
        cursor.execute(f"""
            DELETE FROM dispatch_signals
            WHERE datetime(TimeSent) <= datetime('now', '-{days} days')
        """)
        
        conn.commit()
        return True
    except Exception as e:
        print(f"Error in auto-archive: {e}")
        return False
    finally:
        conn.close()

# Initialize on import
init_db()
