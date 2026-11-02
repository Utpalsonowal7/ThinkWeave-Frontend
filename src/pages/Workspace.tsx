import { useState, useEffect, useCallback, type FormEvent } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { post, request } from '../api';
import type { BoardInfo, User, Membership } from '../types';
import { Message, errorText } from '../components';
import { Icon } from '../icons';
import { SemanticSearch } from '../canvas/Search';
type Member = { userId: string; role: string; user: { name: string; email: string } };
type Invitation = { id: string; email: string; role: string; expiresAt: string };
export function WorkspacePage({ user }: { user: User }) {
  const { workspaceId = '' } = useParams(),
    [params, setParams] = useSearchParams();
  const tab = params.get('tab') ?? 'boards';
  const [boards, setBoards] = useState<BoardInfo[]>([]),
    [members, setMembers] = useState<Member[]>([]),
    [archive, setArchive] = useState<BoardInfo[]>([]),
    [invitations, setInvitations] = useState<Invitation[]>([]);
  const [name, setName] = useState('Workspace'),
    [title, setTitle] = useState(''),
    [message, setMessage] = useState(''),
    [busy, setBusy] = useState(false),
    [loading, setLoading] = useState(true),
    [filter, setFilter] = useState('');
  const actorRole = members.find((m) => m.userId === user.id)?.role,
    manager = actorRole === 'OWNER' || actorRole === 'ADMIN';
  const load = useCallback(async () => {
    try {
      const [b, m, spaces] = await Promise.all([
        request<BoardInfo[]>(`/api/v1/workspaces/${workspaceId}/boards`),
        request<Member[]>(`/api/v1/workspaces/${workspaceId}/members`),
        request<Membership[]>('/api/v1/workspaces'),
      ]);
      setBoards(b);
      setMembers(m);
      setName(spaces.find((s) => s.workspace.id === workspaceId)?.workspace.name ?? 'Workspace');
      const role = m.find((x) => x.userId === user.id)?.role;
      if (role === 'OWNER' || role === 'ADMIN') {
        const [a, i] = await Promise.all([
          request<BoardInfo[]>(`/api/v1/workspaces/${workspaceId}/archived-boards`),
          request<Invitation[]>(`/api/v1/workspaces/${workspaceId}/invitations`),
        ]);
        setArchive(a);
        setInvitations(i);
      }
    } catch (e) {
      setMessage(errorText(e));
    } finally {
      setLoading(false);
    }
  }, [workspaceId, user.id]);
  useEffect(() => {
    void load();
  }, [load]);
  async function run(action: () => Promise<unknown>) {
    setBusy(true);
    setMessage('');
    try {
      await action();
      await load();
    } catch (e) {
      setMessage(errorText(e));
    } finally {
      setBusy(false);
    }
  }
  async function create(e: FormEvent) {
    e.preventDefault();
    await run(async () => {
      await post(`/api/v1/workspaces/${workspaceId}/boards`, { title });
      setTitle('');
    });
  }
  async function invite(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget,
      data = new FormData(form);
    await run(async () => {
      await post(`/api/v1/workspaces/${workspaceId}/invitations`, {
        email: data.get('email'),
        role: data.get('role'),
      });
      form.reset();
      setMessage('Invitation sent.');
    });
  }
  const visible = boards.filter((b) => b.title.toLowerCase().includes(filter.toLowerCase()));
  return (
    <main className="container workspace-page">
      <Link className="back" to="/">
        ← All workspaces
      </Link>
      <div className="page-head compact">
        <div>
          <span className="eyebrow">A SHARED SPACE FOR GOOD IDEAS</span>
          <h1>
            {name}
            <span className="accent">.</span>
          </h1>
          <p className="muted">Bring the big picture into focus.</p>
        </div>
        <div className="workspace-stat">
          <Icon name="people" size={22} />
          <strong>{members.length}</strong>
          <span>{members.length === 1 ? 'teammate' : 'teammates'}</span>
        </div>
      </div>
      <Message>{message}</Message>
      <div className="workspace-tabs" aria-label="Workspace sections">
        {['boards', 'team', 'search', ...(manager ? ['archive'] : [])].map((id) => (
          <button
            key={id}
            className={tab === id ? 'active' : ''}
            onClick={() => setParams({ tab: id })}
          >
            <Icon
              name={
                id === 'team'
                  ? 'people'
                  : id === 'search'
                    ? 'search'
                    : id === 'archive'
                      ? 'history'
                      : 'grid'
              }
              size={16}
            />
            {id[0].toUpperCase() + id.slice(1)}
            {id === 'boards' && <span>{boards.length}</span>}
          </button>
        ))}
      </div>
      {tab === 'search' ? (
        <div className="workspace-search">
          <SemanticSearch workspaceId={workspaceId} />
        </div>
      ) : tab === 'team' ? (
        <div className="team-layout">
          <section className="panel">
            <div className="section-head">
              <h2>The people behind the ideas</h2>
              <span className="count">{members.length} MEMBERS</span>
            </div>
            {members.map((m) => (
              <div className="team-member" key={m.userId}>
                <span className="avatar">{m.user.name[0]}</span>
                <div className="member-info">
                  <strong>
                    {m.user.name}
                    {m.userId === user.id ? ' (you)' : ''}
                  </strong>
                  <small>{m.user.email}</small>
                </div>
                {m.userId !== user.id &&
                m.role !== 'OWNER' &&
                (actorRole === 'OWNER' || (actorRole === 'ADMIN' && m.role !== 'ADMIN')) ? (
                  <div className="member-actions">
                    <select
                      disabled={busy}
                      aria-label={`Role for ${m.user.name}`}
                      value={m.role}
                      onChange={(e) =>
                        void run(() =>
                          post(`/api/v1/workspaces/${workspaceId}/members/${m.userId}/role`, {
                            role: e.target.value,
                          }),
                        )
                      }
                    >
                      <option>EDITOR</option>
                      <option>VIEWER</option>
                      {actorRole === 'OWNER' && <option>ADMIN</option>}
                    </select>
                    <button
                      className="icon-button danger"
                      title="Remove member"
                      aria-label={`Remove ${m.user.name}`}
                      disabled={busy}
                      onClick={() => {
                        if (confirm(`Remove ${m.user.name} from this workspace?`))
                          void run(() =>
                            post(`/api/v1/workspaces/${workspaceId}/members/${m.userId}/remove`),
                          );
                      }}
                    >
                      <Icon name="close" size={16} />
                    </button>
                    {actorRole === 'OWNER' && (
                      <button
                        className="text-button"
                        disabled={busy}
                        onClick={() => {
                          if (
                            confirm(
                              `Transfer ownership to ${m.user.name}? You will become an admin.`,
                            )
                          )
                            void run(() =>
                              post(`/api/v1/workspaces/${workspaceId}/owner`, { userId: m.userId }),
                            );
                        }}
                      >
                        Make owner
                      </button>
                    )}
                  </div>
                ) : (
                  <span className="tag">{m.role.toLowerCase()}</span>
                )}
              </div>
            ))}
            {manager && !!invitations.length && (
              <section className="pending-invitations">
                <h3>Invited, not yet joined</h3>
                {invitations.map((i) => (
                  <div className="invitation-row" key={i.id}>
                    <div>
                      <strong>{i.email}</strong>
                      <small>
                        {i.role.toLowerCase()} · expires{' '}
                        {new Date(i.expiresAt).toLocaleDateString()}
                      </small>
                    </div>
                    <button
                      className="text-button danger"
                      disabled={busy}
                      onClick={() =>
                        void run(() =>
                          post(`/api/v1/workspaces/${workspaceId}/invitations/${i.id}/revoke`),
                        )
                      }
                    >
                      Revoke
                    </button>
                  </div>
                ))}
              </section>
            )}
          </section>
          {manager && (
            <aside className="side-panel invite-panel">
              <span className="eyebrow">BETTER TOGETHER</span>
              <h2>
                Make room for
                <br />
                one more.
              </h2>
              <p className="muted">Invite a teammate to your thinking space.</p>
              <form onSubmit={invite} className="stack">
                <label>
                  Email address
                  <input type="email" required name="email" placeholder="teammate@example.com" />
                </label>
                <label>
                  Permission
                  <select name="role">
                    <option value="EDITOR">Editor · can create and edit</option>
                    <option value="VIEWER">Viewer · can explore</option>
                  </select>
                </label>
                <button className="button primary" disabled={busy}>
                  Send invitation <Icon name="arrow" size={16} />
                </button>
              </form>
            </aside>
          )}
        </div>
      ) : tab === 'archive' && manager ? (
        <section className="panel">
          <h2>A pause, not a goodbye.</h2>
          <p className="muted">Archived boards stay here until you need them again.</p>
          {archive.map((b) => (
            <div className="board-row" key={b.id}>
              <span className="board-icon tone-1">
                <Icon name="history" />
              </span>
              <div>
                <strong>{b.title}</strong>
                <small>
                  Archived {b.archivedAt ? new Date(b.archivedAt).toLocaleDateString() : ''}
                </small>
              </div>
              <button
                className="button secondary compact-button"
                disabled={busy}
                onClick={() => void run(() => post(`/api/v1/boards/${b.id}/unarchive`))}
              >
                Restore board
              </button>
            </div>
          ))}
          {!archive.length && <div className="empty-state">Nothing archived. A clean slate.</div>}
        </section>
      ) : (
        <>
          <div className="boards-heading">
            <div>
              <h2>Your boards</h2>
              <p className="muted small">A place for every possibility.</p>
            </div>
            <div className="board-filter">
              <Icon name="search" size={16} />
              <input
                aria-label="Filter boards by title"
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                placeholder="Find a board…"
              />
            </div>
          </div>
          {actorRole && actorRole !== 'VIEWER' && (
            <form className="create-bar" onSubmit={create}>
              <input
                required
                maxLength={100}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="What will you work on?"
                aria-label="New board title"
              />
              <button className="button primary" disabled={busy}>
                <Icon name="plus" size={16} />
                Create board
              </button>
            </form>
          )}
          {loading ? (
            <div className="loading-state">Gathering your boards…</div>
          ) : (
            <div className="boards-grid">
              {visible.map((b, i) => (
                <Link className="canvas-card" to={`/board/${b.id}`} key={b.id}>
                  <div className={`board-thumbnail thumb-${i % 3}`} aria-hidden="true">
                    <span className="thumb-note" />
                    <span className="thumb-document">
                      <i />
                      <i />
                      <i />
                    </span>
                    <span className="thumb-shape" />
                    <svg viewBox="0 0 300 130">
                      <path
                        d="M100 45C160 45 160 95 220 95"
                        fill="none"
                        stroke="#a4b4a0"
                        strokeWidth="1.5"
                      />
                    </svg>
                  </div>
                  <div className="canvas-card-info">
                    <h3>{b.title}</h3>
                    <Icon name="arrow" size={17} />
                    <small>
                      {b.updatedAt
                        ? `Updated ${new Date(b.updatedAt).toLocaleDateString()}`
                        : 'Collaborative canvas'}
                    </small>
                  </div>
                </Link>
              ))}
              {!visible.length && (
                <div className="empty-state">
                  {filter
                    ? 'No boards match that title.'
                    : 'Your next big idea deserves a board. Create your first one above.'}
                </div>
              )}
            </div>
          )}
        </>
      )}
    </main>
  );
}
