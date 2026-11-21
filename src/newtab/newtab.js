'use strict';

const clockScreen = document.querySelector('.clock-screen');
const weekdayDisplay = document.getElementById('weekday');
const dateDisplay = document.getElementById('today');
const timeDisplay = document.getElementById('local-time');
const formatWeekday = new Intl.DateTimeFormat(undefined, { weekday: 'long' });
const formatDate = new Intl.DateTimeFormat(undefined, {
  month: 'long',
  day: 'numeric'
});
const formatTime = new Intl.DateTimeFormat(undefined, {
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23'
});

let clockTimer;
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

function updateClock() {
  clearTimeout(clockTimer);
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const date = `${year}-${month}-${day}`;
  if (dateDisplay.dateTime !== date) {
    weekdayDisplay.textContent = formatWeekday.format(now);
    dateDisplay.textContent = formatDate.format(now);
    dateDisplay.dateTime = date;
  }

  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  const time = `${hours}:${minutes}`;
  if (timeDisplay.dateTime !== time) {
    timeDisplay.textContent = formatTime.format(now);
    timeDisplay.dateTime = time;
    timeDisplay.setAttribute('aria-label', `Local time: ${timeDisplay.textContent}`);
  }

  const sweep = now.getMinutes() * 6 + (reducedMotion.matches ? 0 : now.getSeconds() / 10);
  clockScreen.style.setProperty('--clock-angle', `${sweep}deg`);

  if (!document.hidden) {
    const resolution = reducedMotion.matches ? 60_000 : 1000;
    clockTimer = setTimeout(updateClock, resolution - (now.getTime() % resolution));
  }
}

document.addEventListener('visibilitychange', updateClock);
reducedMotion.addEventListener('change', updateClock);
updateClock();
