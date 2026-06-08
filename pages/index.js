import { useState } from "react";
import { supabase } from "../lib/supabase";

export default function Home() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const login = async () => {
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      alert(error.message);
    } else {
      window.location.href = "/dashboard";
    }
  };

const signUp = async () => {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
  });

  if (error) {
    alert(error.message);
  } else {
    // Save user in users table
    await supabase.from("users").insert({
      id: data.user.id,
      email: data.user.email,
    });

    alert("Account created!");
  }
};
``

  return (
    <div style={{ padding: 40 }}>
      <h1>World Cup Predictor</h1>

      <input
        placeholder="Email"
        onChange={(e) => setEmail(e.target.value)}
      />
      <br />

      <input
        type="password"
        placeholder="Password"
        onChange={(e) => setPassword(e.target.value)}
      />

      <br /><br />

      <button onClick={login}>Login</button>
      <button onClick={signUp}>Sign Up</button>
    </div>
  );
}
