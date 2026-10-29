CREATE TABLE IF NOT EXISTS admin_sessions (id TEXT PRIMARY KEY,created INTEGER NOT NULL,expires INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS admin_sessions_expiry ON admin_sessions(expires);
CREATE TABLE IF NOT EXISTS admin_login_limits (key TEXT PRIMARY KEY,window INTEGER NOT NULL,count INTEGER NOT NULL);
