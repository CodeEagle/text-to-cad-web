"use client";

import { useEffect, useState } from "react";
import {
  Copy,
  ExternalLink,
  Loader2,
  LogIn,
  LogOut,
  RefreshCw,
  UserRound,
  X
} from "lucide-react";

type DeviceLogin = {
  verificationUri: string;
  userCode: string;
  rawOutput: string;
  startedAt: string;
  pending?: false;
};

type AuthStatus = {
  available: boolean;
  loggedIn: boolean;
  output: string;
  activeDeviceLogin: DeviceLogin | null;
  pendingDeviceLogin: boolean;
  deviceLoginError?: string;
};

type BusyState = "auth" | "logout" | "status" | null;

export function AuthHeaderControl() {
  const [auth, setAuth] = useState<AuthStatus | null>(null);
  const [deviceLogin, setDeviceLogin] = useState<DeviceLogin | null>(null);
  const [authMessage, setAuthMessage] = useState("");
  const [busy, setBusy] = useState<BusyState>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    void refreshAuth();
  }, []);

  useEffect(() => {
    if (auth?.loggedIn) {
      return;
    }
    const interval = window.setInterval(async () => {
      await refreshAuth();
    }, 5000);
    return () => window.clearInterval(interval);
  }, [auth?.loggedIn, deviceLogin]);

  useEffect(() => {
    if (!auth?.pendingDeviceLogin || deviceLogin) {
      return;
    }
    const interval = window.setInterval(async () => {
      await refreshAuth();
    }, 1000);
    return () => window.clearInterval(interval);
  }, [auth?.pendingDeviceLogin, deviceLogin]);

  useEffect(() => {
    if (!auth) {
      return;
    }
    setOpen(!auth.loggedIn);
  }, [auth?.loggedIn]);

  async function refreshAuth() {
    setBusy((current) => current ?? "status");
    try {
      const response = await fetch("/api/auth/status", { cache: "no-store" });
      const status = (await response.json()) as AuthStatus;
      setAuth(status);
      if (status.loggedIn) {
        setDeviceLogin(null);
        setAuthMessage("");
      } else if (status.activeDeviceLogin) {
        setDeviceLogin(status.activeDeviceLogin);
        setAuthMessage("");
      } else if (!status.pendingDeviceLogin) {
        setDeviceLogin(null);
      } else if (status.deviceLoginError) {
        setAuthMessage(status.deviceLoginError);
      }
    } finally {
      setBusy((current) => (current === "status" ? null : current));
    }
  }

  async function startLogin() {
    setBusy("auth");
    setAuthMessage("");
    setDeviceLogin(null);
    try {
      await requestDeviceLogin();
      await refreshAuth();
    } catch (error) {
      setAuthMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(null);
    }
  }

  async function startLogout() {
    setBusy("logout");
    setAuthMessage("");
    try {
      const logout = await requestLogout();
      setDeviceLogin(null);
      setAuthMessage(logout.output || "已退出 Codex 登录。");
      await refreshAuth();
      setOpen(true);
    } catch (error) {
      setAuthMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(null);
    }
  }

  async function switchAccount() {
    setBusy("auth");
    setAuthMessage("");
    setDeviceLogin(null);
    try {
      await requestLogout();
      await requestDeviceLogin();
      await refreshAuth();
      setOpen(true);
    } catch (error) {
      setAuthMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(null);
    }
  }

  async function requestDeviceLogin() {
    const response = await fetch("/api/auth/device", { method: "POST" });
    const body = await response.json();
    if (!response.ok) {
      throw new Error(body.error ?? "启动 OAuth 登录失败。");
    }
    if (body.verificationUri && body.userCode) {
      setDeviceLogin(body as DeviceLogin);
    } else if (body.pending) {
      setAuthMessage("正在等待 Codex 输出登录网址和验证码…");
    }
  }

  async function requestLogout(): Promise<{ available: boolean; output: string }> {
    const response = await fetch("/api/auth/logout", { method: "POST" });
    const body = await response.json();
    if (!response.ok) {
      throw new Error(body.error ?? "退出 Codex 登录失败。");
    }
    return body as { available: boolean; output: string };
  }

  return (
    <div className="header-auth">
      <button
        aria-expanded={open}
        aria-haspopup="dialog"
        className={open ? "account-trigger active" : "account-trigger"}
        onClick={() => setOpen((value) => !value)}
        title={auth?.loggedIn ? "账号和登录" : "登录 Codex"}
        type="button"
      >
        {auth?.loggedIn ? <UserRound size={15} /> : <LogIn size={15} />}
        <span>{auth?.loggedIn ? "账号" : "登录"}</span>
      </button>
      {auth && open ? (
        <div className="account-popover">
          <AuthCard
            auth={auth}
            authMessage={authMessage}
            busy={busy}
            deviceLogin={deviceLogin}
            onClose={() => setOpen(false)}
            onLogin={startLogin}
            onLogout={startLogout}
            onRefresh={refreshAuth}
            onSwitchAccount={switchAccount}
          />
        </div>
      ) : null}
    </div>
  );
}

