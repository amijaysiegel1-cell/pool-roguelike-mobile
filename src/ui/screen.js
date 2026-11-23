import { el } from './dom.js';
import { audio } from '../core/audio.js';

// Base class for DOM screens. Clicks are delegated: any element with a
// data-act attribute calls this.action(act, element).
export class Screen {
  constructor(app, params = {}) {
    this.app = app;
    this.params = params;
    this.cls = '';
    this.onClick = (e) => {
      const t = e.target.closest('[data-act]');
      if (!t || !this.root?.contains(t) || t.disabled) return;
      audio.tap();
      this.action(t.dataset.act, t, e);
    };
  }
  render() { return ''; }
  mount(container) {
    this.root = el(`<div class="screen ${this.cls}"></div>`);
    this.root.innerHTML = this.render();
    container.appendChild(this.root);
    this.root.addEventListener('click', this.onClick);
    this.mounted?.();
  }
  refresh() {
    const sc = this.root.querySelector('.scroll, .map-wrap');
    const top = sc ? sc.scrollTop : 0;
    this.root.innerHTML = this.render();
    this.mounted?.();
    const sc2 = this.root.querySelector('.scroll, .map-wrap');
    if (sc2 && !this.keepScroll) sc2.scrollTop = top;
  }
  action() {}
  update() {}
  destroy() { this.cleanup?.(); this.root?.remove(); }
  $(sel) { return this.root.querySelector(sel); }
  $$(sel) { return [...this.root.querySelectorAll(sel)]; }
}
