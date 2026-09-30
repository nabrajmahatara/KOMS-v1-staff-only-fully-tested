import { Link } from "react-router-dom";

function NotAuthorized() {
  return (
    <main>
      <h1>Not authorized</h1>
      <p>Your account does not have access to that area.</p>
      <Link to="/">Return to dashboard</Link>
    </main>
  );
}

export default NotAuthorized;
