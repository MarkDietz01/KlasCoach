(function () {
  const socket = io();
  const boardContainer = document.querySelector('.board-container');
  const selectedClassId = boardContainer ? Number(boardContainer.dataset.classId) : null;
  const trafficEl = document.querySelector('.traffic-light-inner');
  const trafficLabel = document.querySelector('#traffic-label');
  const timerBox = document.querySelector('.timer-display');
  const timerCountdown = document.querySelector('.timer-countdown');
  const timerLabel = document.querySelector('.timer-label');
  let timerInterval = null;

  function stopTimerTick() {
    if (timerInterval) {
      clearInterval(timerInterval);
      timerInterval = null;
    }
  }

  function updateCountdown(endsAt, label) {
    if (!timerCountdown || !timerBox) return;
    stopTimerTick();
    timerLabel.textContent = label || 'Timer';
    if (!endsAt) {
      timerCountdown.textContent = '--:--';
      return;
    }
    function tick() {
      const diff = new Date(endsAt).getTime() - Date.now();
      if (diff <= 0) {
        timerCountdown.textContent = '00:00';
        stopTimerTick();
        return;
      }
      const mins = Math.floor(diff / 60000);
      const secs = Math.floor((diff % 60000) / 1000);
      const pad = (n) => (n < 10 ? `0${n}` : `${n}`);
      timerCountdown.textContent = `${pad(mins)}:${pad(secs)}`;
    }
    tick();
    timerInterval = setInterval(tick, 1000);
  }

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

  if (timerBox) {
    const initialEndsAt = timerBox.dataset.endsAt;
    const initialLabel = timerBox.dataset.label;
    updateCountdown(initialEndsAt || null, initialLabel || 'Timer');
  }

  socket.on('trafficUpdate', (payload) => {
    if (selectedClassId && payload.classId && payload.classId !== selectedClassId) return;
    setTrafficState(payload.state);
  });

  socket.on('pointsUpdate', (payload) => {
    if (selectedClassId && payload.classId && payload.classId !== selectedClassId) return;
    const card = document.querySelector(`.student-card[data-student-id="${payload.studentId}"]`);
    if (card) {
      const pointsEl = card.querySelector('.student-points');
      if (pointsEl) pointsEl.textContent = payload.newTotal;
      showPointChange(card, payload.delta);
    }
  });

  socket.on('timerUpdate', (payload) => {
    if (selectedClassId && payload.classId && payload.classId !== selectedClassId) return;
    updateCountdown(payload.endsAt, payload.label || 'Timer');
  });
})();
