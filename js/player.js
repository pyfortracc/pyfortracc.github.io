/**
 * player.js - Additional timeline player functionality
 * 
 * Contains:
 * - Functions to enhance the timeline player
 * - UI improvements for timeline interaction
 */

// Update progress bar visuals when timeline changes
function updatePlayerProgress() {
  core.updateTimelineProgress();
}

/**
 * Atualiza a variável CSS que controla a visualização do progresso da velocidade
 */
function updateSpeedProgress() {
  const speed = document.getElementById('speed');
  if (speed) {
    const min = parseFloat(speed.min) || 0.5;
    const max = parseFloat(speed.max) || 5;
    const value = parseFloat(speed.value) || 2;
    
    // Calcula a porcentagem com base no valor atual, mínimo e máximo
    const progress = ((value - min) / (max - min)) * 100;
    speed.style.setProperty('--speed-progress', `${progress}%`);
  }
}

// Event listeners
document.addEventListener("DOMContentLoaded", () => {
  const timeline = document.getElementById('timeline');
  if (timeline) {
    // Add input event to update visuals while dragging
    timeline.addEventListener('input', updatePlayerProgress);
    
    // Update timeline progress visual when the page loads
    updatePlayerProgress();
    
    // Add keyboard controls for timeline navigation
    document.addEventListener('keydown', (e) => {
      if (document.activeElement.tagName === 'INPUT' && 
          document.activeElement.type === 'text') {
        return; // Don't proceed if typing in an input field
      }
      
      const layers = core.state.geojsonLayers;
      if (!layers || !layers.length) return;
      
      switch(e.key) {
        case 'ArrowLeft':
          // Previous layer
          const prevIndex = (core.state.currentIndex - 1 + layers.length) % layers.length;
          window.mapUtils.showLayerAtIndex(prevIndex);
          break;
        case 'ArrowRight':
          // Next layer
          const nextIndex = (core.state.currentIndex + 1) % layers.length;
          window.mapUtils.showLayerAtIndex(nextIndex);
          break;
        case ' ': // Spacebar
          // Toggle play/pause
          window.togglePlayPause();
          e.preventDefault(); // Prevent page scrolling
          break;
      }
    });
  }
  
  const speed = document.getElementById('speed');
  if (speed) {
    // Update when user moves the control
    speed.addEventListener('input', updateSpeedProgress);
    
    // Also update when value changes programmatically
    const originalSetAttribute = speed.setAttribute;
    speed.setAttribute = function(name, value) {
      originalSetAttribute.call(this, name, value);
      if (name === 'value') {
        updateSpeedProgress();
      }
    };
    
    // Initialize display
    updateSpeedProgress();
  }
});

// Make functions available globally
window.updatePlayerProgress = updatePlayerProgress;
window.updateSpeedProgress = updateSpeedProgress;
