import { useState } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import { ArrowRight, LockKeyhole, UserRound } from "lucide-react";
import { Orb } from "../components/common/Orb";
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
      <Orb
        accentColor="#8df5c4"
        backgroundColor="#020711"
        baseColor="#3b82f6"
        className="login-orb"
        glowColor="#6ee7f5"
        speed={0.32}
      />
      <form
        className="login-card login-shell"
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
        <div className="login-brand">
          <img alt="" className="login-brand-logo" src="/zhenlin-logo-white.png" />
        </div>
        <div className="login-form-head">
          <span>系统登录</span>
          <strong>臻林客户对账OS</strong>
        </div>

        {auth.notice && (
          <div className="login-notice" role="alert">
            {auth.notice}
            <button onClick={auth.clearNotice} type="button">
              知道了
            </button>
          </div>
        )}
        {error && <div className="login-error">{error}</div>}

        <label className="login-field">
          <span>账号</span>
          <div>
            <UserRound size={18} />
            <input autoComplete="username" onChange={(event) => setUsername(event.target.value)} placeholder="请输入账号" value={username} />
          </div>
        </label>
        <label className="login-field">
          <span>密码</span>
          <div>
            <LockKeyhole size={18} />
            <input
              autoComplete="current-password"
              onChange={(event) => setPassword(event.target.value)}
              placeholder="请输入密码"
              type="password"
              value={password}
            />
          </div>
        </label>
        <button className="login-submit" disabled={submitting || !username.trim() || !password} type="submit">
          {submitting ? "登录中..." : "登录"}
          <ArrowRight size={18} />
        </button>
      </form>
    </main>
  );
}
