import { asc } from 'drizzle-orm';
import { db } from '@allday/db';
import { adminUser } from '@allday/db/schema';
import { requireAdmin } from '@/lib/admin-user';
import { formatRelativeDate } from '@/lib/money';
import { inviteAdmin, setAdminRole, setAdminStatus } from './actions';

type SearchParams = Promise<{ error?: string; ok?: string }>;

export default async function TeamPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const me = await requireAdmin();
  const { error, ok } = await searchParams;

  // Owner-only. Render a polite forbidden state for managers instead of
  // throwing — keeps the admin nav consistent and tells them why.
  if (me.role !== 'owner') {
    return (
      <div>
        <h1 className="text-2xl font-heading font-bold mb-2">Team</h1>
        <p className="text-sm text-muted-foreground">
          Owner-only. You&apos;re signed in as a manager, which has full
          operational access but can&apos;t manage the team. Ask Will to
          invite someone if needed.
        </p>
      </div>
    );
  }

  const users = await db.select().from(adminUser).orderBy(asc(adminUser.createdAt));

  return (
    <div>
      <h1 className="text-2xl font-heading font-bold mb-2">Team</h1>
      <p className="text-sm text-muted-foreground mb-4">
        Owner manages access. Invite by email — invitee visits /admin/login,
        enters their email, clicks the magic link, and the row binds
        automatically.
      </p>

      {error && (
        <Banner>
          <strong className="text-foreground">Couldn&apos;t save:</strong> {error}
        </Banner>
      )}
      {ok && <Banner>Done.</Banner>}

      {/* Invite form */}
      <section className="mb-6">
        <h2 className="text-xs uppercase tracking-wide text-muted-foreground mb-2">
          Invite
        </h2>
        <form
          action={inviteAdmin}
          className="border border-border rounded p-3 grid grid-cols-1 sm:grid-cols-3 gap-2"
        >
          <label className="flex flex-col gap-1 sm:col-span-2">
            <span className="text-xs text-muted-foreground uppercase tracking-wide">Email</span>
            <input
              type="email"
              name="email"
              required
              placeholder="karynn@example.com"
              className="border border-border rounded px-3 py-2 bg-background"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs text-muted-foreground uppercase tracking-wide">Role</span>
            <select
              name="role"
              required
              defaultValue="manager"
              className="border border-border rounded px-3 py-2 bg-background"
            >
              <option value="manager">Manager</option>
              <option value="owner">Owner</option>
            </select>
          </label>
          <label className="flex flex-col gap-1 sm:col-span-2">
            <span className="text-xs text-muted-foreground uppercase tracking-wide">Name (optional)</span>
            <input
              type="text"
              name="name"
              placeholder="Karynn"
              className="border border-border rounded px-3 py-2 bg-background"
            />
          </label>
          <button
            type="submit"
            className="sm:col-span-3 bg-primary text-primary-foreground rounded px-4 py-2 font-medium hover:opacity-90 mt-1"
          >
            Send invite
          </button>
        </form>
      </section>

      {/* User list */}
      <section>
        <h2 className="text-xs uppercase tracking-wide text-muted-foreground mb-2">
          Current ({users.length})
        </h2>
        <ul className="border-y border-border -mx-4 divide-y divide-border">
          {users.map((u) => (
            <li key={u.id} className="px-4 py-3">
              <div className="flex items-baseline justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <div className="font-medium truncate">
                    {u.name ?? u.email}
                    {u.id === me.id && (
                      <span className="ml-2 text-xs text-muted-foreground">(you)</span>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground font-mono truncate">
                    {u.email}
                  </div>
                </div>
                <StatusBadge status={u.status} role={u.role} />
              </div>
              <div className="flex items-center justify-between mt-2 text-xs text-muted-foreground gap-2">
                <span>
                  {u.lastSignInAt
                    ? `Last in ${formatRelativeDate(u.lastSignInAt)}`
                    : 'Never signed in'}
                </span>
                {u.id !== me.id && <RowActions userId={u.id} role={u.role} status={u.status} />}
              </div>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

function RowActions({
  userId,
  role,
  status,
}: {
  userId: string;
  role: 'owner' | 'manager';
  status: 'invited' | 'active' | 'disabled';
}) {
  return (
    <div className="flex items-center gap-3">
      {role === 'manager' && (
        <form action={setAdminRole.bind(null, userId, 'owner')}>
          <button type="submit" className="underline hover:text-foreground">
            Promote to owner
          </button>
        </form>
      )}
      {role === 'owner' && (
        <form action={setAdminRole.bind(null, userId, 'manager')}>
          <button type="submit" className="underline hover:text-foreground">
            Demote to manager
          </button>
        </form>
      )}
      {status !== 'disabled' && (
        <form action={setAdminStatus.bind(null, userId, 'disabled')}>
          <button type="submit" className="underline hover:text-foreground">
            Disable
          </button>
        </form>
      )}
      {status === 'disabled' && (
        <form action={setAdminStatus.bind(null, userId, 'active')}>
          <button type="submit" className="underline hover:text-foreground">
            Re-enable
          </button>
        </form>
      )}
    </div>
  );
}

function StatusBadge({
  status,
  role,
}: {
  status: 'invited' | 'active' | 'disabled';
  role: 'owner' | 'manager';
}) {
  const cls =
    status === 'active'
      ? 'bg-primary text-primary-foreground'
      : status === 'invited'
        ? 'border border-border text-foreground'
        : 'bg-muted text-muted-foreground';
  return (
    <span className={`text-xs px-2 py-0.5 rounded font-medium ${cls}`}>
      {role} · {status}
    </span>
  );
}

function Banner({ children }: { children: React.ReactNode }) {
  return (
    <div className="border border-border rounded p-3 mb-4 text-sm bg-muted text-muted-foreground">
      {children}
    </div>
  );
}
