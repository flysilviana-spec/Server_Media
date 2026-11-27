import { useEffect, useState } from "react";
import { supabase, toLoginEmail } from "./supabase";
import FileManager from "./FileManager";

function DiskArt() {
  return (
    <svg className="disk-art" viewBox="0 0 120 90" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="8" y="10" width="104" height="70" rx="10" />
      <circle cx="46" cy="42" r="22" />
      <circle cx="46" cy="42" r="6" />
      <path d="M46 42 62 30" />
      <path d="M82 28h16M82 38h16" />
      <circle cx="98" cy="66" r="3" fill="currentColor" />
      <path d="M20 68h40" />
    </svg>
  );
}

function Login() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleLogin(e) {
    e.preventDefault();
    setLoading(true);
    setError("");
    const { error } = await supabase.auth.signInWithPassword({ email: toLoginEmail(username), password });
    if (error) {
      setError(/invalid login/i.test(error.message) ? "Username atau password salah." : error.message);
    }
    setLoading(false);
  }

  return (
    <div className="center">
      <form onSubmit={handleLogin} className="panel login">
        <div>
          <DiskArt />
          <h1>Masuk</h1>
          <p className="muted">Login untuk mengelola foto dan video.</p>
        </div>
        <label>
          Username
          <input type="text" value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" autoCapitalize="none" autoCorrect="off" spellCheck={false} required />
        </label>
        <label>
          Password
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required />
        </label>
        {error && <p className="error" role="alert">{error}</p>}
        <button className="primary" disabled={loading}>{loading ? "Memproses..." : "Masuk"}</button>
      </form>
    </div>
  );
}

export default function App() {
  const [session, setSession] = useState(undefined);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  if (session === undefined) return <p className="muted pad">Memuat...</p>;
  return session ? <FileManager user={session.user} /> : <Login />;
}
