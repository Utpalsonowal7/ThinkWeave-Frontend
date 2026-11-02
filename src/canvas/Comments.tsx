import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { post, request } from '../api';
import { errorText } from '../components';
import { Icon } from '../icons';
import type { BoardSync } from './useBoardSync';
type Comment = {
  id: string;
  body: string;
  authorId: string;
  author: { id: string; name: string };
  updatedAt: string;
  createdAt: string;
  deletedAt: string | null;
};
type Thread = {
  id: string;
  anchorId: string | null;
  resolvedAt: string | null;
  comments?: Comment[];
  _count?: { comments: number };
};
type Page<T> = { items: T[]; nextCursor: string | null };
export function Comments({
  boardId,
  sync,
  selected,
  userId,
  demo,
  focus,
}: {
  boardId: string;
  sync: BoardSync;
  selected: string[];
  userId: string;
  demo: boolean;
  focus: (id: string) => void;
}) {
  const [threads, setThreads] = useState<Thread[]>([]),
    [thread, setThread] = useState<Thread | null>(null),
    [comments, setComments] = useState<Comment[]>([]);
  const [cursor, setCursor] = useState<string | null>(null),
    [messageCursor, setMessageCursor] = useState<string | null>(null),
    [body, setBody] = useState(''),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [editing, setEditing] = useState<Comment | null>(null),
    [editBody, setEditBody] = useState('');
  const epoch = sync.access?.board.epoch ?? 0;
  const load = useCallback(
    async (after?: string) => {
      if (demo) return;
      try {
        const p = await request<Page<Thread>>(
          `/api/v1/boards/${boardId}/comments?limit=20${after ? `&cursor=${encodeURIComponent(after)}` : ''}`,
        );
        setThreads((old) => (after ? [...old, ...p.items] : p.items));
        setCursor(p.nextCursor);
      } catch (e) {
        setError(errorText(e));
      }
    },
    [boardId, demo],
  );
  const open = useCallback(
    async (id: string, after?: string) => {
      if (demo) return;
      try {
        const p = await request<Page<Comment> & { thread: Thread }>(
          `/api/v1/boards/${boardId}/comments/${id}?limit=20${after ? `&cursor=${encodeURIComponent(after)}` : ''}`,
        );
        setThread(p.thread);
        setComments((old) => (after ? [...old, ...p.items] : p.items));
        setMessageCursor(p.nextCursor);
      } catch (e) {
        setError(errorText(e));
      }
    },
    [boardId, demo],
  );
  useEffect(() => {
    void load();
    if (thread) void open(thread.id);
  }, [load, open, sync.eventVersion]);
  async function run(action: () => Promise<unknown>) {
    setBusy(true);
    setError('');
    try {
      await action();
      await load();
      if (thread) await open(thread.id);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }
  async function submit(e: FormEvent) {
    e.preventDefault();
    const text = body.trim();
    if (!text) return;
    await run(async () => {
      if (thread)
        await post(`/api/v1/boards/${boardId}/comments/${thread.id}/reply`, { epoch, body: text });
      else {
        const result = await post<Thread>(`/api/v1/boards/${boardId}/comments`, {
          epoch,
          body: text,
          ...(selected[0] ? { anchorId: selected[0] } : {}),
        });
        await open(result.id);
      }
      setBody('');
    });
  }
  const manager = ['OWNER', 'ADMIN'].includes(sync.access?.role ?? '');
  if (demo)
    return (
      <div className="panel-empty">
        <Icon name="comment" size={30} />
        <h3>Keep the conversation close.</h3>
        <p>
          Connected workspaces support anchored threads, replies, and resolved discussions. Sign in
          to collaborate with your team.
        </p>
      </div>
    );
  return (
    <div className="panel-content">
      <div className="section-label">
        {thread ? 'Discussion' : `${threads.length} threads`}
        {thread && (
          <button
            className="text-button"
            onClick={() => {
              setThread(null);
              setComments([]);
              setEditing(null);
            }}
          >
            All threads
          </button>
        )}
      </div>
      {error && (
        <div className="notice" role="alert">
          {error}
        </div>
      )}
      {thread ? (
        <>
          <div className="thread-heading">
            <span className="tag">{thread.resolvedAt ? 'Resolved' : 'Open'}</span>
            {thread.anchorId && (
              <button className="text-button" onClick={() => focus(thread.anchorId!)}>
                Go to object ↗
              </button>
            )}
            {sync.canEdit && (
              <button
                className="text-button"
                disabled={busy}
                onClick={() =>
                  void run(() =>
                    post(
                      `/api/v1/boards/${boardId}/comments/${thread.id}/${thread.resolvedAt ? 'reopen' : 'resolve'}`,
                      { epoch },
                    ),
                  )
                }
              >
                {thread.resolvedAt ? 'Reopen' : 'Resolve'}
              </button>
            )}
          </div>
          {[...comments].reverse().map((c) => (
            <article className="comment-card" key={c.id}>
              <div className="comment-by">
                <span className="avatar small-avatar">{c.author.name[0]}</span>
                <strong>{c.author.name}</strong>
                <time>{new Date(c.createdAt).toLocaleDateString()}</time>
              </div>
              {editing?.id === c.id ? (
                <form
                  className="stack"
                  onSubmit={(e) => {
                    e.preventDefault();
                    void run(async () => {
                      await post(`/api/v1/boards/${boardId}/comment-messages/${c.id}/edit`, {
                        epoch,
                        updatedAt: c.updatedAt,
                        body: editBody,
                      });
                      setEditing(null);
                    });
                  }}
                >
                  <textarea
                    maxLength={5000}
                    required
                    value={editBody}
                    onChange={(e) => setEditBody(e.target.value)}
                  />
                  <button className="button primary" disabled={busy}>
                    Save edit
                  </button>
                  <button type="button" className="text-button" onClick={() => setEditing(null)}>
                    Cancel
                  </button>
                </form>
              ) : (
                <p className={c.deletedAt ? 'muted' : ''}>
                  {c.deletedAt ? 'This comment was deleted.' : c.body}
                </p>
              )}
              {!c.deletedAt && sync.canEdit && (
                <div className="comment-actions">
                  {c.authorId === userId && (
                    <button
                      className="text-button"
                      onClick={() => {
                        setEditing(c);
                        setEditBody(c.body);
                      }}
                    >
                      Edit
                    </button>
                  )}
                  {(c.authorId === userId || manager) && (
                    <button
                      className="text-button danger"
                      disabled={busy}
                      onClick={() => {
                        if (confirm('Delete this comment?'))
                          void run(() =>
                            post(`/api/v1/boards/${boardId}/comment-messages/${c.id}/delete`, {
                              epoch,
                              updatedAt: c.updatedAt,
                            }),
                          );
                      }}
                    >
                      Delete
                    </button>
                  )}
                </div>
              )}
            </article>
          ))}
          {messageCursor && (
            <button
              className="button secondary full"
              onClick={() => void open(thread.id, messageCursor)}
            >
              Earlier replies
            </button>
          )}
        </>
      ) : (
        <>
          {!threads.length && (
            <div className="panel-empty">
              <h3>Start a conversation.</h3>
              <p>Select an object to anchor a comment, or leave a thought about the whole board.</p>
            </div>
          )}
          {threads.map((t) => (
            <button
              key={t.id}
              className="thread-card"
              onClick={() => {
                setBody('');
                void open(t.id);
              }}
            >
              <div className="section-label">
                <span>{t.resolvedAt ? '✓ Resolved' : 'Open discussion'}</span>
                <span>{t._count?.comments ?? 1} replies</span>
              </div>
              <p>{t.comments?.[0]?.deletedAt ? 'Deleted comment' : t.comments?.[0]?.body}</p>
              <small>{t.comments?.[0]?.author.name}</small>
            </button>
          ))}
          {cursor && (
            <button className="button secondary full" onClick={() => void load(cursor)}>
              More threads
            </button>
          )}
        </>
      )}
      {sync.canEdit && !thread?.resolvedAt && (
        <form className="comment-compose stack" onSubmit={submit}>
          <label>
            {thread ? 'Your reply' : selected.length ? 'Comment on selection' : 'Comment on board'}
            <textarea
              required
              maxLength={5000}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Leave a thoughtful note…"
            />
          </label>
          <button className="button primary" disabled={busy || !body.trim() || !sync.connected}>
            {busy ? 'Sending…' : thread ? 'Send reply' : 'Start thread'}
            <Icon name="arrow" />
          </button>
          <small className="muted">Comments are sent when you’re online.</small>
        </form>
      )}
    </div>
  );
}
