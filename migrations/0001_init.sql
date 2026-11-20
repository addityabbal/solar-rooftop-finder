-- D1 database solar-db: build log and opt-in quote requests.
CREATE TABLE IF NOT EXISTS build_requests (
  pin TEXT PRIMARY KEY,
  status TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT,
  error TEXT
);

-- Only what a person types in themselves, plus the exact consent text they agreed to (DPDP Act 2023).
CREATE TABLE IF NOT EXISTS leads (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  pin TEXT NOT NULL,
  name TEXT,
  phone TEXT NOT NULL,
  monthly_bill_inr INTEGER,
  consent_text TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now'))
);
