import { useState } from 'react';
import { appUrl } from '../config';
import { supabase } from '../storage/supabaseRepo';

/** Email one-time-code sign-in for shared storage. The 6-digit code works inside an
 * iPhone home-screen app, where a magic link would open Safari instead. */
export function SignIn({ onDemo }: { onDemo: () => void }) {
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function send() {
    setBusy(true);
    setError('');
    const { error } = await supabase().auth.signInWithOtp({
      email: email.trim(),
      // Only existing users may sign in; create your user once in the Supabase dashboard.
      options: { shouldCreateUser: false, emailRedirectTo: appUrl() },
    });
    setBusy(false);
    if (error) setError(error.message);
    else setSent(true);
  }

  async function verify() {
    setBusy(true);
    setError('');
    const { error } = await supabase().auth.verifyOtp({ email: email.trim(), token: code.trim(), type: 'email' });
    setBusy(false);
    if (error) setError(error.message);
  }

  return (
    <div className="center-card">
      <h1 className="page-title">Sign in</h1>
      <p className="subtle">Your tasks are stored privately and shared between your own devices.</p>
      <form
        className="form"
        onSubmit={(e) => {
          e.preventDefault();
          void (sent ? verify() : send());
        }}
      >
        <label className="field">
          <span>Email</span>
          <input type="email" autoComplete="email" required value={email} disabled={sent} onChange={(e) => setEmail(e.target.value)} />
        </label>
        {sent && (
          <>
            <p className="subtle">We sent a sign-in email. Enter the code from it, or open its link on this device.</p>
            <label className="field">
              <span>Code</span>
              <input inputMode="numeric" autoComplete="one-time-code" value={code} onChange={(e) => setCode(e.target.value)} />
            </label>
          </>
        )}
        <button type="submit" className="btn btn-primary" disabled={busy}>
          {busy ? 'Please wait…' : sent ? 'Sign in' : 'Email me a code'}
        </button>
        {sent && (
          <button type="button" className="linkish" onClick={() => setSent(false)}>
            Use a different email
          </button>
        )}
        {error && <p className="error-text">{error}</p>}
      </form>
      <button type="button" className="linkish" onClick={onDemo}>
        Look around with demo data instead
      </button>
    </div>
  );
}
