import { useState } from "react";
import { apiFetch } from "../../lib/api";

export default function AdminLogin() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");

  async function login() {
    setErr("");
    try {
      const out = await apiFetch("/admin/login", {
        method: "POST",
        body: JSON.stringify({ email, password })
      });
      localStorage.setItem("admin_jwt", out.token);
      window.location.href = "/admin";
    } catch (e: any) {
      setErr(e.message || "Login failed");
    }
  }

  return (
    <div style={{ maxWidth: 520, margin: "40px auto", padding: 16, fontFamily: "system-ui" }}>
      <h1>Admin Login</h1>
      {err && <p style={{ color: "crimson" }}>{err}</p>}
      <input
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="Email"
        style={{ width: "100%", padding: 10, marginTop: 8 }}
      />
      <input
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        placeholder="Password"
        type="password"
        style={{ width: "100%", padding: 10, marginTop: 8 }}
      />
      <button onClick={login} style={{ padding: "10px 14px", marginTop: 12, width: "100%" }}>
        Login
      </button>
    </div>
  );
}