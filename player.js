/**
 * Script para gerenciar o controle de progresso do player
 */

// Configurações do player
const PLAYER_CONFIG = {
  MIN_SPEED: 0.5,
  MAX_SPEED: 5,
  DEFAULT_SPEED: 2,
  SPEED_STEP: 0.1,
  ANIMATION_DURATION: 300
};

// Estado do player
const playerState = {
  isPlaying: false,
  currentSpeed: PLAYER_CONFIG.DEFAULT_SPEED,
  playInterval: null,
  lastUpdate: 0
};

// Elementos do DOM
const elements = {
  timeline: document.getElementById('timeline'),
  speed: document.getElementById('speed'),
  speedValue: document.getElementById('speedValue'),
  playPause: document.getElementById('playPause'),
  prevLayer: document.getElementById('prevLayer'),
  nextLayer: document.getElementById('nextLayer')
};

// Atualiza a variável CSS que controla a visualização do progresso
function updateTimelineProgress() {
  if (!elements.timeline) return;
  
  const value = Number(elements.timeline.value);
  const max = Number(elements.timeline.max || 100);
  const progress = (value / max) * 100;
  
  elements.timeline.style.setProperty('--progress', `${progress}%`);
  
  // Adicionar animação suave
  elements.timeline.style.transition = `--progress ${PLAYER_CONFIG.ANIMATION_DURATION}ms ease-out`;
}

// Atualiza o progresso da barra de velocidade
function updateSpeedProgress() {
  if (!elements.speed) return;
  
  const min = PLAYER_CONFIG.MIN_SPEED;
  const max = PLAYER_CONFIG.MAX_SPEED;
  const value = parseFloat(elements.speed.value) || PLAYER_CONFIG.DEFAULT_SPEED;
  
  const progress = ((value - min) / (max - min)) * 100;
  elements.speed.style.setProperty('--speed-progress', `${progress}%`);
  
  // Atualizar o valor exibido
  if (elements.speedValue) {
    elements.speedValue.textContent = value.toFixed(1);
  }
}

// Inicia a reprodução
function play() {
  if (playerState.isPlaying) return;
  
  playerState.isPlaying = true;
  playerState.lastUpdate = Date.now();
  
  // Atualizar ícone do botão
  if (elements.playPause) {
    elements.playPause.innerHTML = '<i class="fas fa-pause"></i>';
  }
  
  // Iniciar intervalo de reprodução
  playerState.playInterval = setInterval(() => {
    const now = Date.now();
    const delta = now - playerState.lastUpdate;
    playerState.lastUpdate = now;
    
    // Avançar para o próximo frame
    if (elements.timeline && elements.timeline.value < elements.timeline.max) {
      elements.timeline.value = Number(elements.timeline.value) + 1;
      elements.timeline.dispatchEvent(new Event('input'));
    } else {
      pause();
    }
  }, 1000 / playerState.currentSpeed);
}

// Pausa a reprodução
function pause() {
  if (!playerState.isPlaying) return;
  
  playerState.isPlaying = false;
  
  // Atualizar ícone do botão
  if (elements.playPause) {
    elements.playPause.innerHTML = '<i class="fas fa-play"></i>';
  }
  
  // Limpar intervalo
  if (playerState.playInterval) {
    clearInterval(playerState.playInterval);
    playerState.playInterval = null;
  }
}

// Alterna entre play e pause
function togglePlay() {
  if (playerState.isPlaying) {
    pause();
  } else {
    play();
  }
}

// Vai para o frame anterior
function prevFrame() {
  if (!elements.timeline) return;
  
  pause();
  if (elements.timeline.value > elements.timeline.min) {
    elements.timeline.value = Number(elements.timeline.value) - 1;
    elements.timeline.dispatchEvent(new Event('input'));
  }
}

// Vai para o próximo frame
function nextFrame() {
  if (!elements.timeline) return;
  
  pause();
  if (elements.timeline.value < elements.timeline.max) {
    elements.timeline.value = Number(elements.timeline.value) + 1;
    elements.timeline.dispatchEvent(new Event('input'));
  }
}

// Atualiza a velocidade de reprodução
function updateSpeed(value) {
  playerState.currentSpeed = value;
  
  // Se estiver reproduzindo, reiniciar o intervalo com a nova velocidade
  if (playerState.isPlaying) {
    pause();
    play();
  }
}

// Inicialização do código quando o DOM estiver carregado
document.addEventListener("DOMContentLoaded", function() {
  // Configurar timeline
  if (elements.timeline) {
    // Monitorar mudanças manuais na posição
    elements.timeline.addEventListener('input', updateTimelineProgress);
    
    // Monitorar mudanças programáticas
    const observer = new MutationObserver(function(mutations) {
      mutations.forEach(function(mutation) {
        if (mutation.type === "attributes" && 
            (mutation.attributeName === "value" || mutation.attributeName === "max")) {
          updateTimelineProgress();
        }
      });
    });
    
    observer.observe(elements.timeline, { attributes: true });
    
    // Inicializar progresso
    updateTimelineProgress();
  }

  // Configurar controle de velocidade
  if (elements.speed) {
    // Definir valores padrão
    elements.speed.min = PLAYER_CONFIG.MIN_SPEED;
    elements.speed.max = PLAYER_CONFIG.MAX_SPEED;
    elements.speed.step = PLAYER_CONFIG.SPEED_STEP;
    elements.speed.value = PLAYER_CONFIG.DEFAULT_SPEED;
    
    // Monitorar mudanças
    elements.speed.addEventListener('input', () => {
      const value = parseFloat(elements.speed.value);
      updateSpeed(value);
      updateSpeedProgress();
    });
    
    // Inicializar progresso
    updateSpeedProgress();
  }

  // Configurar botões de controle
  if (elements.playPause) {
    elements.playPause.addEventListener('click', togglePlay);
  }
  
  if (elements.prevLayer) {
    elements.prevLayer.addEventListener('click', prevFrame);
  }
  
  if (elements.nextLayer) {
    elements.nextLayer.addEventListener('click', nextFrame);
  }
  
  // Adicionar suporte a teclas de atalho
  document.addEventListener('keydown', (event) => {
    switch(event.key) {
      case ' ':
        event.preventDefault();
        togglePlay();
        break;
      case 'ArrowLeft':
        prevFrame();
        break;
      case 'ArrowRight':
        nextFrame();
        break;
    }
  });
});

// Expor funções para uso em outros scripts
window.player = {
  play,
  pause,
  togglePlay,
  prevFrame,
  nextFrame,
  updateSpeed
};