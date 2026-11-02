import { useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { post, request } from '../api';
import { errorText } from '../components';
import { Icon } from '../icons';
import type { BoardSync } from './useBoardSync';
type Hit = { id: string; boardId: string; title: string; content: string; sourceIds: string[] };
export function SemanticSearch({
  workspaceId,
  boardId,
  sync,
  demo = false,
  focus,
}: {
  workspaceId: string;
  boardId?: string;
  sync?: BoardSync;
  demo?: boolean;
  focus?: (id: string) => void;
}) {
  const [query, setQuery] = useState(''),
    [hits, setHits] = useState<Hit[]>([]),
    [busy, setBusy] = useState(false),
    [searched, setSearched] = useState(false),
    [message, setMessage] = useState(''),
    [index, setIndex] = useState<{
      status: string;
      indexedRevision?: number;
      revision?: number;
      lastError?: string;
    } | null>(null);
  useEffect(() => {
    if (!boardId || demo) return;
    let live = true;
    const load = () => {
      void request<typeof index>(`/api/v1/boards/${boardId}/search-index`)
        .then((v) => {
          if (live) setIndex(v);
        })
        .catch((e) => {
          if (live) setMessage(errorText(e));
        });
    };
    load();
    const timer = setInterval(load, 10000);
    return () => {
      live = false;
      clearInterval(timer);
    };
  }, [boardId, demo, sync?.eventVersion]);
  async function search(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMessage('');
    try {
      const result = await post<{ results: Hit[] }>(`/api/v1/workspaces/${workspaceId}/search`, {
        query,
        limit: 15,
      });
      setHits(result.results);
      setSearched(true);
    } catch (e) {
      setMessage(errorText(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="panel-content search-panel">
      <div className="search-intro">
        <Icon name="search" size={28} />
        <h3>
          Find the thought.
          <br />
          Not just the words.
        </h3>
        <p className="muted small">
          Search ideas, documents, and connections across this workspace.
        </p>
      </div>
      <form className="stack" onSubmit={search}>
        <label>
          What are you looking for?
          <input
            required
            maxLength={1000}
            placeholder="e.g. how authentication works"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
        <button className="button primary" disabled={demo || busy}>
          {busy ? 'Searching…' : 'Search workspace'}
          <Icon name="search" />
        </button>
      </form>
      {demo && (
        <div className="notice">
          Semantic search uses your connected workspace and Gemini embeddings. This demo stays on
          your device.
        </div>
      )}
      {message && (
        <div className="notice" role="alert">
          {message}
        </div>
      )}
      {index && (
        <div className="index-status">
          <span className="status-dot" />
          Board index: {index.status.toLowerCase()} {index.lastError && <p>{index.lastError}</p>}
          {sync?.canEdit && (
            <button
              className="text-button"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  await post(`/api/v1/boards/${boardId}/search-index`);
                  setIndex({ status: 'PENDING' });
                  setMessage('Indexing queued. The background worker will process this board.');
                } catch (e) {
                  setMessage(errorText(e));
                } finally {
                  setBusy(false);
                }
              }}
            >
              Reindex
            </button>
          )}
        </div>
      )}
      {searched && !hits.length && (
        <div className="panel-empty">
          <h3>No matching ideas yet.</h3>
          <p>Try a different phrase. Only the latest fully indexed board versions are included.</p>
        </div>
      )}
      {hits.map((hit) => (
        <article className="search-hit" key={hit.id}>
          <span className="eyebrow">{hit.title}</span>
          <p>{hit.content}</p>
          <div className="source-chips">
            {hit.sourceIds.slice(0, 5).map((id, i) =>
              hit.boardId === boardId && focus ? (
                <button className="text-button" key={id} onClick={() => focus(id)}>
                  Object {i + 1} ↗
                </button>
              ) : (
                <Link
                  className="text-button"
                  key={id}
                  to={`/board/${hit.boardId}?focus=${encodeURIComponent(id)}`}
                >
                  Open object {i + 1} ↗
                </Link>
              ),
            )}
          </div>
        </article>
      ))}
      <p className="search-footnote">
        Results stay within your workspace permissions. Boards may temporarily disappear from
        results while their latest changes are being indexed.
      </p>
    </div>
  );
}