function AuthCard({
  auth,
  authMessage,
  busy,
  deviceLogin,
  onClose,
  onLogin,
  onLogout,
  onRefresh,
  onSwitchAccount
}: {
  auth: AuthStatus;
  authMessage: string;
  busy: BusyState;
  deviceLogin: DeviceLogin | null;
  onClose: () => void;
  onLogin: () => void;
  onLogout: () => void;
  onRefresh: () => void;
  onSwitchAccount: () => void;
}) {
  const statusClass = auth.loggedIn ? "good" : auth.available === false ? "bad" : "";
  const statusLabel = auth.loggedIn
    ? "已登录"
    : auth.pendingDeviceLogin
      ? "等待验证码"
      : auth.available === false
        ? "未找到 Codex CLI"
        : "需要登录";

  return (
    <section className="card auth-card" aria-label="Codex 登录">
      <div className="auth-card-head">
        <div className="auth-summary">
          <p className="eyebrow">Codex 登录</p>
          <p className={`auth-status ${statusClass}`}>
            <span
              className="dot"
              style={{
                background: auth.loggedIn
                  ? "var(--sage)"
                  : auth.available === false
                    ? "var(--danger)"
                    : "var(--amber)"
              }}
            />
            {statusLabel}
          </p>
        </div>
        <div className="auth-tools">
          <button aria-label="刷新登录状态" className="ibtn" onClick={onRefresh} type="button">
            <RefreshCw size={14} />
          </button>
          {auth.loggedIn ? (
            <button aria-label="关闭登录面板" className="ibtn" onClick={onClose} type="button">
              <X size={14} />
            </button>
          ) : null}
        </div>
      </div>

      {auth.output ? <p className="auth-output">{auth.output}</p> : null}

      {auth.loggedIn ? (
        <div className="auth-actions">
          <button className="btn wide" disabled={busy === "auth" || busy === "logout"} onClick={onSwitchAccount} type="button">
            {busy === "auth" ? <Loader2 className="spin" size={16} /> : <LogIn size={16} />}
            更换账号
          </button>
          <button className="btn danger wide" disabled={busy === "auth" || busy === "logout"} onClick={onLogout} type="button">
            {busy === "logout" ? <Loader2 className="spin" size={16} /> : <LogOut size={16} />}
            退出登录
          </button>
        </div>
      ) : (
        <button className="btn wide" disabled={busy === "auth"} onClick={onLogin} type="button">
          {busy === "auth" ? <Loader2 className="spin" size={16} /> : <LogIn size={16} />}
          开始 OAuth
        </button>
      )}

      {deviceLogin && !auth.loggedIn ? (
        <div className="device-box">
          <div className="device-row">
            <span className="eyebrow">登录网址</span>
            <a className="device-link" href={deviceLogin.verificationUri} rel="noreferrer" target="_blank">
              <span>{deviceLogin.verificationUri}</span>
              <ExternalLink size={14} />
            </a>
          </div>
          <div className="device-row">
            <span className="eyebrow">验证码</span>
            <button
              className="device-code"
              onClick={() => navigator.clipboard.writeText(deviceLogin.userCode)}
              type="button"
            >
              <strong>{deviceLogin.userCode}</strong>
              <span>
                复制 <Copy size={14} />
              </span>
            </button>
          </div>
        </div>
      ) : null}

      {authMessage ? <p className="error-text">{authMessage}</p> : null}
    </section>
  );
}
