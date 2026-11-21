'use strict';

const glass = document.querySelector('.search-glass');
const profile = document.getElementById('search-lens-profile');
const canvas = document.createElement('canvas');
const pixels = canvas.getContext('2d');

if (pixels && CSS.supports('backdrop-filter', 'url("#search-lens")')) {
  new ResizeObserver(([entry]) => {
    const box = entry.borderBoxSize[0];
    const width = Math.round(box.inlineSize);
    const height = Math.round(box.blockSize);
    if (!width || !height || (canvas.width === width && canvas.height === height)) return;

    canvas.width = width;
    canvas.height = height;
    const map = pixels.createImageData(width, height);
    const radius = height / 2;
    const rim = Math.min(12, radius / 2);

    // Red and green encode horizontal and vertical refraction. Keep the center
    // neutral and bend the backdrop along the rounded edge.
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const centerX = Math.max(radius, Math.min(x + 0.5, width - radius));
        const dx = x + 0.5 - centerX;
        const dy = y + 0.5 - radius;
        const distance = Math.hypot(dx, dy);
        const depth = radius - distance;
        const bend = depth > 0 && depth < rim ? Math.sin(Math.PI * depth / rim) ** 2 : 0;
        const displacement = distance ? 120 * bend / distance : 0;
        const offset = (y * width + x) * 4;

        map.data[offset] = 128 - dx * displacement;
        map.data[offset + 1] = 128 - dy * displacement;
        map.data[offset + 3] = 255;
      }
    }

    pixels.putImageData(map, 0, 0);
    profile.setAttribute('href', canvas.toDataURL());
    glass.classList.add('has-lens');
  }).observe(glass);
}

glass.addEventListener('pointermove', (event) => {
  if (event.pointerType !== 'mouse') return;
  const bounds = glass.getBoundingClientRect();
  glass.style.setProperty('--glint-x', `${event.clientX - bounds.left}px`);
  glass.style.setProperty('--glint-y', `${event.clientY - bounds.top}px`);
});
