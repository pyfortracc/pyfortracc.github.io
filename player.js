/**
 * Script para gerenciar o controle de progresso do player
 */

// Atualiza a variável CSS que controla a visualização do progresso
function updateTimelineProgress() {
  const timeline = document.getElementById('timeline');
  if (timeline) {
    const value = Number(timeline.value);
    const max = Number(timeline.max || 100);
    const progress = (value / max) * 100;
    timeline.style.setProperty('--progress', `${progress}%`);
  }
}

// Adicione esta função para atualizar o progresso da barra de velocidade
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

// Inicialização do código quando o DOM estiver carregado
document.addEventListener("DOMContentLoaded", function() {
  const timeline = document.getElementById('timeline');
  if (timeline) {
    // Monitora mudanças manuais na posição
    timeline.addEventListener('input', updateTimelineProgress);
    
    // Também chama updateTimelineProgress quando o valor muda programaticamente
    const observer = new MutationObserver(function(mutations) {
      mutations.forEach(function(mutation) {
        if (mutation.type === "attributes" && 
            (mutation.attributeName === "value" || mutation.attributeName === "max")) {
          updateTimelineProgress();
        }
      });
    });
    
    observer.observe(timeline, { attributes: true });
    
    // Inicialização para definir o valor inicial
    updateTimelineProgress();
  }

  const speed = document.getElementById('speed');
  if (speed) {
    // Atualiza quando o usuário move o controle
    speed.addEventListener('input', updateSpeedProgress);
    
    // Também atualiza quando o valor muda programaticamente
    const originalSetAttribute = speed.setAttribute;
    speed.setAttribute = function(name, value) {
      originalSetAttribute.call(this, name, value);
      if (name === 'value') {
        updateSpeedProgress();
      }
    };
    
    // Inicializa a visualização
    updateSpeedProgress();
  }
});

// Opcionalmente, expor a função para poder chamá-la de outros scripts
window.updatePlayerProgress = updateTimelineProgress;