CREATE TABLE IF NOT EXISTS passkeys(id TEXT PRIMARY KEY, uid TEXT NOT NULL, public_key TEXT NOT NULL, counter INTEGER NOT NULL, transports TEXT NOT NULL, created_at INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS passkeys_uid ON passkeys(uid);
CREATE TABLE IF NOT EXISTS challenges(id TEXT PRIMARY KEY, uid TEXT NOT NULL, kind TEXT NOT NULL, challenge TEXT NOT NULL, expires INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS challenges_expiry ON challenges(expires);
CREATE TABLE IF NOT EXISTS devices(id TEXT PRIMARY KEY, uid TEXT NOT NULL, subscription TEXT NOT NULL, updated_at INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS devices_uid ON devices(uid);
CREATE TABLE IF NOT EXISTS deliveries(id TEXT PRIMARY KEY, device_id TEXT NOT NULL, recipient TEXT NOT NULL, member TEXT NOT NULL, author TEXT NOT NULL, kind TEXT NOT NULL, message_id TEXT NOT NULL, state TEXT NOT NULL DEFAULT 'pending', attempts INTEGER NOT NULL DEFAULT 0, lease_until INTEGER NOT NULL DEFAULT 0, next_at INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL,title TEXT);
CREATE INDEX IF NOT EXISTS deliveries_pending ON deliveries(state,next_at);
CREATE INDEX IF NOT EXISTS deliveries_expiry ON deliveries(created_at);
CREATE TABLE IF NOT EXISTS rates(id TEXT PRIMARY KEY, count INTEGER NOT NULL, expires INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS rates_expiry ON rates(expires);
CREATE TABLE IF NOT EXISTS presence(uid TEXT PRIMARY KEY, member TEXT NOT NULL, active_until INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS routine_settings(uid TEXT PRIMARY KEY, enabled INTEGER NOT NULL, timezone TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS routine_timezone ON routine_settings(enabled,timezone);
CREATE TABLE IF NOT EXISTS routine_events(uid TEXT NOT NULL,id TEXT NOT NULL,day INTEGER NOT NULL,minute INTEGER NOT NULL,title TEXT NOT NULL,PRIMARY KEY(uid,id));
CREATE INDEX IF NOT EXISTS routine_due ON routine_events(day,minute,uid);

