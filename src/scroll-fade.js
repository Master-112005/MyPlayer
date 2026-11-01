(() => {
  const selector = '.home-shortcuts, .queue-list, .home-settings, .video-grid, .playlist-choices, .track-menu';
  document.querySelectorAll(selector).forEach(element => {
    let frame = 0;
    const update = () => {
      frame = 0;
      const canScroll = element.scrollHeight > element.clientHeight + 1;
      const fadeTop = canScroll && element.scrollTop > 1;
      const fadeBottom = canScroll && element.scrollTop + element.clientHeight < element.scrollHeight - 1;
      element.classList.toggle('scroll-edge-fade', fadeTop || fadeBottom);
      element.classList.toggle('scroll-fade-top', fadeTop);
      element.classList.toggle('scroll-fade-bottom', fadeBottom);
    };
    const schedule = () => { if (!frame) frame = requestAnimationFrame(update); };
    element.addEventListener('scroll', schedule, { passive: true });
    new ResizeObserver(schedule).observe(element);
    new MutationObserver(schedule).observe(element, { childList: true, subtree: true, characterData: true });
    update();
  });
})();
