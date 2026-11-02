import * as Y from 'yjs';
export const LOCAL = Symbol('thinkweave-local');
export const palette = ['#fff1ad', '#e2eddd', '#e7e6fa', '#fbe4da', '#e1eef5', '#ffffff'];
export type Kind = 'sticky' | 'document' | 'shape' | 'task' | 'group';
export type CanvasObject = {
  id: string;
  kind: Kind;
  title: string;
  body: string;
  bodyDelta: Array<{ insert?: unknown; attributes?: Record<string, unknown> }>;
  x: number;
  y: number;
  width?: number;
  height?: number;
  color?: string;
  shape?: string;
  status?: string;
  week?: number;
  dependsOn?: string[];
  legacy?: boolean;
};
export type Wire = { source: string; target: string; label?: string; kind?: string };
export function project(doc: Y.Doc): {
  objects: CanvasObject[];
  links: Array<Wire & { id: string }>;
} {
  const objects: CanvasObject[] = [];
  doc.getMap<Y.Map<unknown>>('notes').forEach((map, id) => {
    const n = map.toJSON();
    objects.push({
      ...n,
      id,
      kind: 'sticky',
      title: String(n.text ?? ''),
      body: '',
      bodyDelta: [],
      x: n.x,
      y: n.y,
      legacy: true,
    });
  });
  doc.getMap<Y.Map<unknown>>('nodes').forEach((map, id) => {
    const n = map.toJSON(),
      body = map.get('body');
    objects.push({
      ...n,
      id,
      kind: n.kind,
      title: String(n.title ?? ''),
      body: body instanceof Y.Text ? body.toString() : '',
      bodyDelta: body instanceof Y.Text ? body.toDelta() : [],
      x: n.x,
      y: n.y,
    });
  });
  const ids = new Set(objects.map((o) => o.id)),
    links: Array<Wire & { id: string }> = [];
  doc.getMap<Wire>('edges').forEach((edge, id) => {
    if (ids.has(edge.source) && ids.has(edge.target)) links.push({ ...edge, id });
  });
  return { objects, links };
}
export function addObject(doc: Y.Doc, kind: Kind, point: { x: number; y: number }, title?: string) {
  const id = crypto.randomUUID(),
    map = new Y.Map<unknown>();
  map.set('kind', kind);
  map.set(
    'title',
    title ??
      {
        sticky: 'A new idea',
        document: 'Untitled document',
        shape: 'Component',
        task: 'New task',
        group: 'Section',
      }[kind],
  );
  map.set('x', Math.round(point.x));
  map.set('y', Math.round(point.y));
  map.set('body', new Y.Text());
  if (kind === 'sticky') map.set('color', palette[0]);
  if (kind === 'document') {
    map.set('width', 310);
    map.set('height', 250);
  }
  if (kind === 'shape') map.set('shape', 'rectangle');
  if (kind === 'task') map.set('status', 'TODO');
  if (kind === 'group') {
    map.set('width', 400);
    map.set('height', 280);
  }
  doc.getMap('nodes').set(id, map);
  return id;
}
export function patchObject(doc: Y.Doc, id: string, patch: Record<string, unknown>) {
  const node = doc.getMap<Y.Map<unknown>>('nodes').get(id),
    legacy = doc.getMap<Y.Map<unknown>>('notes').get(id);
  const map = node ?? legacy;
  if (!map) return;
  for (const [key, value] of Object.entries(patch))
    map.set(!node && key === 'title' ? 'text' : key, value);
}
export function replaceText(doc: Y.Doc, id: string, next: string, expected: string) {
  const body = doc.getMap<Y.Map<unknown>>('nodes').get(id)?.get('body');
  if (!(body instanceof Y.Text)) return;
  const previous = body.toString();
  if (previous !== expected)
    throw new Error(
      'This document changed while you were editing. Review the latest text and try again.',
    );
  let start = 0;
  while (start < previous.length && start < next.length && previous[start] === next[start]) start++;
  let end = 0;
  while (
    end < previous.length - start &&
    end < next.length - start &&
    previous[previous.length - end - 1] === next[next.length - end - 1]
  )
    end++;
  if (previous.length - start - end) body.delete(start, previous.length - start - end);
  if (next.length - start - end) body.insert(start, next.slice(start, next.length - end));
}
export function removeObjects(doc: Y.Doc, ids: string[], edgeIds: string[]) {
  const edges = doc.getMap<Wire>('edges');
  ids.forEach((id) => {
    doc.getMap('nodes').delete(id);
    doc.getMap('notes').delete(id);
  });
  edgeIds.forEach((id) => edges.delete(id));
  edges.forEach((e, id) => {
    if (ids.includes(e.source) || ids.includes(e.target)) edges.delete(id);
  });
  doc.getMap<Y.Map<unknown>>('nodes').forEach((n) => {
    const deps = n.get('dependsOn');
    if (Array.isArray(deps))
      n.set(
        'dependsOn',
        deps.filter((id) => !ids.includes(id)),
      );
  });
}
export function downloadJSON(filename: string, data: unknown) {
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }),
  );
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function seedDemo(doc: Y.Doc) {
  doc.transact(() => {
    const brief = addObject(doc, 'document', { x: 70, y: 100 }, 'Make space for the next big idea');
    const body = doc.getMap<Y.Map<unknown>>('nodes').get(brief)!.get('body') as Y.Text;
    body.insert(
      0,
      'A shared space for clear thinking.\n\nCollect the messy ideas. Connect the dots. Build something together.\n\nSelect any object to edit it →',
    );
    body.format(0, 34, { bold: true });
    const note = addObject(
      doc,
      'sticky',
      { x: 440, y: 80 },
      'What if getting from idea to action felt a little easier?',
    );
    patchObject(doc, note, { width: 225, height: 180, color: '#fff1ad' });
    const api = addObject(doc, 'shape', { x: 450, y: 365 }, 'Shared canvas');
    const data = addObject(doc, 'shape', { x: 760, y: 365 }, 'One source of truth');
    patchObject(doc, data, { shape: 'ellipse', color: '#e2eddd' });
    doc
      .getMap('edges')
      .set(crypto.randomUUID(), { source: api, target: data, label: 'stays in sync' });
    const task = addObject(doc, 'task', { x: 760, y: 100 }, 'Map out the first milestone');
    patchObject(doc, task, { week: 1, color: '#e7e6fa' });
    (doc.getMap<Y.Map<unknown>>('nodes').get(task)!.get('body') as Y.Text).insert(
      0,
      'Start small. Make the next step clear.',
    );
  }, LOCAL);
}
