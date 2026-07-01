import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";

export type AuthUser = {
  id: string;
  username: string;
  displayName: string;
  role: "admin" | "user";
  status: "active" | "disabled";
  lastLoginAt: string;
  mustChangePassword?: boolean;
};

type AuthStatus = "checking" | "authenticated" | "guest";

type AuthContextValue = {
  checkSession(): Promise<void>;
  clearNotice(): void;
  login(username: string, password: string): Promise<void>;
  logout(): Promise<void>;
  notice: string;
  status: AuthStatus;
  token: string;
  user: AuthUser | null;
};

const tokenKey = "zhenlin.auth.token";
const userKey = "zhenlin.auth.user";
const noticeKey = "zhenlin.auth.notice";
const channelName = "zhenlin-auth-channel";
const replacedMessage = "账号已在其他地方登录，本页面已下线。";

const AuthContext = createContext<AuthContextValue | null>(null);

function readStoredUser() {
  const raw = localStorage.getItem(userKey);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as AuthUser;
  } catch {
    return null;
  }
}

async function readApiError(response: Response) {
  try {
    const body = await response.json();
    return body?.error as { code?: string; message?: string } | undefined;
  } catch {
    return undefined;
  }
}

export function AuthProvider(props: { children: ReactNode }) {
  const [token, setToken] = useState(() => localStorage.getItem(tokenKey) || "");
  const [user, setUser] = useState<AuthUser | null>(() => readStoredUser());
  const [status, setStatus] = useState<AuthStatus>(() => (localStorage.getItem(tokenKey) ? "checking" : "guest"));
  const [notice, setNotice] = useState(() => localStorage.getItem(noticeKey) || "");
  const channelRef = useRef<BroadcastChannel | null>(null);

  const persistAuth = useCallback((nextToken: string, nextUser: AuthUser) => {
    localStorage.setItem(tokenKey, nextToken);
    localStorage.setItem(userKey, JSON.stringify(nextUser));
    localStorage.removeItem(noticeKey);
    setToken(nextToken);
    setUser(nextUser);
    setNotice("");
    setStatus("authenticated");
  }, []);

  const clearAuth = useCallback((message?: string) => {
    localStorage.removeItem(tokenKey);
    localStorage.removeItem(userKey);
    if (message) {
      localStorage.setItem(noticeKey, message);
      setNotice(message);
    }
    setToken("");
    setUser(null);
    setStatus("guest");
  }, []);

  const broadcast = useCallback((type: "login" | "logout" | "session_replaced") => {
    channelRef.current?.postMessage({ type });
    localStorage.setItem("zhenlin.auth.event", `${type}:${Date.now()}`);
  }, []);

  const checkSession = useCallback(async () => {
    const currentToken = localStorage.getItem(tokenKey);
    if (!currentToken) {
      clearAuth();
      return;
    }

    const response = await fetch("/api/auth/me", {
      headers: { Authorization: `Bearer ${currentToken}` },
    });
    if (response.ok) {
      const body = (await response.json()) as { user: AuthUser };
      persistAuth(currentToken, body.user);
      return;
    }

    const error = await readApiError(response);
    if (error?.code === "SESSION_REPLACED") {
      clearAuth(error.message || replacedMessage);
      broadcast("session_replaced");
      window.alert(error.message || replacedMessage);
      return;
    }
    clearAuth("登录已过期，请重新登录。");
  }, [broadcast, clearAuth, persistAuth]);

  const login = useCallback(
    async (username: string, password: string) => {
      const response = await fetch("/api/auth/login", {
        body: JSON.stringify({ username, password }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });
      if (!response.ok) {
        const error = await readApiError(response);
        throw new Error(error?.message || "登录失败，请检查账号和密码。");
      }
      const body = (await response.json()) as { token: string; user: AuthUser };
      persistAuth(body.token, body.user);
      broadcast("login");
    },
    [broadcast, persistAuth],
  );

  const logout = useCallback(async () => {
    const currentToken = localStorage.getItem(tokenKey);
    if (currentToken) {
      await fetch("/api/auth/logout", {
        headers: { Authorization: `Bearer ${currentToken}` },
        method: "POST",
      }).catch(() => undefined);
    }
    clearAuth();
    broadcast("logout");
  }, [broadcast, clearAuth]);

  const clearNotice = useCallback(() => {
    localStorage.removeItem(noticeKey);
    setNotice("");
  }, []);

  useEffect(() => {
    channelRef.current = "BroadcastChannel" in window ? new BroadcastChannel(channelName) : null;
    const handleMessage = (event: MessageEvent<{ type: string }>) => {
      if (event.data.type === "login") {
        const nextToken = localStorage.getItem(tokenKey) || "";
        const nextUser = readStoredUser();
        if (nextToken && nextUser) persistAuth(nextToken, nextUser);
      }
      if (event.data.type === "logout") clearAuth();
      if (event.data.type === "session_replaced") clearAuth(replacedMessage);
    };
    channelRef.current?.addEventListener("message", handleMessage);
    return () => {
      channelRef.current?.removeEventListener("message", handleMessage);
      channelRef.current?.close();
    };
  }, [clearAuth, persistAuth]);

  useEffect(() => {
    const handleStorage = (event: StorageEvent) => {
      if (event.key !== "zhenlin.auth.event") return;
      const type = event.newValue?.split(":")[0];
      if (type === "login") {
        const nextToken = localStorage.getItem(tokenKey) || "";
        const nextUser = readStoredUser();
        if (nextToken && nextUser) persistAuth(nextToken, nextUser);
      }
      if (type === "logout") clearAuth();
      if (type === "session_replaced") clearAuth(replacedMessage);
    };
    window.addEventListener("storage", handleStorage);
    return () => window.removeEventListener("storage", handleStorage);
  }, [clearAuth, persistAuth]);

  useEffect(() => {
    void checkSession();
  }, [checkSession]);

  useEffect(() => {
    if (!token || status !== "authenticated") return;
    const timer = window.setInterval(() => void checkSession(), 10000);
    const onFocus = () => void checkSession();
    window.addEventListener("focus", onFocus);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", onFocus);
    };
  }, [checkSession, status, token]);

  const value = useMemo<AuthContextValue>(
    () => ({ checkSession, clearNotice, login, logout, notice, status, token, user }),
    [checkSession, clearNotice, login, logout, notice, status, token, user],
  );

  return <AuthContext.Provider value={value}>{props.children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within AuthProvider");
  return context;
}
