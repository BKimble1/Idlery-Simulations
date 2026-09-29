/**
 * The cards' preview videos. A preview downloads nothing until the page has finished loading
 * (its poster shows until then); it plays, muted, while a third of it is on screen, and pauses
 * when it leaves, when the tab is hidden, or when the visitor pauses it. With reduced motion or
 * data saving asked for, it waits for the visitor to press play.
 */
export function initPreviews(): void {
  const quiet = window.matchMedia('(prefers-reduced-motion: reduce)');
  const saveData = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData === true;

  for (const media of document.querySelectorAll<HTMLElement>('[data-preview]')) {
    const video = media.querySelector('video');
    const toggle = media.querySelector<HTMLButtonElement>('[data-preview-toggle]');
    if (!video || !toggle) continue;
    let wanted = !quiet.matches && !saveData;
    let onScreen = false;

    const show = () => {
      toggle.dataset.state = wanted ? 'playing' : 'paused';
      toggle.setAttribute('aria-label', wanted ? 'Pause the preview' : 'Play the preview');
    };
    const sync = () => {
      if (wanted && onScreen && !document.hidden)
        video.play().catch((e: unknown) => {
          // the browser refused (a power-saving mode, say): the poster stays, with a play button;
          // a play() cut short by a pause (scrolled straight past) changes nothing
          if (e instanceof DOMException && e.name === 'AbortError') return;
          wanted = false;
          show();
        });
      else video.pause();
      show();
    };

    toggle.hidden = false;
    toggle.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      wanted = !wanted;
      sync();
    });
    // a video that cannot load keeps its poster, without a button that would do nothing
    video.querySelector('source:last-of-type')?.addEventListener('error', () => {
      wanted = false;
      toggle.hidden = true;
      video.pause();
    });
    new IntersectionObserver(
      (entries) => {
        onScreen = entries.some((e) => e.isIntersecting);
        sync();
      },
      { threshold: 0.33 },
    ).observe(media);
    document.addEventListener('visibilitychange', sync);
    quiet.addEventListener('change', () => {
      if (!quiet.matches) return;
      wanted = false;
      sync();
    });
    show();
  }
}
