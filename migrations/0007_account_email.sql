-- Existing accounts remain usable without email. New registrations require a unique,
-- case-insensitive address; it is not proof of mailbox ownership until verified.
ALTER TABLE users ADD COLUMN email TEXT COLLATE NOCASE;
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email ON users(email COLLATE NOCASE) WHERE email IS NOT NULL;
