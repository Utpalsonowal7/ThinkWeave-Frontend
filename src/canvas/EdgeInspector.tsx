import { Icon } from '../icons';
import type { Wire } from './model';
import type { BoardSync } from './useBoardSync';
export function EdgeInspector({
  edge,
  sync,
  remove,
}: {
  edge: Wire & { id: string };
  sync: BoardSync;
  remove: () => void;
}) {
  const patch = (changes: Partial<Wire>) =>
    sync.change((doc) => {
      const map = doc.getMap<Wire>('edges');
      const current = map.get(edge.id);
      if (current) map.set(edge.id, { ...current, ...changes });
    });
  return (
    <div className="inspector-fields">
      <div className="object-kind">
        <Icon name="link" />
        Connection
      </div>
      <label>
        Label
        <input
          maxLength={200}
          value={edge.label ?? ''}
          disabled={!sync.canEdit}
          placeholder="How are these connected?"
          onChange={(e) => patch({ label: e.target.value })}
        />
      </label>
      <label>
        Relationship
        <select
          value={edge.kind ?? 'flow'}
          disabled={!sync.canEdit}
          onChange={(e) => patch({ kind: e.target.value })}
        >
          <option value="flow">Flow</option>
          <option value="dependency">Dependency</option>
        </select>
      </label>
      <div className="connection-endpoints">
        <strong>{sync.objects.find((o) => o.id === edge.source)?.title || 'Untitled'}</strong>
        <Icon name="arrow" />
        <strong>{sync.objects.find((o) => o.id === edge.target)?.title || 'Untitled'}</strong>
      </div>
      <p className="muted small">Remove this connection without deleting either object.</p>
      <button className="button subtle danger" disabled={!sync.canEdit} onClick={remove}>
        <Icon name="trash" />
        Delete connection
      </button>
    </div>
  );
}
