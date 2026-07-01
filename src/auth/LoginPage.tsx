import { useState } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import { LockKeyhole } from "lucide-react";
import { useAuth } from "./AuthContext";
import "./auth.css";

export function LoginPage() {
  const auth = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const from = (location.state as { from?: string } | null)?.from || "/reconciliation";

  if (auth.status === "authenticated") {
    return <Navigate replace to="/reconciliation" />;
  }

  return (
    <main className="login-page">
      <form
        className="login-card"
        onSubmit={async (event) => {
          event.preventDefault();
          setError("");
          setSubmitting(true);
          try {
            await auth.login(username.trim(), password);
            navigate(from, { replace: true });
          } catch (loginError) {
            setError(loginError instanceof Error ? loginError.message : "登录失败，请稍后重试。");
          } finally {
            setSubmitting(false);
          }
        }}
      >
        <div className="login-mark">
          <LockKeyhole size={28} />
        </div>
        <h1>臻林客户对账系统</h1>
        <p>请输入账号密码进入客户对账后台</p>

        {auth.notice && (
          <div className="login-notice" role="alert">
            {auth.notice}
            <button onClick={auth.clearNotice} type="button">
              知道了
            </button>
          </div>
        )}
        {error && <div className="login-error">{error}</div>}

        <label>
          账号
          <input autoComplete="username" onChange={(event) => setUsername(event.target.value)} placeholder="请输入账号" value={username} />
        </label>
        <label>
          密码
          <input
            autoComplete="current-password"
            onChange={(event) => setPassword(event.target.value)}
            placeholder="请输入密码"
            type="password"
            value={password}
          />
        </label>
        <button disabled={submitting || !username.trim() || !password} type="submit">
          {submitting ? "登录中..." : "登录"}
        </button>
      </form>
    </main>
  );
}
