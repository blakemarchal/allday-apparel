import { sendMagicLink } from './actions';

type SearchParams = Promise<{ sent?: string; error?: string }>;

export default async function LoginPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const params = await searchParams;
  const sent = params.sent === '1';
  const error = params.error;

  return (
    <div className="max-w-sm mx-auto mt-8">
      <h1 className="text-2xl font-heading font-bold mb-1">Sign in</h1>
      <p className="text-sm text-muted-foreground mb-6">
        Enter your email — we&apos;ll send a one-time sign-in link. No password.
      </p>

      {sent && (
        <div className="border border-border rounded p-3 mb-4 text-sm bg-muted text-muted-foreground">
          Check your inbox. The link signs you in instantly.
        </div>
      )}

      {error && (
        <div className="border border-border rounded p-3 mb-4 text-sm bg-muted text-muted-foreground">
          <strong className="text-foreground">Couldn&apos;t send link:</strong> {error}
        </div>
      )}

      <form action={sendMagicLink} className="flex flex-col gap-3">
        <label className="flex flex-col gap-1">
          <span className="text-xs text-muted-foreground uppercase tracking-wide">Email</span>
          <input
            type="email"
            name="email"
            required
            autoComplete="email"
            placeholder="you@example.com"
            className="border border-border rounded px-3 py-2.5 bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
          />
        </label>
        <button
          type="submit"
          className="bg-primary text-primary-foreground rounded px-4 py-2.5 font-medium hover:opacity-90 active:opacity-80"
        >
          Send sign-in link
        </button>
      </form>

      <p className="mt-6 text-xs text-muted-foreground">
        Access is invite-only. If you weren&apos;t added by an owner, the link
        will succeed but the dashboard will tell you the account isn&apos;t
        authorized.
      </p>
    </div>
  );
}
