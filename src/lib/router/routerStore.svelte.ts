/**
 * routerStore.svelte.ts
 *
 * Lightweight Svelte 5 reactive client-side router with HTML5 history support.
 */

function getNormalizedPath(): string {
  if (typeof window === 'undefined') return '/';
  if (window.location.hash) {
    const hash = window.location.hash.slice(1);
    return hash.startsWith('/') ? hash : '/' + hash;
  }
  const base = import.meta.env.BASE_URL || '/';
  let p = window.location.pathname || '/';
  if (base !== '/' && p.startsWith(base)) {
    p = p.slice(base.length - 1);
  }
  return p.startsWith('/') ? p : '/' + p;
}

class Router {
  public path = $state<string>('/');

  constructor() {
    if (typeof window !== 'undefined') {
      this.path = getNormalizedPath();
      window.addEventListener('popstate', () => {
        this.path = getNormalizedPath();
      });
      window.addEventListener('hashchange', () => {
        this.path = getNormalizedPath();
      });
    }
  }

  navigate(to: string) {
    if (typeof window === 'undefined') return;
    if (this.path === to) return;
    const base = import.meta.env.BASE_URL || '/';
    const targetUrl = base === '/' ? to : `${base.replace(/\/$/, '')}${to}`;
    window.history.pushState({}, '', targetUrl);
    this.path = to;
  }

  replace(to: string) {
    if (typeof window === 'undefined') return;
    const base = import.meta.env.BASE_URL || '/';
    const targetUrl = base === '/' ? to : `${base.replace(/\/$/, '')}${to}`;
    window.history.replaceState({}, '', targetUrl);
    this.path = to;
  }

  get params(): Record<string, string> {
    const parts = this.path.split('/').filter(Boolean);
    if (parts[0] === 'connect' && parts[1]) {
      return { method: decodeURIComponent(parts[1]) };
    }
    return {};
  }

  /**
   * Pure pattern matcher that does not mutate state.
   */
  match(pattern: string): boolean {
    const currentParts = this.path.split('/').filter(Boolean);
    const patternParts = pattern.split('/').filter(Boolean);

    if (currentParts.length !== patternParts.length) {
      return false;
    }

    for (let i = 0; i < patternParts.length; i++) {
      const p = patternParts[i];
      const c = currentParts[i];
      if (p.startsWith(':')) {
        continue;
      }
      if (p !== c) {
        return false;
      }
    }

    return true;
  }
}

export const router = new Router();
