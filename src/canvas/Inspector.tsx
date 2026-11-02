import { useRef, useState } from 'react';
import * as Y from 'yjs';
import { Icon } from '../icons';
import { palette, patchObject, replaceText, type CanvasObject } from './model';
import type { BoardSync } from './useBoardSync';
export function RichBody({ object }: { object: CanvasObject }) {
  return (
    <div className="rich-body">
      {object.bodyDelta.map((part, i) => {
        if (typeof part.insert !== 'string') return null;
        const a = part.attributes ?? {},
          text = (
            <span
              style={{
                fontWeight: a.bold ? 700 : undefined,
                fontStyle: a.italic ? 'italic' : undefined,
                textDecoration: [
                  a.underline ? 'underline' : '',
                  a.strike ? 'line-through' : '',
                ].join(' '),
                fontFamily: a.code ? 'monospace' : undefined,
                background: a.code ? '#eef0e9' : undefined,
                fontSize: a.header ? '1.15em' : undefined,
              }}
            >
              {part.insert}
            </span>
          );
        let safe = false;
        try {
          safe =
            typeof a.link === 'string' && ['https:', 'http:'].includes(new URL(a.link).protocol);
        } catch {
          /* render text */
        }
        return safe ? (
          <a
            key={i}
            href={String(a.link)}
            target="_blank"
            rel="noopener noreferrer"
            className="nodrag"
          >
            {text}
          </a>
        ) : (
          <span key={i}>{text}</span>
        );
      })}
    </div>
  );
}
export function Inspector({
  object,
  sync,
  remove,
}: {
  object?: CanvasObject;
  sync: BoardSync;
  remove: () => void;
}) {
  const area = useRef<HTMLTextAreaElement>(null);
  const [link, setLink] = useState('');
  if (!object)
    return (
      <div className="panel-empty">
        <div className="empty-symbol">
          <Icon name="note" size={28} />
        </div>
        <h3>A little space to think.</h3>
        <p>Add an idea, a document, or a diagram. Select an object to make it your own.</p>
        <div className="shortcut-list">
          <span>
            Pan canvas <kbd>Space + drag</kbd>
          </span>
          <span>
            Select multiple <kbd>Shift + click</kbd>
          </span>
          <span>
            Undo <kbd>Ctrl / ⌘ Z</kbd>
          </span>
        </div>
      </div>
    );
  const patch = (changes: Record<string, unknown>) =>
    sync.change((doc) => patchObject(doc, object.id, changes));
  function format(attributes: Record<string, unknown>) {
    const el = area.current;
    if (!el || el.selectionStart === el.selectionEnd) {
      sync.setError('Select text in the document field to format it.');
      return;
    }
    const start = el.selectionStart,
      length = el.selectionEnd - start;
    sync.change((doc) => {
      const body = doc.getMap<Y.Map<unknown>>('nodes').get(object!.id)?.get('body');
      if (!(body instanceof Y.Text) || body.toString() !== object!.body)
        throw new Error('The document changed. Select the latest text again.');
      body.format(start, length, attributes);
    });
    el.focus();
    el.setSelectionRange(start, start + length);
  }
  return (
    <div className="inspector-fields">
      <div className="object-kind">
        <Icon name={object.kind === 'sticky' ? 'note' : object.kind} />
        {object.kind === 'sticky' ? 'Sticky note' : object.kind}
      </div>
      <label>
        {object.kind === 'sticky' ? 'Your idea' : 'Title'}
        <textarea
          className="title-input"
          rows={3}
          maxLength={object.legacy ? 1000 : 200}
          value={object.title}
          disabled={!sync.canEdit}
          onChange={(e) => patch({ title: e.target.value })}
        />
      </label>
      {!object.legacy && (
        <>
          <label>
            Content
            <textarea
              ref={area}
              className="document-input"
              rows={8}
              maxLength={100000}
              value={object.body}
              disabled={!sync.canEdit}
              onChange={(e) => {
                const value = e.target.value;
                sync.change((doc) => replaceText(doc, object.id, value, object.body));
              }}
              placeholder="Put your thinking into words…"
            />
          </label>
          <div className="format-tools" aria-label="Format selected text">
            {[
              ['B', 'bold'],
              ['I', 'italic'],
              ['U', 'underline'],
              ['S', 'strike'],
              ['⌘', 'code'],
            ].map(([label, key]) => (
              <button
                key={key}
                disabled={!sync.canEdit}
                title={key}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => format({ [key!]: true })}
              >
                {label}
              </button>
            ))}
            <button
              disabled={!sync.canEdit}
              title="Clear formatting"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() =>
                format({
                  bold: null,
                  italic: null,
                  underline: null,
                  strike: null,
                  code: null,
                  link: null,
                  header: null,
                  list: null,
                })
              }
            >
              Tx
            </button>
          </div>
          <div className="inline-form">
            <input
              aria-label="Link for selected text"
              placeholder="https://…"
              value={link}
              onChange={(e) => setLink(e.target.value)}
            />
            <button
              className="icon-button"
              disabled={!sync.canEdit}
              aria-label="Link selected text"
              onClick={() => {
                try {
                  const u = new URL(link);
                  if (!['http:', 'https:'].includes(u.protocol) || u.username || u.password)
                    throw new Error();
                  format({ link });
                } catch {
                  sync.setError('Enter a valid HTTP or HTTPS link.');
                }
              }}
            >
              <Icon name="link" />
            </button>
          </div>
        </>
      )}
      {object.kind === 'shape' && (
        <label>
          Shape
          <select
            value={object.shape ?? 'rectangle'}
            disabled={!sync.canEdit}
            onChange={(e) => patch({ shape: e.target.value })}
          >
            <option value="rectangle">Rectangle</option>
            <option value="ellipse">Ellipse</option>
            <option value="diamond">Diamond</option>
          </select>
        </label>
      )}
      {object.kind === 'task' && (
        <>
          <label>
            Status
            <select
              value={object.status ?? 'TODO'}
              disabled={!sync.canEdit}
              onChange={(e) => patch({ status: e.target.value })}
            >
              <option value="TODO">To do</option>
              <option value="IN_PROGRESS">In progress</option>
              <option value="DONE">Done</option>
            </select>
          </label>
          <label>
            Week
            <input
              type="number"
              min={1}
              max={52}
              value={object.week ?? 1}
              disabled={!sync.canEdit}
              onChange={(e) => {
                const n = Number(e.target.value);
                if (Number.isInteger(n) && n >= 1 && n <= 52) patch({ week: n });
              }}
            />
          </label>
          <fieldset className="dependency-picker">
            <legend>Depends on</legend>
            {sync.objects
              .filter((o) => o.kind === 'task' && o.id !== object.id)
              .map((o) => (
                <label className="checkbox-label" key={o.id}>
                  <input
                    type="checkbox"
                    checked={object.dependsOn?.includes(o.id) ?? false}
                    disabled={
                      !sync.canEdit ||
                      (!object.dependsOn?.includes(o.id) && (object.dependsOn?.length ?? 0) >= 50)
                    }
                    onChange={(e) =>
                      patch({
                        dependsOn: e.target.checked
                          ? [...(object.dependsOn ?? []), o.id]
                          : (object.dependsOn ?? []).filter((id) => id !== o.id),
                      })
                    }
                  />
                  {o.title || 'Untitled task'}
                </label>
              ))}
            {!sync.objects.some((o) => o.kind === 'task' && o.id !== object.id) && (
              <small className="muted">Add another task to connect a dependency.</small>
            )}
          </fieldset>
        </>
      )}
      <label>
        Color
        <div className="color-palette">
          {palette.map((color) => (
            <button
              key={color}
              aria-label={`Set color ${color}`}
              aria-pressed={object.color === color}
              disabled={!sync.canEdit}
              className={object.color === color ? 'selected' : ''}
              style={{ background: color }}
              onClick={() => patch({ color })}
            />
          ))}
        </div>
      </label>
      <div className="position-fields">
        <label>
          X
          <input
            type="number"
            min={-100000}
            max={100000}
            value={Math.round(object.x)}
            disabled={!sync.canEdit}
            onChange={(e) => {
              const n = Number(e.target.value);
              if (Number.isFinite(n) && Math.abs(n) <= 100000) patch({ x: n });
            }}
          />
        </label>
        <label>
          Y
          <input
            type="number"
            min={-100000}
            max={100000}
            value={Math.round(object.y)}
            disabled={!sync.canEdit}
            onChange={(e) => {
              const n = Number(e.target.value);
              if (Number.isFinite(n) && Math.abs(n) <= 100000) patch({ y: n });
            }}
          />
        </label>
      </div>
      <button className="button subtle danger" disabled={!sync.canEdit} onClick={remove}>
        <Icon name="trash" /> Delete object
      </button>
    </div>
  );
}
