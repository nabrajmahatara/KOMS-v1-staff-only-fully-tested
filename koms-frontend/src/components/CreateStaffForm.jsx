import { useState } from "react";
import { createStaff } from "../api/auth.api";
import { useAuth } from "../context/AuthContext";

const staffRoles = ["waiter", "kitchen_staff", "cashier"];

function CreateStaffForm({ onCreated }) {
  const { user } = useAuth();
  const roles = user?.role === "owner" ? ["manager", ...staffRoles] : staffRoles;
  const [formData, setFormData] = useState({
    username: "",
    email: "",
    password: "",
    role: "waiter",
  });
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(false);

  const handleChange = (event) => {
    const { name, value } = event.target;
    setFormData((previous) => ({ ...previous, [name]: value }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError("");
    setSuccess("");
    setLoading(true);

    try {
      const response = await createStaff(formData);
      setSuccess(`${response.data.username} was created as ${response.data.role}.`);
      setFormData({ username: "", email: "", password: "", role: "waiter" });
      onCreated?.(response.data);
    } catch (requestError) {
      setError(requestError.response?.data?.message || "Unable to create staff account.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      <h2>Create staff account</h2>
      <input name="username" value={formData.username} onChange={handleChange} placeholder="Username" required />
      <input name="email" type="email" value={formData.email} onChange={handleChange} placeholder="Email" required />
      <input name="password" type="password" value={formData.password} onChange={handleChange} placeholder="Temporary password" required />
      <select name="role" value={formData.role} onChange={handleChange}>
        {roles.map((role) => <option key={role} value={role}>{role}</option>)}
      </select>
      {error && <p role="alert">{error}</p>}
      {success && <p>{success}</p>}
      <button type="submit" disabled={loading}>{loading ? "Creating..." : "Create staff"}</button>
    </form>
  );
}

export default CreateStaffForm;
