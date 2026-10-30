(() => {
  const selector = '.home-shortcuts, .queue-list, .home-settings, .video-grid, .playlist-choices, .track-menu';
  document.querySelectorAll(selector).forEach(element => {
    let frame = 0;
    const update = () => {
      frame = 0;
      const canScroll = element.scrollHeight > element.clientHeight + 1;
      element.classList.toggle('scroll-edge-fade', canScroll);
      element.style.setProperty('--scroll-fade-top', canScroll && element.scrollTop > 1 ? '24px' : '0px');
      element.style.setProperty('--scroll-fade-bottom', canScroll && element.scrollTop + element.clientHeight < element.scrollHeight - 1 ? '24px' : '0px');
    };
    const schedule = () => { if (!frame) frame = requestAnimationFrame(update); };
    element.addEventListener('scroll', schedule, { passive: true });
    new ResizeObserver(schedule).observe(element);
    new MutationObserver(schedule).observe(element, { childList: true, subtree: true, characterData: true });
    update();
  });
})();
