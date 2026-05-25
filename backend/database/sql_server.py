import os
import pyodbc
from sqlalchemy import create_engine
from dotenv import load_dotenv

load_dotenv()

SQL_SERVER = os.getenv('SQL_SERVER', '127.0.0.1')
SQL_DATABASE = os.getenv('SQL_DATABASE', 'MOCK_DB')
SQL_USER = os.getenv('SQL_USER', 'demo_user')
SQL_PWD = os.getenv('SQL_PWD', 'demo_password')
SQL_DRIVER = os.getenv('SQL_DRIVER', 'ODBC Driver 17 for SQL Server') # Removed {} for SQLAlchemy compatibility

MOCK_DATABASE = os.getenv('MOCK_DATABASE', 'True').lower() in ('true', '1', 'yes')

# Cache of SQLAlchemy engines keyed by database name
_engines = {}

def get_engine(database: str):
    if database not in _engines:
        # Use a custom creator to guarantee it connects exactly like it did before
        # but with SQLAlchemy managing the connection pool.
        _engines[database] = create_engine(
            "mssql+pyodbc://",
            creator=lambda: pyodbc.connect(f'DRIVER={SQL_DRIVER};SERVER={SQL_SERVER};DATABASE={database};UID={SQL_USER};PWD={SQL_PWD}'),
            pool_size=10,        # Keep 10 connections warm
            max_overflow=20,     # Allow up to 20 additional bursts
            pool_timeout=30,     # Wait up to 30s before giving up
            pool_recycle=3600    # Recycle connections every hour to prevent staleness
        )
    return _engines[database]

def get_sql_conn(database=None):
    """
    Returns a raw DBAPI connection from the SQLAlchemy connection pool.
    This maintains compatibility with existing raw pyodbc.connect() calls
    where callers use conn.cursor() or pass conn to pandas.read_sql().
    """
    if MOCK_DATABASE:
        from backend.database.mock_db_layer import MockConnection
        return MockConnection()
        
    try:
        db = database if database else SQL_DATABASE
        engine = get_engine(db)
        # raw_connection() checks out a connection from the pool
        return engine.raw_connection()
    except Exception as e:
        print(f"[DATABASE ERROR] Live SQL Server connection failed: {e}")
        print("[DATABASE INFO] Falling back to local offline Mock Database Layer.")
        from backend.database.mock_db_layer import MockConnection
        return MockConnection()
