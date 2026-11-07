document.documentElement.dataset.appMode = new URLSearchParams(location.search).get('app') === 'cinema' ? 'cinema' : 'music';
