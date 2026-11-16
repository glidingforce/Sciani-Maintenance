/** Microsoft work-account sign-in. Your tasks are stored in your own OneDrive. */
export function SignIn(props: { onSignIn: () => void; onLocal: () => void; onDemo: () => void; error: string }) {
  return (
    <div className="center-card">
      <h1 className="page-title">Sign in</h1>
      <p>
        Sign in with your Scinai Microsoft account. Your tasks are kept in a private app folder in your OneDrive, so the same records open
        on your phone and computer.
      </p>
      <p className="subtle">
        The first time, Microsoft asks you to allow access to your calendar and to this app's own OneDrive folder. The app can't see your
        other files.
      </p>
      <button type="button" className="btn btn-primary" onClick={props.onSignIn}>
        Sign in with Microsoft
      </button>
      {props.error && <p className="error-text">{props.error}</p>}
      <hr className="divider" />
      <p className="subtle">
        Waiting for IT approval? You can work on this device now. Tasks stay in this browser until you sign in, then you move them to
        OneDrive with Export backup and Restore.
      </p>
      <button type="button" className="btn" onClick={props.onLocal}>
        Use on this device only
      </button>
      <button type="button" className="linkish" onClick={props.onDemo}>
        Look around with demo data instead
      </button>
    </div>
  );
}
