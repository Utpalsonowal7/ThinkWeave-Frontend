import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { io, type Socket } from 'socket.io-client';
import * as Y from 'yjs';
import { IndexeddbPersistence } from 'y-indexeddb';
import { API, request, refreshSession } from '../api';
import type { BoardAccess, User } from '../types';
import { LOCAL, downloadJSON, project, seedDemo } from './model';
export type Member = {
  id: string;
  userId: string;
  name: string;
  role?: string;
  cursor?: { x: number; y: number };
  selectionIds?: string[];
};
type Ack = {
  ok: boolean;
  state?: Uint8Array;
  vector?: Uint8Array;
  role?: BoardAccess['role'];
  revision?: number;
  code?: string;
  message?: string;
  transferId?: string;
  chunkBytes?: number;
};
export function useBoardSync(boardId: string, user: User, demo: boolean) {
  const [access, setAccess] = useState<BoardAccess | null>(null),
    [error, setError] = useState('');
  const [status, setStatus] = useState('Opening your board…'),
    [stale, setStale] = useState(false),
    [dirty, setDirty] = useState(false);
  const [frame, setFrame] = useState(0),
    [eventVersion, setEventVersion] = useState(0),
    [revision, setRevision] = useState(0);
  const [members, setMembers] = useState<Member[]>([]),
    [scope, setScope] = useState('local'),
    [connected, setConnected] = useState(false);
  const [undoState, setUndoState] = useState({ undo: false, redo: false });
  const docRef = useRef<Y.Doc | null>(null),
    socketRef = useRef<Socket | null>(null),
    undoRef = useRef<Y.UndoManager | null>(null);
  const permitRef = useRef(false),
    dirtyRef = useRef(false),
    blockedRef = useRef(false);
  const epoch = access?.board.epoch;
  useEffect(() => {
    let live = true;
    setAccess(null);
    setError('');
    if (demo) {
      setAccess({
        board: {
          id: boardId,
          title: 'The next big idea',
          workspaceId: 'demo',
          epoch: 0,
          revision: 0,
        },
        role: 'OWNER',
      });
      return;
    }
    void request<BoardAccess>(`/api/v1/boards/${boardId}`)
      .then((data) => {
        if (live) {
          setAccess(data);
          setRevision(data.board.revision ?? 0);
        }
      })
      .catch((e) => {
        if (live) setError(e instanceof Error ? e.message : 'Unable to open board.');
      });
    return () => {
      live = false;
    };
  }, [boardId, demo]);
  useEffect(() => {
    if (epoch === undefined) return;
    let disposed = false,
      joined = false,
      inFlight = false,
      generation = 0,
      counter = 0,
      timer: ReturnType<typeof setTimeout> | undefined,
      metadataTimer: ReturnType<typeof setTimeout> | undefined;
    let storageAvailable = true;
    let vector: Uint8Array = new Uint8Array([0]),
      role = access!.role;
    permitRef.current = false;
    blockedRef.current = false;
    setStale(false);
    setMembers([]);
    setDirty(false);
    dirtyRef.current = false;
    const doc = new Y.Doc();
    doc.getMap('notes');
    doc.getMap('nodes');
    doc.getMap('edges');
    docRef.current = doc;
    let persistence: IndexeddbPersistence | null = null;
    try {
      persistence = new IndexeddbPersistence(
        `thinkweave:${demo ? 'demo-v2' : user.id}:${boardId}:${epoch}`,
        doc,
      );
    } catch {
      storageAvailable = false;
    }
    const undo = new Y.UndoManager(
      [doc.getMap('notes'), doc.getMap('nodes'), doc.getMap('edges')],
      { trackedOrigins: new Set([LOCAL]), captureTimeout: 500 },
    );
    undoRef.current = undo;
    const render = () => {
      if (!disposed) {
        setFrame((v) => v + 1);
        setUndoState({ undo: undo.canUndo(), redo: undo.canRedo() });
      }
    };
    const setPending = (value: boolean) => {
      dirtyRef.current = value;
      setDirty(value);
    };
    const socket = demo
      ? null
      : io(API, { withCredentials: true, transports: ['websocket'], autoConnect: false });
    socketRef.current = socket;
    const ack = (event: string, payload: unknown) =>
      new Promise<Ack>((resolve, reject) => {
        socket!.timeout(20000).emit(event, payload, (err: Error | null, result?: Ack) => {
          if (err || !result?.ok)
            reject(
              new Error(
                result?.message ?? 'Changes could not be saved. Your local copy is preserved.',
              ),
            );
          else resolve(result);
        });
      });
    async function flush() {
      if (
        disposed ||
        !joined ||
        inFlight ||
        !dirtyRef.current ||
        blockedRef.current ||
        role === 'VIEWER' ||
        !socket
      )
        return;
      const session = generation,
        sent = counter,
        capturedVector = Y.encodeStateVector(doc),
        update = Y.encodeStateAsUpdate(doc, vector);
      inFlight = true;
      setStatus('Saving changes…');
      try {
        if (update.byteLength > 8 * 1024 * 1024)
          throw new Error(
            'This board exceeds the sync limit. Export your local copy before splitting it into smaller boards.',
          );
        let result: Ack;
        if (update.byteLength <= 256 * 1024) result = await ack('board:update', update);
        else {
          const start = await ack('board:sync:start', { bytes: update.byteLength });
          const size = start.chunkBytes ?? 131072;
          result = start;
          for (let offset = 0, index = 0; offset < update.length; offset += size, index++) {
            if (session !== generation || disposed) return;
            result = await ack('board:sync:chunk', {
              transferId: start.transferId,
              index,
              data: update.slice(offset, offset + size),
            });
          }
        }
        if (session !== generation || disposed) return;
        vector = capturedVector;
        if (result.revision !== undefined) setRevision((v) => Math.max(v, result.revision!));
        setPending(counter !== sent);
        setStatus(counter === sent ? 'All changes saved' : 'Saving changes…');
      } catch (e) {
        if (session === generation && !disposed) {
          setError(e instanceof Error ? e.message : 'Sync failed.');
          setStatus('Not synced · retry required');
        }
      } finally {
        if (session === generation) {
          inFlight = false;
          if (counter !== sent && joined) timer = setTimeout(() => void flush(), 180);
        }
      }
    }
    function updated(_update: Uint8Array, origin: unknown) {
      render();
      if (origin !== LOCAL && origin !== undo) return;
      counter++;
      if (demo) {
        setStatus(storageAvailable ? 'Saved on this browser' : 'Demo · session-only changes');
        if (!storageAvailable) setPending(true);
        return;
      }
      setPending(true);
      setStatus(
        joined
          ? 'Saving changes…'
          : storageAvailable
            ? 'Offline · changes saved locally'
            : 'Offline · unsaved changes in this tab',
      );
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => void flush(), 180);
    }
    doc.on('update', updated);
    undo.on('stack-item-added', render);
    undo.on('stack-item-popped', render);
    undo.on('stack-cleared', render);
    const block = (message: string) => {
      blockedRef.current = true;
      permitRef.current = false;
      setStale(true);
      setStatus('Board needs attention');
      setError(message);
    };
    if (socket) {
      socket.on('connect', () => {
        joined = false;
        inFlight = false;
        generation++;
        setStatus('Syncing your board…');
        setConnected(true);
        socket
          .timeout(15000)
          .emit('board:join', { boardId, epoch }, (err: Error | null, reply?: Ack) => {
            if (disposed) return;
            if (reply?.code === 'STALE_VERSION') {
              block('This board was restored. Export unsynced local changes before reloading.');
              return;
            }
            if (err || !reply?.ok || !reply.state || !reply.vector) {
              setStatus('Could not join board');
              setError(reply?.message ?? 'Unable to join this board.');
              return;
            }
            Y.applyUpdate(doc, new Uint8Array(reply.state), 'remote');
            vector = new Uint8Array(reply.vector);
            role = reply.role ?? 'VIEWER';
            permitRef.current = role !== 'VIEWER';
            joined = true;
            setAccess((a) => (a ? { ...a, role } : a));
            setRevision(reply.revision ?? 0);
            const canonical = new Y.Doc();
            Y.applyUpdate(canonical, new Uint8Array(reply.state));
            const remoteState = Y.encodeStateAsUpdate(canonical),
              localState = Y.encodeStateAsUpdate(doc);
            canonical.destroy();
            const different =
              localState.length !== remoteState.length ||
              localState.some((value, i) => value !== remoteState[i]);
            if (role === 'VIEWER' && different) {
              setPending(true);
              setStatus('View only · local changes not uploaded');
              setError('You now have view-only access. Export your local changes for recovery.');
            } else if (role !== 'VIEWER' && different) {
              counter++;
              setPending(true);
              void flush();
            } else {
              setPending(false);
              setStatus(role === 'VIEWER' ? 'Connected · view only' : 'All changes saved');
            }
          });
      });
      socket.on('board:update', (update: Uint8Array) => {
        try {
          Y.applyUpdate(doc, new Uint8Array(update), 'remote');
        } catch {
          setError('An update could not be read. Export your local copy and reconnect.');
        }
      });
      socket.on('board:changed', (v: { revision: number; eventVersion: number }) => {
        setRevision((n) => Math.max(n, v.revision));
        setEventVersion(v.eventVersion);
        if (metadataTimer) clearTimeout(metadataTimer);
        metadataTimer = setTimeout(() => {
          void request<BoardAccess>(`/api/v1/boards/${boardId}`)
            .then((next) => {
              if (disposed) return;
              if (next.board.epoch !== epoch) {
                block('The board version changed. Export unsynced local work before reloading.');
                return;
              }
              setAccess(next);
            })
            .catch(() => undefined);
        }, 500);
      });
      socket.on('board:role', (next: BoardAccess['role']) => {
        role = next;
        permitRef.current = next !== 'VIEWER' && !blockedRef.current;
        setAccess((a) => (a ? { ...a, role: next } : a));
      });
      socket.on('board:members', (data: { members: Member[]; scope: string }) => {
        setMembers(data.members);
        setScope(data.scope);
      });
      socket.on('board:cursor', (p: { id: string; name: string; x: number; y: number }) =>
        setMembers((all) => [
          ...all.filter((m) => m.id !== p.id),
          {
            ...(all.find((m) => m.id === p.id) ?? { id: p.id, userId: '', name: p.name }),
            cursor: { x: p.x, y: p.y },
          },
        ]),
      );
      socket.on('board:selection', (p: { id: string; name: string; ids: string[] }) =>
        setMembers((all) => all.map((m) => (m.id === p.id ? { ...m, selectionIds: p.ids } : m))),
      );
      socket.on('board:member-left', (p: { id: string }) =>
        setMembers((all) => all.filter((m) => m.id !== p.id)),
      );
      socket.on('board:restored', () =>
        block(
          'A snapshot was restored. Export unsynced local changes, then reload the new board version.',
        ),
      );
      socket.on('board:unavailable', () =>
        block('This board is no longer available. Your local copy can still be exported.'),
      );
      socket.on('disconnect', (reason: string) => {
        joined = false;
        generation++;
        inFlight = false;
        setConnected(false);
        setMembers([]);
        if (!blockedRef.current) {
          setStatus('Offline · changes stay on this device');
          if (reason === 'io server disconnect')
            void refreshSession().then((ok) => {
              if (ok && !disposed && !blockedRef.current) socket.connect();
            });
        }
      });
      socket.on('connect_error', () => {
        setConnected(false);
        setStatus('Unable to connect · retry sync');
        if (!socket.active && !blockedRef.current)
          void refreshSession().then((ok) => {
            if (ok && !disposed) socket.connect();
          });
      });
    }
    void (persistence?.whenSynced ?? Promise.reject(new Error('Browser storage unavailable')))
      .then(() => {
        if (disposed) return;
        if (demo) {
          if (!doc.getMap('nodes').size && !doc.getMap('notes').size) seedDemo(doc);
          permitRef.current = true;
          setConnected(true);
          setStatus('Local demo · saved on this browser');
          render();
        } else {
          permitRef.current = role !== 'VIEWER';
          render();
          socket?.connect();
        }
      })
      .catch(() => {
        storageAvailable = false;
        if (!disposed) {
          setError(
            'Browser storage is unavailable. Keep this tab open and export unsaved work before leaving.',
          );
          if (demo) {
            seedDemo(doc);
            permitRef.current = true;
            setConnected(true);
            render();
          } else socket?.connect();
        }
      });
    return () => {
      disposed = true;
      generation++;
      if (timer) clearTimeout(timer);
      if (metadataTimer) clearTimeout(metadataTimer);
      socket?.disconnect();
      undo.destroy();
      void persistence?.destroy();
      doc.destroy();
      docRef.current = null;
      socketRef.current = null;
      undoRef.current = null;
    };
  }, [boardId, epoch, user.id, demo]);
  useEffect(() => {
    const prevent = (e: BeforeUnloadEvent) => {
      if (dirtyRef.current) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', prevent);
    return () => window.removeEventListener('beforeunload', prevent);
  }, []);
  const change = useCallback((fn: (doc: Y.Doc) => void) => {
    if (!docRef.current || !permitRef.current || blockedRef.current) return;
    try {
      docRef.current.transact(() => fn(docRef.current!), LOCAL);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to update object.');
    }
  }, []);
  const exportLocal = () => {
    const doc = docRef.current;
    if (doc)
      downloadJSON('thinkweave-local-recovery.json', {
        format: 'thinkweave-local-recovery-v2',
        boardId,
        epoch,
        savedAt: new Date().toISOString(),
        state: Array.from(Y.encodeStateAsUpdate(doc)),
        ...project(doc),
      });
  };
  const retry = async () => {
    if (!blockedRef.current) {
      setError('');
      socketRef.current?.disconnect();
      await refreshSession();
      socketRef.current?.connect();
    }
  };
  const content = useMemo(
    () => (docRef.current ? project(docRef.current) : { objects: [], links: [] }),
    [frame, epoch, boardId],
  );
  return {
    access,
    setAccess,
    error,
    setError,
    status,
    stale,
    dirty,
    connected,
    members,
    scope,
    revision,
    eventVersion,
    frame,
    docRef,
    socketRef,
    undoRef,
    undoState,
    change,
    exportLocal,
    retry,
    canEdit: !!access && access.role !== 'VIEWER' && !stale,
    objects: content.objects,
    links: content.links,
  };
}
export type BoardSync = ReturnType<typeof useBoardSync>;
