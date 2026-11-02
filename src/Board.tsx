import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  Handle,
  Position,
  ViewportPortal,
  NodeResizer,
  applyNodeChanges,
  applyEdgeChanges,
  type Node,
  type NodeProps,
  type Edge,
  type ReactFlowInstance,
  type Connection,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { post } from './api';
import type { User } from './types';
import { Icon } from './icons';
import {
  addObject,
  patchObject,
  removeObjects,
  type CanvasObject,
  type Kind,
} from './canvas/model';
import { useBoardSync } from './canvas/useBoardSync';
import { Inspector, RichBody } from './canvas/Inspector';
import { EdgeInspector } from './canvas/EdgeInspector';
import { Assistant } from './canvas/Assistant';
import { Comments } from './canvas/Comments';
import { History } from './canvas/History';
import { SemanticSearch } from './canvas/Search';
type ObjectNode = Node<
  {
    object: CanvasObject;
    selectedBy: string[];
    canEdit: boolean;
    resize: (id: string, width: number, height: number) => void;
  },
  'object'
>;
const CanvasNode = memo(function CanvasNode({ data, selected }: NodeProps<ObjectNode>) {
  const { object: o } = data;
  return (
    <div
      className={`canvas-object kind-${o.kind} shape-${o.shape ?? 'rectangle'} ${selected ? 'is-selected' : ''} ${data.selectedBy.length ? 'remote-selected' : ''}`}
      style={{
        background:
          o.kind === 'shape'
            ? undefined
            : (o.color ?? (o.kind === 'sticky' ? '#fff1ad' : '#ffffff')),
        width: '100%',
        height: '100%',
      }}
    >
      <NodeResizer
        isVisible={selected && data.canEdit && !o.legacy}
        minWidth={160}
        minHeight={100}
        maxWidth={1200}
        maxHeight={1200}
        onResizeEnd={(_, p) => data.resize(o.id, Math.round(p.width), Math.round(p.height))}
      />
      <Handle type="target" position={Position.Left} isConnectable={data.canEdit} />
      {o.kind === 'shape' ? (
        <>
          <svg
            className="shape-art"
            viewBox="0 0 200 120"
            preserveAspectRatio="none"
            aria-hidden="true"
          >
            {o.shape === 'ellipse' ? (
              <ellipse
                cx="100"
                cy="60"
                rx="98"
                ry="58"
                fill={o.color ?? '#ffffff'}
                stroke="#a3b7a6"
              />
            ) : o.shape === 'diamond' ? (
              <polygon
                points="100,2 198,60 100,118 2,60"
                fill={o.color ?? '#ffffff'}
                stroke="#a3b7a6"
              />
            ) : (
              <rect
                x="1"
                y="1"
                width="198"
                height="118"
                rx="12"
                fill={o.color ?? '#ffffff'}
                stroke="#a3b7a6"
              />
            )}
          </svg>
          <strong className="shape-title">{o.title}</strong>
        </>
      ) : (
        <>
          <div className="object-eyebrow">
            <Icon name={o.kind === 'sticky' ? 'note' : o.kind} size={13} />
            <span>
              {o.kind === 'sticky'
                ? 'A little thought'
                : o.kind === 'task'
                  ? `Week ${o.week ?? 1}`
                  : o.kind}
            </span>
            {o.kind === 'task' && (
              <span className={`task-badge ${o.status?.toLowerCase()}`}>
                {
                  (
                    { TODO: 'To do', IN_PROGRESS: 'In progress', DONE: 'Done' } as Record<
                      string,
                      string
                    >
                  )[o.status ?? 'TODO']
                }
              </span>
            )}
          </div>
          <h3>{o.title || 'Untitled'}</h3>
          {o.body && <RichBody object={o} />}
          {o.kind === 'document' && (
            <div className="document-footer">
              {o.body.length} characters <span>↗</span>
            </div>
          )}
        </>
      )}
      {data.selectedBy.length > 0 && (
        <span className="selected-by">{data.selectedBy.join(', ')}</span>
      )}
      <Handle type="source" position={Position.Right} isConnectable={data.canEdit} />
    </div>
  );
});
const nodeTypes = { object: CanvasNode };
const tabs = [
  { id: 'properties', name: 'Object', icon: 'settings' },
  { id: 'comments', name: 'Comments', icon: 'comment' },
  { id: 'ai', name: 'Assistant', icon: 'spark' },
  { id: 'history', name: 'History', icon: 'history' },
  { id: 'search', name: 'Search', icon: 'search' },
];
export function Board({ user, demo = false }: { user: User; demo?: boolean }) {
  const { boardId = 'local-demo' } = useParams(),
    [params] = useSearchParams(),
    navigate = useNavigate();
  const sync = useBoardSync(boardId, user, demo);
  const [nodes, setNodes] = useState<ObjectNode[]>([]),
    [edges, setEdges] = useState<Edge[]>([]),
    [instance, setInstance] = useState<ReactFlowInstance<ObjectNode, Edge> | null>(null);
  const [selected, setSelected] = useState<string[]>([]),
    [selectedEdges, setSelectedEdges] = useState<string[]>([]),
    [tab, setTab] = useState('properties'),
    [panelOpen, setPanelOpen] = useState(true),
    [menu, setMenu] = useState(false),
    [renaming, setRenaming] = useState(false),
    [name, setName] = useState('');
  const selectedRef = useRef<string[]>([]),
    edgeRef = useRef<string[]>([]),
    cursorAt = useRef(0),
    focusDone = useRef(''),
    autoFit = useRef(false);
  const focus = useCallback(
    (id: string) => {
      if (!instance || !instance.getNode(id)) {
        sync.setError('That object is no longer on this board.');
        return;
      }
      setNodes((old) => old.map((n) => ({ ...n, selected: n.id === id })));
      setSelected([id]);
      selectedRef.current = [id];
      void instance.fitView({ nodes: [{ id }], padding: 1, maxZoom: 1.1, duration: 350 });
    },
    [instance, sync.setError],
  );
  const resize = useCallback(
    (id: string, width: number, height: number) =>
      sync.change((doc) => patchObject(doc, id, { width, height })),
    [sync.change],
  );
  useEffect(() => {
    const currentMembers = sync.members.filter((m) => m.id !== sync.socketRef.current?.id);
    setNodes((previous) =>
      sync.objects.map((o) => ({
        id: o.id,
        type: 'object',
        position: previous.find((n) => n.id === o.id)?.dragging
          ? previous.find((n) => n.id === o.id)!.position
          : { x: o.x, y: o.y },
        dragging: previous.find((n) => n.id === o.id)?.dragging,
        selected: selectedRef.current.includes(o.id),
        style: {
          width: o.width ?? (o.kind === 'shape' ? 205 : o.kind === 'task' ? 245 : 220),
          height:
            o.height ??
            (o.kind === 'shape' ? 110 : o.kind === 'task' ? 170 : o.kind === 'sticky' ? 185 : 240),
          zIndex: o.kind === 'group' ? -1 : 0,
        },
        data: {
          object: o,
          canEdit: sync.canEdit,
          selectedBy: currentMembers
            .filter((m) => m.selectionIds?.includes(o.id))
            .map((m) => m.name.split(' ')[0]),
          resize,
        },
      })),
    );
    const actual = sync.links.map((l) => ({
      id: l.id,
      source: l.source,
      target: l.target,
      label: l.label,
      selected: edgeRef.current.includes(l.id),
      style: { stroke: '#7c9580', strokeWidth: 1.6 },
      labelStyle: { fill: '#667561', fontSize: 11 },
      labelBgStyle: { fill: '#f8faf5' },
    }));
    const ids = new Set(actual.map((e) => e.id));
    sync.objects.forEach((o) =>
      o.dependsOn?.forEach((source) => {
        const id = `dependency:${source}:${o.id}`;
        if (!ids.has(id) && sync.objects.some((n) => n.id === source))
          actual.push({
            id,
            source,
            target: o.id,
            label: 'depends on',
            selected: false,
            style: { stroke: '#a9a1c3', strokeWidth: 1.6 },
            labelStyle: { fill: '#807391', fontSize: 11 },
            labelBgStyle: { fill: '#f8faf5' },
          });
      }),
    );
    setEdges(actual);
  }, [sync.frame, sync.members, sync.canEdit, resize]);
  useEffect(() => {
    if (instance && nodes.length && !autoFit.current) {
      autoFit.current = true;
      void instance.fitView({ padding: 0.18, maxZoom: 1, duration: 250 });
    }
    const target = params.get('focus');
    if (target && instance && nodes.some((n) => n.id === target) && focusDone.current !== target) {
      focusDone.current = target;
      focus(target);
    }
  }, [instance, nodes.length, params, focus]);
  const onSelection = useCallback(
    ({ nodes: chosen, edges: links }: { nodes: ObjectNode[]; edges: Edge[] }) => {
      const ids = chosen.map((n) => n.id),
        wires = links.map((e) => e.id);
      if (ids.join('|') !== selectedRef.current.join('|')) {
        selectedRef.current = ids;
        setSelected(ids);
        sync.socketRef.current?.emit('board:selection', { ids: ids.slice(0, 100) });
      }
      if (wires.join('|') !== edgeRef.current.join('|')) {
        edgeRef.current = wires;
        setSelectedEdges(wires);
      }
    },
    [sync.socketRef],
  );
  const remove = useCallback(() => {
    sync.change((doc) =>
      removeObjects(
        doc,
        selectedRef.current,
        edgeRef.current.filter((id) => !id.startsWith('dependency:')),
      ),
    );
    setSelected([]);
    setSelectedEdges([]);
    selectedRef.current = [];
    edgeRef.current = [];
  }, [sync.change]);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest('input,textarea,select,[contenteditable="true"]'))
        return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && sync.canEdit) {
        e.preventDefault();
        e.shiftKey ? sync.undoRef.current?.redo() : sync.undoRef.current?.undo();
      }
      if (e.key === 'Escape') {
        setPanelOpen(false);
        setMenu(false);
      }
      if (
        (e.key === 'Delete' || e.key === 'Backspace') &&
        sync.canEdit &&
        (selectedRef.current.length || edgeRef.current.length)
      ) {
        e.preventDefault();
        remove();
      }
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [sync.canEdit, sync.undoRef, remove]);
  function add(kind: Kind) {
    if (!instance) return;
    const pane = document.querySelector('.flow')?.getBoundingClientRect();
    if (!pane) return;
    const point = instance.screenToFlowPosition({
      x: pane.left + pane.width / 2,
      y: pane.top + pane.height / 2,
    });
    let id = '';
    sync.change((doc) => {
      id = addObject(doc, kind, point);
    });
    if (id) {
      setSelected([id]);
      selectedRef.current = [id];
      setTab('properties');
      setPanelOpen(true);
    }
  }
  function connect(c: Connection) {
    if (!c.source || !c.target || c.source === c.target) return;
    sync.change((doc) =>
      doc.getMap('edges').set(crypto.randomUUID(), { source: c.source!, target: c.target! }),
    );
  }
  async function rename() {
    try {
      if (demo) {
        sync.setAccess((a) => (a ? { ...a, board: { ...a.board, title: name.trim() } } : a));
      } else {
        const board = await post<{ title: string; revision: number }>(
          `/api/v1/boards/${boardId}/rename`,
          { title: name.trim() },
        );
        sync.setAccess((a) => (a ? { ...a, board: { ...a.board, ...board } } : a));
      }
      setRenaming(false);
    } catch (e) {
      sync.setError(e instanceof Error ? e.message : 'Unable to rename board.');
    }
  }
  const selectedObject =
      selected.length === 1 ? sync.objects.find((o) => o.id === selected[0]) : undefined,
    manager = ['OWNER', 'ADMIN'].includes(sync.access?.role ?? '');
  if (!sync.access)
    return (
      <main className="container">
        <Link to="/">← Workspaces</Link>
        <div className={sync.error ? 'notice' : 'loading-state'}>
          {sync.error || 'Opening your thinking space…'}
        </div>
      </main>
    );
  return (
    <main className={`board-page ${panelOpen ? '' : 'panel-collapsed'}`}>
      {demo && (
        <div className="demo-banner">
          <span>
            <strong>Local demo</strong> · Try the canvas. Your changes stay in this browser.
          </span>
          <Link to="/register">
            Create your workspace <Icon name="arrow" size={14} />
          </Link>
        </div>
      )}
      <header className="canvas-header">
        <div className="canvas-heading">
          <Link
            className="canvas-back"
            aria-label="Back to workspace"
            to={demo ? '/login' : `/workspace/${sync.access.board.workspaceId}`}
          >
            <Icon name="back" />
          </Link>
          <div>
            <div className="board-title-line">
              {renaming ? (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (name.trim()) void rename();
                  }}
                >
                  <input
                    autoFocus
                    aria-label="Board title"
                    maxLength={100}
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                  />
                  <button className="text-button">Save</button>
                  <button type="button" className="text-button" onClick={() => setRenaming(false)}>
                    Cancel
                  </button>
                </form>
              ) : (
                <>
                  <h2>{sync.access.board.title}</h2>
                  <button
                    className="icon-button"
                    aria-label="Board options"
                    aria-expanded={menu}
                    onClick={() => setMenu(!menu)}
                  >
                    <Icon name="more" />
                  </button>
                </>
              )}
              {menu && (
                <div className="board-menu">
                  <button
                    disabled={!sync.canEdit}
                    onClick={() => {
                      setName(sync.access!.board.title);
                      setRenaming(true);
                      setMenu(false);
                    }}
                  >
                    Rename board
                  </button>
                  <button
                    onClick={() => {
                      sync.exportLocal();
                      setMenu(false);
                    }}
                  >
                    Export recovery copy
                  </button>
                  {manager && !demo && (
                    <button
                      className="danger"
                      onClick={async () => {
                        if (sync.dirty) {
                          sync.setError('Wait for your changes to save before archiving.');
                          return;
                        }
                        if (
                          !confirm(
                            'Archive this board? You can restore it from the workspace archive.',
                          )
                        )
                          return;
                        try {
                          await post(`/api/v1/boards/${boardId}/archive`);
                          navigate(`/workspace/${sync.access!.board.workspaceId}`);
                        } catch (e) {
                          sync.setError(e instanceof Error ? e.message : 'Unable to archive.');
                        }
                      }}
                    >
                      Archive board
                    </button>
                  )}
                </div>
              )}
            </div>
            <div className="board-meta">
              <span className={`status-dot ${sync.connected ? 'connected' : ''}`} />
              {sync.status}
              <span className="meta-divider">·</span>
              {sync.access.role.toLowerCase()}
            </div>
          </div>
        </div>
        <div className="canvas-header-actions">
          <div className="presence-avatars">
            {demo ? (
              <span className="avatar" title="Just you in this demo">
                {user.name[0]}
              </span>
            ) : (
              sync.members.slice(0, 4).map((m) => (
                <span
                  className="avatar"
                  key={m.id}
                  title={`${m.name} · ${m.role?.toLowerCase() ?? 'member'}`}
                >
                  {m.name[0]}
                </span>
              ))
            )}
            <small>
              {demo
                ? 'Just you'
                : `${sync.members.length} here${sync.scope === 'local' ? ' · local' : ''}`}
            </small>
          </div>
          <button
            className="button secondary compact-button"
            onClick={() => {
              setTab('comments');
              setPanelOpen(true);
            }}
          >
            <Icon name="comment" />
            <span>Discuss</span>
          </button>
          <button
            className="button ai-button compact-button"
            onClick={() => {
              setTab('ai');
              setPanelOpen(true);
            }}
          >
            <Icon name="spark" />
            <span>Ask ThinkWeave</span>
          </button>
        </div>
      </header>
      {sync.error && (
        <div className="board-error" role="alert">
          <span>{sync.error}</span>
          <div>
            <button onClick={sync.exportLocal}>Export local copy</button>
            {sync.stale ? (
              <button
                onClick={() => {
                  if (
                    !sync.dirty ||
                    confirm('Have you exported unsynced changes? Reload the current board?')
                  )
                    location.reload();
                }}
              >
                Reload board
              </button>
            ) : (
              !demo && <button onClick={() => void sync.retry()}>Retry sync</button>
            )}
            <button aria-label="Dismiss message" onClick={() => sync.setError('')}>
              <Icon name="close" size={15} />
            </button>
          </div>
        </div>
      )}
      <div className="canvas-workspace">
        <section
          className="flow"
          aria-label="Collaborative canvas"
          onPointerMove={(e) => {
            if (!instance || Date.now() - cursorAt.current < 150) return;
            cursorAt.current = Date.now();
            sync.socketRef.current?.emit(
              'board:cursor',
              instance.screenToFlowPosition({ x: e.clientX, y: e.clientY }),
            );
          }}
        >
          <div className="creation-tools" aria-label="Add to canvas">
            {(
              [
                { kind: 'sticky', label: 'Sticky note', icon: 'note' },
                { kind: 'document', label: 'Document', icon: 'document' },
                { kind: 'shape', label: 'Diagram shape', icon: 'shape' },
                { kind: 'task', label: 'Task', icon: 'task' },
                { kind: 'group', label: 'Section', icon: 'group' },
              ] as const
            ).map((t) => (
              <button
                key={t.kind}
                aria-label={`Add ${t.label.toLowerCase()}`}
                title={t.label}
                disabled={!sync.canEdit}
                onClick={() => add(t.kind)}
              >
                <Icon name={t.icon} size={21} />
                <span>{t.label}</span>
              </button>
            ))}
            <div className="tool-separator" />
            <button
              aria-label="Undo"
              title="Undo"
              disabled={!sync.canEdit || !sync.undoState.undo}
              onClick={() => sync.undoRef.current?.undo()}
            >
              <Icon name="undo" />
            </button>
            <button
              aria-label="Redo"
              title="Redo"
              disabled={!sync.canEdit || !sync.undoState.redo}
              onClick={() => sync.undoRef.current?.redo()}
            >
              <Icon name="redo" />
            </button>
          </div>
          <ReactFlow<ObjectNode, Edge>
            nodeTypes={nodeTypes}
            nodes={nodes}
            edges={edges}
            onInit={setInstance}
            onNodesChange={(changes) => setNodes((old) => applyNodeChanges(changes, old))}
            onEdgesChange={(changes) => setEdges((old) => applyEdgeChanges(changes, old))}
            onNodeDragStop={(_, node) =>
              sync.change((doc) =>
                patchObject(doc, node.id, {
                  x: Math.max(-100000, Math.min(100000, Math.round(node.position.x))),
                  y: Math.max(-100000, Math.min(100000, Math.round(node.position.y))),
                }),
              )
            }
            onConnect={connect}
            onSelectionChange={onSelection}
            onNodeDoubleClick={() => {
              setTab('properties');
              setPanelOpen(true);
            }}
            nodesDraggable={sync.canEdit}
            nodesConnectable={sync.canEdit}
            elementsSelectable
            deleteKeyCode={null}
            multiSelectionKeyCode="Shift"
            minZoom={0.15}
            maxZoom={2}
            fitView
            panActivationKeyCode="Space"
            proOptions={{ hideAttribution: false }}
          >
            <Background gap={22} size={1} color="#d3dccd" />
            <Controls showInteractive={false} />
            <MiniMap
              pannable
              zoomable
              nodeColor={(n) => (n.data.object as CanvasObject).color ?? '#dfe9d8'}
              maskColor="#f5f7f1bb"
            />
            <ViewportPortal>
              {sync.members
                .filter((m) => m.id !== sync.socketRef.current?.id && m.cursor)
                .map((m) => (
                  <div
                    className="remote-cursor"
                    key={m.id}
                    style={{ transform: `translate(${m.cursor!.x}px,${m.cursor!.y}px)` }}
                  >
                    <span>➤</span>
                    <b>{m.name}</b>
                  </div>
                ))}
            </ViewportPortal>
          </ReactFlow>
          {!nodes.length && (
            <div className="canvas-empty">
              <Icon name="spark" size={36} />
              <h2>
                Every great idea
                <br />
                starts somewhere.
              </h2>
              <p>
                {sync.canEdit
                  ? 'Add your first note or document from the toolbar.'
                  : 'This board is waiting for its first idea.'}
              </p>
              {sync.canEdit && (
                <button className="button primary" onClick={() => add('sticky')}>
                  <Icon name="plus" />
                  Add your first idea
                </button>
              )}
            </div>
          )}
          <div className="canvas-bottom">
            <span>
              {nodes.length} objects · {edges.length} connections
            </span>
            {selected.length + selectedEdges.length > 0 ? (
              <span>
                {selected.length} selected{' '}
                <button className="text-button danger" disabled={!sync.canEdit} onClick={remove}>
                  Delete selection
                </button>
              </span>
            ) : (
              <span>Drag to move · Shift + click to select</span>
            )}
          </div>
          <button
            className="panel-toggle icon-button"
            aria-label={panelOpen ? 'Hide side panel' : 'Show side panel'}
            onClick={() => setPanelOpen(!panelOpen)}
          >
            <Icon name={panelOpen ? 'arrow' : 'back'} />
          </button>
        </section>
        <aside className={`editor-panel ${panelOpen ? 'is-open' : ''}`}>
          <div className="panel-tabs" role="tablist" aria-label="Board tools">
            {tabs.map((t) => (
              <button
                key={t.id}
                role="tab"
                aria-selected={tab === t.id}
                title={t.name}
                aria-label={t.name}
                className={tab === t.id ? 'active' : ''}
                onClick={() => setTab(t.id)}
              >
                <Icon name={t.icon} size={19} />
              </button>
            ))}
          </div>
          <div className="panel-title">
            <h3>
              {tabs.find((t) => t.id === tab)?.name}
              {tab === 'ai' && <span className="tag">Gemini</span>}
            </h3>
            <button
              className="icon-button mobile-close-panel"
              aria-label="Close tools"
              onClick={() => setPanelOpen(false)}
            >
              <Icon name="close" />
            </button>
          </div>
          <div className="panel-scroll" role="tabpanel">
            {tab === 'properties' &&
              (selectedEdges.length === 1 &&
              !selected.length &&
              sync.links.find((e) => e.id === selectedEdges[0]) ? (
                <EdgeInspector
                  edge={sync.links.find((e) => e.id === selectedEdges[0])!}
                  sync={sync}
                  remove={remove}
                />
              ) : (
                <Inspector object={selectedObject} sync={sync} remove={remove} />
              ))}
            {tab === 'comments' && (
              <Comments
                boardId={boardId}
                sync={sync}
                selected={selected}
                userId={user.id}
                demo={demo}
                focus={focus}
              />
            )}
            {tab === 'ai' && (
              <Assistant
                boardId={boardId}
                sync={sync}
                selected={selected}
                demo={demo}
                focus={focus}
              />
            )}
            {tab === 'history' && <History boardId={boardId} sync={sync} demo={demo} />}
            {tab === 'search' && (
              <SemanticSearch
                workspaceId={sync.access.board.workspaceId}
                boardId={boardId}
                sync={sync}
                demo={demo}
                focus={focus}
              />
            )}
          </div>
        </aside>
      </div>
    </main>
  );
}
