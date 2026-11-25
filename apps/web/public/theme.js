// Blocking, same-origin bootstrap: apply the saved theme before the first paint.
try {
  const preference = localStorage.getItem('pq:theme');
  if (preference === 'light' || preference === 'dark') {
    document.documentElement.dataset.theme = preference;
  }
} catch (error) {
  console.warn('Theme preference could not be read; using the system theme.', error);
}
