import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import {
  ensureDefaultAdmin,
  findUserById,
  findUserByUsername,
  publicUser,
  readDb,
  verifyPassword,
  writeDb,
  hashPassword,
} from "./authStore.js";
import {
  hasReconciliationData,
  mergeReconciliationStore,
  readReconciliationStore,
  writeReconciliationStore,
} from "./reconciliationStore.js";
import { createToken, getTokenSecret, verifyToken } from "./token.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");
const distDir = path.join(rootDir, "dist");

loadEnvFile(path.join(rootDir, ".env"));
const port = Number(process.env.PORT || process.env.AUTH_PORT || 4100);

ensureDefaultAdmin();
if (getTokenSecret() === "dev-only-change-me") {
  console.warn("[auth] JWT_SECRET is not set. Set it in production.");
}

function loadEnvFile(envPath) {
  if (!fs.existsSync(envPath)) return;
  const lines = fs.readFileSync(envPath, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const index = trimmed.indexOf("=");
    if (index === -1) continue;
    const key = trimmed.slice(0, index).trim();
    const value = trimmed.slice(index + 1).trim().replace(/^["']|["']$/g, "");
    if (key && process.env[key] === undefined) process.env[key] = value;
  }
}

function sendJson(res, status, body) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  res.end(JSON.stringify(body));
}

function sendError(res, status, code, message) {
  sendJson(res, status, { error: { code, message } });
}

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > 20 * 1024 * 1024) reject(new Error("BODY_TOO_LARGE"));
    });
    req.on("end", () => {
      if (!body) return resolve({});
      try {
        resolve(JSON.parse(body));
      } catch {
        reject(new Error("INVALID_JSON"));
      }
    });
  });
}

function getBearerToken(req) {
  const auth = req.headers.authorization || "";
  const match = auth.match(/^Bearer\s+(.+)$/i);
  return match?.[1] || "";
}

function authenticate(req) {
  const token = getBearerToken(req);
  if (!token) return { error: ["UNAUTHORIZED", "请先登录"] };
  try {
    const payload = verifyToken(token);
    const db = readDb();
    const user = findUserById(db, payload.userId);
    if (!user || user.status !== "active") return { error: ["UNAUTHORIZED", "登录状态无效"] };
    if (user.currentSessionId !== payload.sessionId) {
      return { error: ["SESSION_REPLACED", "账号已在其他地方登录，本页面已下线。"] };
    }
    return { user, payload, db };
  } catch {
    return { error: ["UNAUTHORIZED", "登录已过期，请重新登录"] };
  }
}

async function handleApi(req, res, pathname) {
  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  if (pathname === "/api/auth/login" && req.method === "POST") {
    const { username, password } = await parseBody(req);
    const db = readDb();
    const user = findUserByUsername(db, username || "");
    if (!user || user.status !== "active" || !verifyPassword(password || "", user.passwordHash)) {
      sendError(res, 401, "LOGIN_FAILED", "账号或密码错误，或账号已停用。");
      return;
    }
    const sessionId = crypto.randomUUID();
    const timestamp = new Date().toISOString();
    user.currentSessionId = sessionId;
    user.lastLoginAt = timestamp;
    user.updatedAt = timestamp;
    writeDb(db);
    const token = createToken({
      userId: user.id,
      username: user.username,
      role: user.role,
      sessionId,
    });
    sendJson(res, 200, { token, user: publicUser(user) });
    return;
  }

  if (pathname === "/api/auth/me" && req.method === "GET") {
    const result = authenticate(req);
    if (result.error) return sendError(res, 401, result.error[0], result.error[1]);
    sendJson(res, 200, { user: publicUser(result.user) });
    return;
  }

  if (pathname === "/api/auth/logout" && req.method === "POST") {
    const result = authenticate(req);
    if (!result.error) {
      result.user.currentSessionId = "";
      result.user.updatedAt = new Date().toISOString();
      writeDb(result.db);
    }
    sendJson(res, 200, { ok: true });
    return;
  }

  if (pathname === "/api/auth/change-password" && req.method === "POST") {
    const result = authenticate(req);
    if (result.error) return sendError(res, 401, result.error[0], result.error[1]);
    const { oldPassword, newPassword } = await parseBody(req);
    if (!verifyPassword(oldPassword || "", result.user.passwordHash)) {
      sendError(res, 400, "PASSWORD_INVALID", "原密码不正确。");
      return;
    }
    if (!newPassword || String(newPassword).length < 8) {
      sendError(res, 400, "PASSWORD_TOO_WEAK", "新密码至少需要 8 位。");
      return;
    }
    result.user.passwordHash = hashPassword(String(newPassword));
    result.user.mustChangePassword = false;
    result.user.updatedAt = new Date().toISOString();
    writeDb(result.db);
    sendJson(res, 200, { user: publicUser(result.user) });
    return;
  }

  if (pathname === "/api/reconciliation/store" && req.method === "GET") {
    const result = authenticate(req);
    if (result.error) return sendError(res, 401, result.error[0], result.error[1]);
    const store = readReconciliationStore();
    sendJson(res, 200, { store, hasData: hasReconciliationData(store) });
    return;
  }

  if (pathname === "/api/reconciliation/store" && req.method === "PUT") {
    const result = authenticate(req);
    if (result.error) return sendError(res, 401, result.error[0], result.error[1]);
    const { store } = await parseBody(req);
    const savedStore = writeReconciliationStore(store);
    sendJson(res, 200, { store: savedStore, hasData: hasReconciliationData(savedStore) });
    return;
  }

  if (pathname === "/api/reconciliation/import" && req.method === "POST") {
    const result = authenticate(req);
    if (result.error) return sendError(res, 401, result.error[0], result.error[1]);
    const { store } = await parseBody(req);
    const mergedStore = mergeReconciliationStore(store);
    sendJson(res, 200, { store: mergedStore, hasData: hasReconciliationData(mergedStore) });
    return;
  }

  sendError(res, 404, "NOT_FOUND", "接口不存在。");
}

function serveStatic(req, res, pathname) {
  const filePath = pathname === "/" ? path.join(distDir, "index.html") : path.join(distDir, pathname);
  const resolved = path.resolve(filePath);
  const safeDist = path.resolve(distDir);
  const target = resolved.startsWith(safeDist) && fs.existsSync(resolved) && fs.statSync(resolved).isFile()
    ? resolved
    : path.join(distDir, "index.html");
  if (!fs.existsSync(target)) {
    res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Build the frontend first with: npm run build");
    return;
  }
  const ext = path.extname(target).toLowerCase();
  const types = {
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".svg": "image/svg+xml",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
  };
  res.writeHead(200, { "Content-Type": types[ext] || "application/octet-stream" });
  fs.createReadStream(target).pipe(res);
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url || "/", `http://${req.headers.host || "127.0.0.1"}`);
    if (url.pathname.startsWith("/api/")) {
      await handleApi(req, res, url.pathname);
      return;
    }
    serveStatic(req, res, decodeURIComponent(url.pathname));
  } catch (error) {
    console.error(error);
    sendError(res, 500, "SERVER_ERROR", "服务器错误。");
  }
});

server.listen(port, "127.0.0.1", () => {
  console.log(`[auth] API server running at http://127.0.0.1:${port}`);
});
