(function () {
  const socket = io();
  const trafficEl = document.querySelector('.traffic-light-inner');
  const trafficLabel = document.querySelector('#traffic-label');

  function setTrafficState(state) {
    if (!trafficEl) return;
    trafficEl.dataset.state = state;
    const map = {
      green: { text: 'GO!', color: '#4caf50' },
      orange: { text: 'RUSTIG', color: '#ffa000' },
      red: { text: 'STILTE', color: '#f44336' }
    };
    const cfg = map[state] || map.green;
    trafficEl.style.backgroundColor = cfg.color;
    if (trafficLabel) trafficLabel.textContent = cfg.text;
    trafficEl.classList.remove('traffic-bump');
    void trafficEl.offsetWidth; // force reflow
    trafficEl.classList.add('traffic-bump');
  }

  function showPointChange(card, delta) {
    if (!card) return;
    const changeEl = card.querySelector('.point-change');
    const pointsEl = card.querySelector('.student-points');
    if (pointsEl) {
      const newVal = parseInt(pointsEl.textContent, 10) + delta;
      pointsEl.textContent = Number.isNaN(newVal) ? delta : newVal;
    }
    if (changeEl) {
      changeEl.textContent = delta > 0 ? `+${delta}` : `${delta}`;
      card.classList.remove('highlight-plus', 'highlight-minus');
      if (delta >= 0) {
        card.classList.add('highlight-plus');
      } else {
        card.classList.add('highlight-minus');
      }
      changeEl.classList.add('show');
      setTimeout(() => {
        changeEl.classList.remove('show');
        card.classList.remove('highlight-plus', 'highlight-minus');
      }, 5000);
    }
  }

  if (trafficEl) {
    setTrafficState(trafficEl.dataset.state || 'green');
  }

  socket.on('trafficUpdate', (payload) => {
    setTrafficState(payload.state);
  });

  socket.on('pointsUpdate', (payload) => {
    const card = document.querySelector(`.student-card[data-student-id="${payload.studentId}"]`);
    if (card) {
      const pointsEl = card.querySelector('.student-points');
      if (pointsEl) pointsEl.textContent = payload.newTotal;
      showPointChange(card, payload.delta);
    }
  });
})();
