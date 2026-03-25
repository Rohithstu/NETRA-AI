import sqlite3
import os

db_path = os.path.join('database', 'netra_faces.db')

if not os.path.exists(db_path):
    print(f"File not found: {os.path.abspath(db_path)}")
else:
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    cursor.execute("SELECT name, created_at FROM people")
    rows = cursor.fetchall()
    print(f"Total people in DB: {len(rows)}")
    for row in rows:
        print(f" - {row[0]} (added: {row[1]})")
    conn.close()
