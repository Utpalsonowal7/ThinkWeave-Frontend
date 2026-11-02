import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { post, request } from '../api';
import { errorText } from '../components';
import { Icon } from '../icons';
import type { BoardSync } from './useBoardSync';
type Task = { id: string; title: string; description: string; week: number; dependsOn: string[] };
type Result = {
  title?: string;
  tasks?: Task[];
  nodes?: Array<{ id: string; label: string }>;
  edges?: Array<{ id: string; source: string; target: string; label: string }>;
  content?: string;
  sourceIds?: string[];
};
type Proposal = {
  id: string;
  kind: string;
  revision: number;
  stale?: boolean;
  createdAt: string;
  result: Result;
};
const actions = [
  { id: 'tasks', name: 'Extract tasks', detail: 'Turn ideas into actionable work', icon: 'task' },
  { id: 'roadmap', name: 'Build a roadmap', detail: 'Plan the next few weeks', icon: 'grid' },
  { id: 'diagram', name: 'Create a diagram', detail: 'Make connections visible', icon: 'shape' },
  {
    id: 'summary',
    name: 'Summarize this board',
    detail: 'Find the signal in the details',
    icon: 'document',
  },
  {
    id: 'explanation',
    name: 'Explain the architecture',
    detail: 'Understand components and tradeoffs',
    icon: 'link',
  },
];
export function Assistant({
  boardId,
  sync,
  selected,
  demo,
  focus,
}: {
  boardId: string;
  sync: BoardSync;
  selected: string[];
  demo: boolean;
  focus: (id: string) => void;
}) {
  const [action, setAction] = useState('roadmap'),
    [prompt, setPrompt] = useState(''),
    [weeks, setWeeks] = useState(6),
    [onlySelected, setOnlySelected] = useState(true);
  const [proposal, setProposal] = useState<Proposal | null>(null),
    [pending, setPending] = useState<Proposal[]>([]),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const load = useCallback(async () => {
    if (demo || !sync.canEdit) return;
    try {
      setPending(await request<Proposal[]>(`/api/v1/boards/${boardId}/ai/proposals`));
    } catch (e) {
      setError(errorText(e));
    }
  }, [boardId, demo, sync.canEdit]);
  useEffect(() => {
    void load();
  }, [load, sync.eventVersion]);
  async function generate(e: FormEvent) {
    e.preventDefault();
    if (!sync.canEdit || demo || sync.dirty) return;
    setBusy(true);
    setError('');
    try {
      const p = await post<Proposal>(`/api/v1/boards/${boardId}/ai/proposals`, {
        action,
        prompt,
        ...(action === 'roadmap' ? { weeks } : {}),
        ...(selected.length && onlySelected ? { selectionIds: selected } : {}),
      });
      setProposal(p);
      await load();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }
  async function review(approve: boolean) {
    if (!proposal) return;
    setBusy(true);
    setError('');
    try {
      await post(
        `/api/v1/boards/${boardId}/ai/proposals/${proposal.id}/${approve ? 'apply' : 'reject'}`,
      );
      setProposal(null);
      await load();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }
  const stale = !!proposal && (proposal.stale || proposal.revision !== sync.revision);
  return (
    <div className="panel-content assistant-panel">
      <div className="assistant-intro">
        <span className="ai-orb">
          <Icon name="spark" size={26} />
        </span>
        <h3>
          A thinking partner,
          <br />
          right on your board.
        </h3>
        <p>Find clarity, explore connections, and turn a good idea into a next step.</p>
      </div>
      {error && (
        <div className="notice" role="alert">
          {error}
        </div>
      )}
      {proposal ? (
        <>
          <div className="section-label">
            <span>{proposal.kind.toLowerCase()}</span>
            <button className="text-button" onClick={() => setProposal(null)}>
              Back
            </button>
          </div>
          <div className="proposal-preview">
            <h3>{proposal.result.title ?? 'Proposed changes'}</h3>
            {proposal.result.tasks?.map((task, i) =>
              typeof task === 'string' ? (
                <p key={i}>{task}</p>
              ) : (
                <article className="proposal-task" key={task.id}>
                  <span className="tag">Week {task.week}</span>
                  <strong>{task.title}</strong>
                  <p>{task.description}</p>
                  {!!task.dependsOn.length && (
                    <small className="muted">Depends on: {task.dependsOn.join(', ')}</small>
                  )}
                </article>
              ),
            )}
            {proposal.result.nodes?.map((n) => (
              <div className="diagram-preview-node" key={n.id}>
                <Icon name="shape" />
                {n.label}
              </div>
            ))}
            {proposal.result.edges?.map((e) => (
              <p className="small muted" key={e.id}>
                {proposal.result.nodes?.find((n) => n.id === e.source)?.label} →{' '}
                {proposal.result.nodes?.find((n) => n.id === e.target)?.label}
                {e.label ? ` · ${e.label}` : ''}
              </p>
            ))}
            {proposal.result.content && <p className="report-text">{proposal.result.content}</p>}
            <div className="source-chips">
              {proposal.result.sourceIds?.map((id) => (
                <button key={id} className="tag" onClick={() => focus(id)}>
                  View source ↗
                </button>
              ))}
            </div>
          </div>
          {stale && (
            <div className="notice">
              The board changed after this proposal. Generate a new one before applying.
            </div>
          )}
          <p className="small muted">Review the content. Nothing changes until you approve.</p>
          <div className="action-row">
            <button
              className="button secondary"
              disabled={busy || !sync.canEdit}
              onClick={() => void review(false)}
            >
              Discard
            </button>
            <button
              className="button ai-button"
              disabled={busy || stale || sync.dirty || !sync.connected || !sync.canEdit}
              onClick={() => void review(true)}
            >
              <Icon name="check" />
              {busy ? 'Working…' : 'Add to board'}
            </button>
          </div>
        </>
      ) : (
        <form onSubmit={generate} className="stack">
          <div className="ai-actions">
            {actions.map((a) => (
              <button
                type="button"
                key={a.id}
                className={`ai-action ${action === a.id ? 'active' : ''}`}
                onClick={() => setAction(a.id)}
                aria-pressed={action === a.id}
              >
                <Icon name={a.icon} />
                <span>
                  <strong>{a.name}</strong>
                  <small>{a.detail}</small>
                </span>
                <span className="radio-dot" />
              </button>
            ))}
          </div>
          {action === 'roadmap' && (
            <label>
              Plan over
              <select value={weeks} onChange={(e) => setWeeks(Number(e.target.value))}>
                {[1, 2, 3, 4, 6, 8, 10, 12].map((n) => (
                  <option key={n} value={n}>
                    {n} {n === 1 ? 'week' : 'weeks'}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label>
            Give it a little direction
            <textarea
              maxLength={2000}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="What would you like to explore?"
            />
          </label>
          {selected.length > 0 && (
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={onlySelected}
                onChange={(e) => setOnlySelected(e.target.checked)}
              />
              Use only {selected.length} selected object(s)
            </label>
          )}
          <small className="muted">
            {demo
              ? 'AI is available in connected workspaces. This demo does not call Gemini.'
              : sync.dirty
                ? 'Wait for your changes to save before generating.'
                : `${selected.length && onlySelected ? 'Selected content' : 'This board’s content'} will be sent to Gemini. You’ll review the result before it is added.`}
          </small>
          <button
            className="button ai-button full"
            disabled={busy || demo || !sync.canEdit || !sync.connected || sync.dirty}
          >
            <Icon name="spark" />
            {busy ? 'Thinking it through…' : 'Generate proposal'}
          </button>
        </form>
      )}
      {!!pending.length && !proposal && (
        <section className="pending-plans">
          <div className="section-label">
            Waiting for your review <span>{pending.length}</span>
          </div>
          {pending.map((p) => (
            <button key={p.id} className="pending-plan" onClick={() => setProposal(p)}>
              <Icon name="spark" />
              <span>
                {p.result.title ?? p.kind.toLowerCase()}
                <small>
                  {p.stale || p.revision !== sync.revision
                    ? 'Board changed · regenerate'
                    : 'Ready for review'}
                </small>
              </span>
              <Icon name="arrow" size={15} />
            </button>
          ))}
        </section>
      )}
    </div>
  );
}
