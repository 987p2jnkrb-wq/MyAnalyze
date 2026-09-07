// renderer-menu-bar.js
// This file creates a floating menu bar at the top of the Electron window with reload, refresh, restart, and config options.
// Inject this script in your Electron renderer process.

const { ipcRenderer } = window.require ? window.require('electron') : {};

function createMenuBar() {
  // Create the bar container
  const bar = document.createElement('div');
  bar.id = 'electron-menu-bar';
  bar.style.position = 'fixed';
  bar.style.top = 0;
  bar.style.left = 0;
  bar.style.width = '100vw';
  bar.style.height = '40px';
  bar.style.background = 'rgba(30, 41, 59, 0.95)';
  bar.style.display = 'flex';
  bar.style.justifyContent = 'flex-end';
  bar.style.alignItems = 'center';
  bar.style.zIndex = 9999;
  bar.style.transform = 'translateY(-100%)';
  bar.style.transition = 'transform 0.3s';

  // Show bar on mouse enter at top
  document.body.addEventListener('mousemove', (e) => {
    if (e.clientY < 8) {
      bar.style.transform = 'translateY(0)';
    } else {
      bar.style.transform = 'translateY(-100%)';
    }
  });

  // Button factory
  function makeButton(label, onClick, icon) {
    const btn = document.createElement('button');
    btn.innerHTML = icon ? icon + ' ' + label : label;
    btn.style.margin = '0 8px';
    btn.style.padding = '6px 16px';
    btn.style.background = '#f1f5f9';
    btn.style.color = '#1e293b';
    btn.style.border = 'none';
    btn.style.borderRadius = '6px';
    btn.style.cursor = 'pointer';
    btn.style.fontWeight = 'bold';
    btn.onmouseenter = () => btn.style.background = '#e0e7ef';
    btn.onmouseleave = () => btn.style.background = '#f1f5f9';
    btn.onclick = onClick;
    return btn;
  }

  // Add buttons
  bar.appendChild(makeButton('Reload', () => location.reload(), '⟳'));
  if (ipcRenderer) {
    bar.appendChild(makeButton('Restart', () => ipcRenderer.send('app-restart'), '⭯'));
  }
  bar.appendChild(makeButton('Config', () => alert('Config panel coming soon!'), '⚙'));
  // bar.appendChild(makeButton('Zoom+', () => document.body.style.zoom = (parseFloat(document.body.style.zoom||'1') + 0.1).toFixed(2), '+'));
  // bar.appendChild(makeButton('Zoom-', () => document.body.style.zoom = (parseFloat(document.body.style.zoom||'1') - 0.1).toFixed(2), '-'));

  document.body.appendChild(bar);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', createMenuBar);
} else {
  createMenuBar();
}
