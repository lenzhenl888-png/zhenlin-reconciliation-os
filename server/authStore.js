import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

function resolveDbPath() {
  const configuredPath = process.env.AUTH_DATA_FILE || process.env.AUTH_DB_FILE;
  if (!configuredPath) return path.join(process.cwd(), "server", "data", "auth-db.json");
  return path.isAbsolute(configuredPath) ? configuredPath : path.join(process.cwd(), configuredPath);
}

const dbPath = resolveDbPath();
const dataDir = path.dirname(dbPath);
const defaultAdminUsername = "ZLFZ250721";

function now() {
  return new Date().toISOString();
}

function defaultDb() {
  return { users: [] };
}

export function readDb() {
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
  if (!fs.existsSync(dbPath)) {
    fs.writeFileSync(dbPath, JSON.stringify(defaultDb(), null, 2), "utf8");
  }
  return JSON.parse(fs.readFileSync(dbPath, "utf8"));
}

export function writeDb(db) {
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
  fs.writeFileSync(dbPath, JSON.stringify(db, null, 2), "utf8");
}

export function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("base64url");
  const iterations = 120000;
  const key = crypto.pbkdf2Sync(password, salt, iterations, 32, "sha256").toString("base64url");
  return `pbkdf2-sha256$${iterations}$${salt}$${key}`;
}

export function verifyPassword(password, passwordHash) {
  const [algorithm, iterationText, salt, storedKey] = String(passwordHash).split("$");
  if (algorithm !== "pbkdf2-sha256" || !iterationText || !salt || !storedKey) return false;
  const key = crypto.pbkdf2Sync(password, salt, Number(iterationText), 32, "sha256").toString("base64url");
  return crypto.timingSafeEqual(Buffer.from(key), Buffer.from(storedKey));
}

export function ensureDefaultAdmin() {
  const db = readDb();
  if (db.users.length > 0) {
    const hasNewAdmin = db.users.some((user) => user.username.toLowerCase() === defaultAdminUsername.toLowerCase());
    const legacyAdmin = db.users.find((user) => user.username.toLowerCase() === "admin");
    if (!hasNewAdmin && legacyAdmin) {
      legacyAdmin.username = defaultAdminUsername;
      legacyAdmin.updatedAt = now();
      writeDb(db);
      console.log(`[auth] Migrated admin username to ${defaultAdminUsername}`);
    }
    return;
  }
  const timestamp = now();
  db.users.push({
    id: crypto.randomUUID(),
    username: defaultAdminUsername,
    passwordHash: hashPassword("Admin@123456"),
    displayName: "管理员",
    role: "admin",
    status: "active",
    currentSessionId: "",
    lastLoginAt: "",
    mustChangePassword: true,
    createdAt: timestamp,
    updatedAt: timestamp,
  });
  writeDb(db);
  console.log(`[auth] Created default admin: ${defaultAdminUsername} / Admin@123456`);
}

export function publicUser(user) {
  return {
    id: user.id,
    username: user.username,
    displayName: user.displayName,
    role: user.role,
    status: user.status,
    lastLoginAt: user.lastLoginAt,
    mustChangePassword: Boolean(user.mustChangePassword),
  };
}

export function findUserByUsername(db, username) {
  return db.users.find((user) => user.username.toLowerCase() === String(username).trim().toLowerCase());
}

export function findUserById(db, userId) {
  return db.users.find((user) => user.id === userId);
}
