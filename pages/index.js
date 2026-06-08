import { useState } from "react";
import { supabase } from "../lib/supabase";

export default function Home() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [mode, setMode] = useState("login");

  const login = async () => {
    setError("");
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) {
      setError(error.message);
    } else {
      window.location.href = "/dashboard";
    }
  };

  const signUp = async () => {
    setError("");
    setLoading(true);
    const { error } = await supabase.auth.signUp({ email, password });
    setLoading(false);
    if (error) {
      setError(error.message);
    } else {
      setError("Check your email to confirm your account.");
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter") mode === "login" ? login() : signUp();
  };

  return (
    <div style={{
      minHeight: "100vh",
      background: "linear-gradient(135deg, #0f172a 0%, #1e3a5f 50%, #0f172a 100%)",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      fontFamily: "'Segoe UI', system-ui, sans-serif",
      padding: 20,
    }}>
      <div style={{ width: "100%", maxWidth: 420 }}>
        {/* Logo / Branding */}
        <div style={{ textAlign: "center", marginBottom: 36 }}>
          <div style={{
            fontSize: 48,
            marginBottom: 12,
            filter: "drop-shadow(0 4px 12px rgba(59,130,246,0.4))"
          }}>⚽</div>
          <h1 style={{
            color: "white",
            fontSize: 28,
            fontWeight: 800,
            margin: 0,
            letterSpacing: "-0.5px"
          }}>World Cup Predictor</h1>
          <p style={{ color: "#64748b", marginTop: 8, fontSize: 15 }}>
            2026 FIFA World Cup — Make your predictions
          </p>
        </div>

        {/* Card */}
        <div style={{
          background: "#1e293b",
          borderRadius: 16,
          padding: 32,
          border: "1px solid #334155",
          boxShadow: "0 25px 50px rgba(0,0,0,0.5)",
        }}>
          {/* Tab switcher */}
          <div style={{
            display: "flex",
            background: "#0f172a",
            borderRadius: 10,
            padding: 4,
            marginBottom: 28,
          }}>
            {["login", "signup"].map((m) => (
              <button
                key={m}
                onClick={() => { setMode(m); setError(""); }}
                style={{
                  flex: 1,
                  padding: "10px 0",
                  border: "none",
                  borderRadius: 8,
                  cursor: "pointer",
                  fontWeight: 600,
                  fontSize: 14,
                  transition: "all 0.2s",
                  background: mode === m ? "#3b82f6" : "transparent",
                  color: mode === m ? "white" : "#64748b",
                }}
              >
                {m === "login" ? "Sign In" : "Sign Up"}
              </button>
            ))}
          </div>

          {/* Fields */}
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: "block", color: "#94a3b8", fontSize: 13, fontWeight: 500, marginBottom: 6 }}>
              Email address
            </label>
            <input
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onKeyDown={handleKeyDown}
              style={{
                width: "100%",
                padding: "12px 14px",
                background: "#0f172a",
                border: "1px solid #334155",
                borderRadius: 8,
                color: "white",
                fontSize: 15,
                outline: "none",
                boxSizing: "border-box",
              }}
            />
          </div>

          <div style={{ marginBottom: 24 }}>
            <label style={{ display: "block", color: "#94a3b8", fontSize: 13, fontWeight: 500, marginBottom: 6 }}>
              Password
            </label>
            <input
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={handleKeyDown}
              style={{
                width: "100%",
                padding: "12px 14px",
                background: "#0f172a",
                border: "1px solid #334155",
                borderRadius: 8,
                color: "white",
                fontSize: 15,
                outline: "none",
                boxSizing: "border-box",
              }}
            />
          </div>

          {error && (
            <div style={{
              background: error.startsWith("Check") ? "#052e16" : "#1e0a0a",
              border: `1px solid ${error.startsWith("Check") ? "#16a34a" : "#dc2626"}`,
              borderRadius: 8,
              padding: "10px 14px",
              marginBottom: 16,
              color: error.startsWith("Check") ? "#86efac" : "#fca5a5",
              fontSize: 14,
            }}>
              {error}
            </div>
          )}

          <button
            onClick={mode === "login" ? login : signUp}
            disabled={loading}
            style={{
              width: "100%",
              padding: "13px 0",
              background: loading ? "#1d4ed8" : "linear-gradient(135deg, #2563eb, #3b82f6)",
              color: "white",
              border: "none",
              borderRadius: 8,
              fontSize: 15,
              fontWeight: 700,
              cursor: loading ? "not-allowed" : "pointer",
              boxShadow: "0 4px 14px rgba(59,130,246,0.3)",
              letterSpacing: "0.3px",
            }}
          >
            {loading ? "Please wait..." : mode === "login" ? "Sign In" : "Create Account"}
          </button>
        </div>
      </div>
    </div>
  );
}
