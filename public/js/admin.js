(function () {
  const forgotLink = document.querySelector('#forgot-link');
  if (forgotLink) {
    forgotLink.addEventListener('click', (e) => {
      e.preventDefault();
      alert('Oude hond + 25 + !');
    });
  }

  const deltaInput = document.querySelector('#deltaInput');
  if (deltaInput) {
    document.querySelectorAll('[data-delta-preset]').forEach((btn) => {
      btn.addEventListener('click', () => {
        deltaInput.value = btn.dataset.deltaPreset;
      });
    });
  }
})();
