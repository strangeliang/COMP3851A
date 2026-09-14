# Enable Google sign-in

1. In Google Cloud / Google Auth Platform, create or select your project and configure the consent screen (application name, support contact, audience, and test users when in testing mode).
2. Create an OAuth client of type **Web application**. Add the exact frontend origin under **Authorized JavaScript origins**, for example `http://localhost:5173`. If using `http://127.0.0.1:5173`, authorize that origin separately. Use your actual HTTPS origin in deployment.
3. In `backend/.env`, set `GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com`. This GIS ID-token flow does not need a client secret or redirect URI. Keep existing environment settings intact. No Google password belongs in this file.
4. Restart the backend and refresh the frontend. The official Google button replaces the not-configured message. If serving the production build, rebuild the frontend.
5. Sign in with a permitted test Google account. A new identity gets a new Student account and its own empty course workspace. Existing demo-account materials are not copied.

Existing email/password login remains available. An existing email is **not automatically linked**, particularly not to an administrator account. Such users must use their existing password and contact the administrator; self-service linking is not implemented. Google-only accounts do not have a usable local password. Google password recovery is handled by Google, not this app.

The server verifies the signed ID token and audience with Google's official library and checks a five-minute, single-use browser nonce and verified email. Google subject ID identifies the account. Disabled users are blocked; the application then issues its normal HttpOnly session cookie. No Drive/Gmail access is requested.

Local tests exercise route failure/success paths with a mocked Google verifier. A real Google sign-in requires your client configuration and must still be tested in the browser. Google's SDK may be blocked by network restrictions or browser extensions.

Official setup: https://developers.google.com/identity/gsi/web/guides/get-google-api-clientid
Server verification: https://developers.google.com/identity/gsi/web/guides/verify-google-id-token
