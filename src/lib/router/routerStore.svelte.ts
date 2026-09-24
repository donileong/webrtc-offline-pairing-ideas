/**
 * routerStore.svelte.ts
 *
 * Lightweight Svelte 5 reactive client-side router with HTML5 history support.
 */

class Router {
  public path = $state<string>('/');

  constructor() {
    if (typeof window !== 'undefined') {
      this.path = window.location.pathname || '/';
      window.addEventListener('popstate', () => {
        this.path = window.location.pathname || '/';
      });
    }
  }

  navigate(to: string) {
    if (typeof window === 'undefined') return;
    if (this.path === to) return;
    window.history.pushState({}, '', to);
    this.path = to;
  }

  replace(to: string) {
    if (typeof window === 'undefined') return;
    window.history.replaceState({}, '', to);
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
