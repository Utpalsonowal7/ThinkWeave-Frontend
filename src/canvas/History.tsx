import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { post, request } from '../api';
import { errorText } from '../components';
import { Icon } from '../icons';
import type { CanvasObject } from './model';
import type { BoardSync } from './useBoardSync';
type Snapshot = {
  id: string;
  label: string | null;
  epoch: number;
  revision: number;
  createdAt: string;
};
type Activity = { id: string; kind: string; createdAt: string; actor: { name: string } | null };
type Page<T> = { items: T[]; nextCursor: string | null };
export function History({
  boardId,
  sync,
  demo,
}: {
  boardId: string;
  sync: BoardSync;
  demo: boolean;
}) {
  const [items, setItems] = useState<Snapshot[]>([]),
    [activities, setActivities] = useState<Activity[]>([]),
    [cursor, setCursor] = useState<string | null>(null),
    [activityCursor, setActivityCursor] = useState<string | null>(null),
    [label, setLabel] = useState(''),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(''),
    [preview, setPreview] = useState<(Snapshot & { nodes: CanvasObject[] }) | null>(null);
  const load = useCallback(
    async (after?: string) => {
      if (demo) return;
      try {
        const p = await request<Page<Snapshot>>(
          `/api/v1/boards/${boardId}/history?limit=20${after ? `&cursor=${encodeURIComponent(after)}` : ''}`,
        );
        setItems((old) => (after ? [...old, ...p.items] : p.items));
        setCursor(p.nextCursor);
      } catch (e) {
        setMessage(errorText(e));
      }
    },
    [boardId, demo],
  );
  const loadActivity = useCallback(
    async (after?: string) => {
      if (demo) return;
      try {
        const p = await request<Page<Activity>>(
          `/api/v1/boards/${boardId}/activity?limit=20${after ? `&cursor=${encodeURIComponent(after)}` : ''}`,
        );
        setActivities((old) => (after ? [...old, ...p.items] : p.items));
        setActivityCursor(p.nextCursor);
      } catch (e) {
        setMessage(errorText(e));
      }
    },
    [boardId, demo],
  );
  useEffect(() => {
    void load();
    void loadActivity();
  }, [load, loadActivity, sync.eventVersion]);
  async function save(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMessage('');
    try {
      await post(
        `/api/v1/boards/${boardId}/snapshots`,
        label.trim() ? { label: label.trim() } : {},
      );
      setLabel('');
      await load();
    } catch (e) {
      setMessage(errorText(e));
    } finally {
      setBusy(false);
    }
  }
  async function restore(snapshot: Snapshot) {
    if (
      !confirm(
        `Restore “${snapshot.label ?? 'Snapshot'}”? A recovery snapshot will be saved first. Export any unsynced local work before continuing.`,
      )
    )
      return;
    setBusy(true);
    try {
      await post(`/api/v1/boards/${boardId}/snapshots/${snapshot.id}/restore`, {
        epoch: sync.access?.board.epoch,
      });
      sync.setError('Snapshot restored. Export local changes if needed, then reload the board.');
    } catch (e) {
      setMessage(errorText(e));
    } finally {
      setBusy(false);
    }
  }
  const manager = ['OWNER', 'ADMIN'].includes(sync.access?.role ?? '');
  return (
    <div className="panel-content">
      <div className="section-label">A little peace of mind</div>
      <h3>Good ideas evolve.</h3>
      <p className="muted small">Save a version before you take a different direction.</p>
      {message && <div className="notice">{message}</div>}
      {demo && (
        <div className="notice">
          Version history is available in connected workspaces. You can export this demo locally.
        </div>
      )}
      <form className="stack snapshot-form" onSubmit={save}>
        <label>
          Version name
          <input
            maxLength={100}
            placeholder="Before the next big change"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
          />
        </label>
        <button
          className="button primary full"
          disabled={demo || busy || !sync.canEdit || sync.dirty || !sync.connected}
        >
          <Icon name="save" />
          Save version
        </button>
        {sync.dirty && <small className="muted">Waiting for your changes to save.</small>}
      </form>
      {preview && (
        <section className="snapshot-preview">
          <div className="section-label">
            Read-only preview
            <button className="text-button" onClick={() => setPreview(null)}>
              Close
            </button>
          </div>
          <h3>{preview.label ?? 'Untitled version'}</h3>
          <p className="small muted">
            {preview.nodes.length} objects · Version {preview.epoch}
          </p>
          {preview.nodes.slice(0, 30).map((n) => (
            <div className="snapshot-object" key={n.id}>
              <strong>{n.title}</strong>
              <p>{n.body?.slice(0, 200)}</p>
            </div>
          ))}
          {manager && (
            <button
              className="button secondary full"
              disabled={busy || sync.dirty}
              onClick={() => void restore(preview)}
            >
              Restore this version
            </button>
          )}
        </section>
      )}
      <div className="section-label">
        Saved versions <span>{items.length}</span>
      </div>
      {items.map((s) => (
        <div className="version-item" key={s.id}>
          <span className="version-dot" />
          <div>
            <strong>{s.label ?? 'Untitled version'}</strong>
            <small>{new Date(s.createdAt).toLocaleString()}</small>
            <div className="action-row">
              <button
                className="text-button"
                onClick={() => {
                  void request<Snapshot & { nodes: CanvasObject[] }>(
                    `/api/v1/boards/${boardId}/snapshots/${s.id}`,
                  )
                    .then(setPreview)
                    .catch((e) => setMessage(errorText(e)));
                }}
              >
                Preview
              </button>
              {manager && (
                <button
                  className="text-button"
                  disabled={busy || sync.dirty || !sync.connected}
                  onClick={() => void restore(s)}
                >
                  Restore
                </button>
              )}
            </div>
          </div>
        </div>
      ))}
      {!items.length && !demo && (
        <p className="muted small">Your first saved version will appear here.</p>
      )}
      {cursor && (
        <button className="button secondary full" onClick={() => void load(cursor)}>
          More versions
        </button>
      )}
      <button className="button secondary full export-button" onClick={sync.exportLocal}>
        <Icon name="download" />
        Export local recovery copy
      </button>
      {manager && !demo && (
        <button
          className="text-button"
          disabled={busy || sync.dirty}
          onClick={async () => {
            setBusy(true);
            try {
              await post(`/api/v1/boards/${boardId}/compact`);
              setMessage('Board storage compacted. Saved versions were preserved.');
            } catch (e) {
              setMessage(errorText(e));
            } finally {
              setBusy(false);
            }
          }}
        >
          Compact board storage
        </button>
      )}
      <div className="section-label activity-heading">Recent activity</div>
      {activities.map((a) => (
        <div className="activity-item" key={a.id}>
          <span className="avatar small-avatar">{a.actor?.name[0] ?? '✳'}</span>
          <div>
            <p>
              <strong>{a.actor?.name ?? 'System'}</strong> ·{' '}
              {a.kind.replaceAll('.', ' ').replaceAll('-', ' ')}
            </p>
            <small>{new Date(a.createdAt).toLocaleString()}</small>
          </div>
        </div>
      ))}
      {activityCursor && (
        <button className="button secondary full" onClick={() => void loadActivity(activityCursor)}>
          More activity
        </button>
      )}
    </div>
  );
}
