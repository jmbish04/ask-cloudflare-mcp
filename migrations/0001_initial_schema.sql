-- Sessions table: tracks each request session
CREATE TABLE IF NOT EXISTS sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT NOT NULL UNIQUE,
  timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
  title TEXT,
  endpoint_type TEXT NOT NULL CHECK(endpoint_type IN ('simple-questions', 'detailed-questions', 'auto-analyze', 'pr-analyze')),
  repo_url TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_sessions_session_id ON sessions(session_id);
CREATE INDEX IF NOT EXISTS idx_sessions_endpoint_type ON sessions(endpoint_type);
CREATE INDEX IF NOT EXISTS idx_sessions_timestamp ON sessions(timestamp DESC);

-- Questions table: stores individual questions and responses
CREATE TABLE IF NOT EXISTS questions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id INTEGER NOT NULL,
  question TEXT NOT NULL,
  meta_json TEXT, -- JSON field for additional metadata
  response TEXT NOT NULL,
  question_source TEXT NOT NULL CHECK(question_source IN ('user_provided', 'ai_generated')),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_questions_session_id ON questions(session_id);
CREATE INDEX IF NOT EXISTS idx_questions_source ON questions(question_source);

-- Action logs table: comprehensive logging for all actions
CREATE TABLE IF NOT EXISTS action_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id INTEGER,
  timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
  action_type TEXT NOT NULL,
  action_description TEXT NOT NULL,
  metadata_json TEXT, -- JSON field for additional context
  has_error BOOLEAN DEFAULT 0,
  error_message TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_action_logs_session_id ON action_logs(session_id);
CREATE INDEX IF NOT EXISTS idx_action_logs_timestamp ON action_logs(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_action_logs_has_error ON action_logs(has_error);
CREATE INDEX IF NOT EXISTS idx_action_logs_action_type ON action_logs(action_type);
