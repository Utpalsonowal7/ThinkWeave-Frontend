import { useState, useEffect, useCallback, type ReactNode } from 'react';
import { Link, NavLink, useNavigate, useLocation } from 'react-router-dom';
import { post, request } from './api';
import type { User, Membership } from './types';
import { Icon } from './icons';
export function Message({ children }: { children: ReactNode }) {
  return children ? (
    <div className="notice" role="status">
      {children}
    </div>
  ) : null;
}
export function errorText(error: unknown) {
  return error instanceof Error ? error.message : 'Something went wrong.';
}
export function Brand() {
  return (
    <Link className="brand" to="/">
      <span className="brandmark">✳</span> thinkweave<span className="brand-dot">.</span>
    </Link>
  );
}
export function Shell({
  children,
  user,
  reload,
  demo = false,
}: {
  children: ReactNode;
  user: User;
  reload: () => void;
  demo?: boolean;
}) {
  const navigate = useNavigate(),
    location = useLocation();
  const [message, setMessage] = useState(''),
    [spaces, setSpaces] = useState<Membership[]>([]);
  const load = useCallback(() => {
    if (!demo && user.emailVerifiedAt)
      void request<Membership[]>('/api/v1/workspaces')
        .then(setSpaces)
        .catch(() => undefined);
  }, [demo, user.emailVerifiedAt]);
  useEffect(() => {
    load();
    window.addEventListener('thinkweave:workspaces', load);
    return () => window.removeEventListener('thinkweave:workspaces', load);
  }, [load]);
  async function logout() {
    try {
      await post('/api/v1/auth/logout');
      reload();
      navigate('/login');
    } catch (e) {
      setMessage(errorText(e));
    }
  }
  const board = location.pathname.startsWith('/board/') || demo;
  return (
    <div className={`app-shell ${board ? 'has-canvas' : ''}`}>
      <aside className="app-sidebar">
        <div className="sidebar-brand">
          <Brand />
        </div>
        <div className="workspace-label">YOUR THINKING SPACE</div>
        <nav className="main-navigation">
          <NavLink to="/" end>
            <Icon name="grid" />
            <span>Overview</span>
          </NavLink>
          {spaces[0] && (
            <Link to={`/workspace/${spaces[0].workspace.id}?tab=search`}>
              <Icon name="search" />
              <span>Search ideas</span>
            </Link>
          )}
          <NavLink to="/demo">
            <Icon name="spark" />
            <span>Explore the demo</span>
            <span className="new-tag">Try it</span>
          </NavLink>
        </nav>
        <div className="sidebar-section-label">
          WORKSPACES{' '}
          <Link to="/" aria-label="Create workspace">
            <Icon name="plus" size={15} />
          </Link>
        </div>
        <nav className="workspace-navigation">
          {spaces.map((m, i) => (
            <NavLink key={m.workspace.id} to={`/workspace/${m.workspace.id}`}>
              <span className={`workspace-letter tone-${i % 3}`}>{m.workspace.name[0]}</span>
              <span>{m.workspace.name}</span>
            </NavLink>
          ))}
          {!spaces.length && (
            <p className="sidebar-empty">
              {demo ? 'Your next big idea starts here.' : 'A home for your team’s ideas.'}
            </p>
          )}
        </nav>
        <div className="sidebar-bottom">
          <div className="sidebar-note">
            <Icon name="spark" />
            <strong>
              A little room.
              <br />A lot of possibility.
            </strong>
            <p>Bring your ideas together.</p>
          </div>
          <NavLink className="settings-link" to="/settings">
            <Icon name="settings" />
            <span>Settings & account</span>
          </NavLink>
          {demo ? (
            <Link className="button primary full" to="/register">
              Get started <Icon name="arrow" size={16} />
            </Link>
          ) : (
            <div className="sidebar-profile">
              <Link to="/settings" className="avatar">
                {user.name[0].toUpperCase()}
              </Link>
              <div>
                <strong>{user.name}</strong>
                <small>Personal account</small>
              </div>
              <button
                className="icon-button"
                aria-label="Log out"
                title="Log out"
                onClick={() => void logout()}
              >
                <Icon name="logout" size={17} />
              </button>
            </div>
          )}
        </div>
      </aside>
      <div className="app-main">
        <header className="global-topbar">
          <div className="breadcrumb">
            <span>Workspace</span>
            <span>/</span>
            <strong>
              {demo
                ? 'Demo canvas'
                : board
                  ? 'Canvas'
                  : location.pathname === '/settings'
                    ? 'Settings'
                    : location.pathname.startsWith('/workspace/')
                      ? 'Team space'
                      : 'Overview'}
            </strong>
          </div>
          <div className="topbar-right">
            <span className="small muted">A space to think together.</span>
            <Link
              to={demo ? '/login' : '/settings'}
              className="avatar small-avatar"
              aria-label="Account settings"
            >
              {user.name[0]}
            </Link>
          </div>
        </header>
        {message && <Message>{message}</Message>}
        {children}
      </div>
    </div>
  );
}
