export default function SetupNotice() {
  return (
    <div className="center-screen">
      <div className="card setup">
        <h1>Firebase isn’t configured yet</h1>
        <p>
          Add your Firebase web config as environment variables. Locally, copy <code>.env.example</code> to{' '}
          <code>.env.local</code>. On Netlify, add them under <b>Site configuration → Environment variables</b>, then
          redeploy.
        </p>
        <pre>
          {`VITE_FIREBASE_API_KEY
VITE_FIREBASE_AUTH_DOMAIN
VITE_FIREBASE_DATABASE_URL
VITE_FIREBASE_PROJECT_ID
VITE_FIREBASE_APP_ID`}
        </pre>
        <p className="muted">See README.md for the full setup steps.</p>
      </div>
    </div>
  );
}
