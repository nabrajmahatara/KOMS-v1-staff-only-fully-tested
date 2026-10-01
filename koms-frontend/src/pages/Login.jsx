import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

function Login() {
  const navigate = useNavigate();
  const { login } = useAuth();

  const [formData, setFormData] = useState({
    emailOrUsername: "",
    password: "",
  });

  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleChange = (event) => {
    const { name, value } = event.target;

    setFormData((previous) => ({
      ...previous,
      [name]: value,
    }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();

    setError("");
    setLoading(true);

    try {
      await login(formData);
      navigate("/dashboard");
    } catch (error) {
      if (!error.response) {
        setError(
          "Cannot reach the KOMS API. Restart the Vite server and confirm the backend is running on port 4000."
        );
      } else {
        setError(error.response.data?.message || "Login request failed.");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="login-page">
      <section className="login-card" aria-labelledby="login-title">
      <h1 id="login-title">Staff login</h1>
      <p className="muted">Sign in to access the KOMS staff dashboard.</p>

      <form className="login-form" onSubmit={handleSubmit}>
        <div>
          <label htmlFor="emailOrUsername">Email or Username</label>

          <input
            id="emailOrUsername"
            name="emailOrUsername"
            type="text"
            value={formData.emailOrUsername}
            onChange={handleChange}
            required
          />
        </div>

        <div>
          <label htmlFor="password">Password</label>

          <input
            id="password"
            name="password"
            type="password"
            value={formData.password}
            onChange={handleChange}
            required
          />
        </div>

        {error && <p className="error" role="alert">{error}</p>}

        <button type="submit" className="button" disabled={loading}>
          {loading ? "Logging in..." : "Login"}
        </button>
      </form>
      </section>
    </main>
  );
}

export default Login;
