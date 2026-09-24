import { describe, expect, it } from 'vitest';
import { mount, unmount } from 'svelte';
import App from './App.svelte';

describe('App component', () => {
  it('renders Peer Box title and method cards', () => {
    const target = document.createElement('div');
    document.body.appendChild(target);
    const component = mount(App, { target });

    const brandTitle = target.querySelector('.brand-title');
    expect(brandTitle?.textContent).toBe('Peer Box');

    const heroTitle = target.querySelector('.hero-title');
    expect(heroTitle?.textContent).toBe('Peer Box');

    const methodCards = target.querySelectorAll('.method-card');
    expect(methodCards.length).toBeGreaterThanOrEqual(3);

    unmount(component);
    target.remove();
  });
});
