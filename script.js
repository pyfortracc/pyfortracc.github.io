/**
 * Aplicação de Visualização Geoespacial
 * 
 * Esta aplicação carrega e exibe dados geoespaciais de fronteiras e trajetórias em um mapa.
 * Permite naveção no tempo através de diferentes camadas, filtro por limites e exibição
 * de informações sobre as características geoespaciais.
 */

// ============ CONFIGURAÇÕES E CONSTANTES ============
const CONFIG = {
  DISPLAY_KEYS: ['uid', 'status', 'size', 'max', 'ang_','expansion'],
  DEFAULT_THRESHOLD: "2.5",
  AUTO_CHECK_INTERVAL: 60000, // 60 segundos
  TIME_OFFSET: 0, // UTC-3 horas
  TIME_INCREMENT: 0, // +10 minutos
  DIRECTORIES: {
    BOUNDARY: "track/boundary/",
    TRAJECTORY: "track/trajectory/"
  },
  MAP: {
    // Bounds do globo terrestre completo (latitude: -90 a 90, longitude: -180 a 180)
    BOUNDS: [[-90, -180], [90, 180]],
    DEFAULT_ZOOM: 3.2, // Zoom mais distante para mostrar uma visão global
    TILE_LAYER: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
    TILE_ATTRIBUTION: "© OpenStreetMap contributors",
    LAYERS: {
      OSM_STANDARD: {
        name: "OSM Standard",
        url: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
        attribution: "© OpenStreetMap contributors"
      },
      OSM_TOPO: {
        name: "OSM Topo",
        url: "https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png",
        attribution: "© OpenStreetMap contributors, SRTM | © OpenTopoMap"
      },
      ESRI_SATELLITE: {
        name: "Satélite",
        url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
        attribution: "Esri, Maxar, GeoEye, Earthstar Geographics, CNES/Airbus DS, USDA, USGS, AeroGRID, IGN, and the GIS User Community"
      },
      CARTO_DARK: {
        name: "Dark Mode",
        url: "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",
        attribution: "© OpenStreetMap contributors, © CARTO"
      }
    }
  },
  STYLES: {
    BOUNDARY: { color: "#3388ff", weight: 1, opacity: 1, fillOpacity: 0.2 },
    TRAJECTORY: { color: "#FF0000", weight: 2, opacity: 0.7 },
    SELECTED: { color: "#FF00FF", weight: 3, opacity: 1, fillOpacity: 0.3 } // Estilo para polígono selecionado
  },
  GITHUB: {
    BOUNDARY_API: "https://api.github.com/repos/pyfortracc/pyfortracc.github.io/contents/track/boundary/",
    TRAJECTORY_API: "https://api.github.com/repos/pyfortracc/pyfortracc.github.io/contents/track/trajectory/"
  },
  CHART: {
    EVOLUTION_VARIABLES: ['max', 'size', 'expansion','inside_clusters'], // Variáveis que podem ser exibidas no gráfico de evolução
    DEFAULT_VARIABLE: 'max' // Variável exibida por padrão
  },
  DOM_IDS: {
    POLYGON_CHART_CONTAINER: 'polygon-chart-container',
    POLYGON_CHART: 'polygon-chart',
    VARIABLE_SELECTOR: 'variable-selector'
  }
};

// ============ ESTADO GLOBAL DA APLICAÇÃO ============
const state = {
  geojsonLayers: [],
  trajectoryFiles: {},
  currentIndex: 0,
  playing: false,
  playInterval: null,
  currentThresholdFilter: CONFIG.DEFAULT_THRESHOLD,
  currentBoundaryLayer: null,
  currentTrajectoryLayer: null,
  displayOptions: CONFIG.DISPLAY_KEYS.reduce((acc, key) => (acc[key] = false, acc), {}),
  selection: {
    feature: null,    // Armazena feature selecionada
    layer: null,      // Armazena layer selecionada
    uid: null         // Armazena o UID do feature selecionado para persistência entre camadas
  },
  chart: {
    instance: null,   // Instância do gráfico ativo
    container: null   // Referência ao container do gráfico
  },
  isPanelCollapsed: false,
  currentMapLayer: 'OSM_STANDARD',
  helpModalVisible: false
};

// ============ UTILITÁRIOS ============
const utils = {
  /**
   * Escaneia um diretório local por arquivos GeoJSON
   */
  scanLocalDirectory: dir => fetch(dir)
    .then(r => r.ok ? r.text() : "")
    .then(html => {
      if (!html) return [];
      return [...new DOMParser().parseFromString(html, "text/html").querySelectorAll("a")]
        .map(a => a.getAttribute("href"))
        .filter(href => href && href.toLowerCase().endsWith(".geojson"));
    })
    .catch(() => []),

  /**
   * Ordena arquivos por nome ou outra propriedade
   */
  sortFiles: (files, key = "name") =>
    files.sort((a, b) => (a[key] || a).toLowerCase().localeCompare((b[key] || b).toLowerCase())),

  /**
   * Gera URL local para um arquivo
   */
  getLocalUrl: (fileName, dir) => fileName.includes(dir) ? fileName : dir + fileName,

  /**
   * Extrai o nome base de um caminho de arquivo
   */
  getBaseName: fileName => fileName.split('/').pop(),

  /**
   * Formata um timestamp para exibição com offset de fuso horário
   */
  formatTimestamp: (timestamp) => {
    if (!timestamp) return "";
    
    // Converte para objeto Date
    const date = new Date(timestamp);
    
    // Verifica se a data é válida
    if (isNaN(date.getTime())) return timestamp;
    
    // Ajusta o timestamp por milissegundos para evitar problemas com fusos horários
    const utcMilliseconds = date.getTime();
    const offsetMilliseconds = CONFIG.TIME_OFFSET * 60 * 60 * 1000; // -3 horas em milissegundos
    const adjustedDate = new Date(utcMilliseconds + offsetMilliseconds);
    
    // Formata a data
    return adjustedDate.toISOString().replace('T', ' ').substring(0, 19);
  },

  /**
   * Formata um número para exibição com unidades
   */
  formatNumber: (value, unit = '') => {
    if (typeof value !== 'number') return value;
    return `${value.toFixed(2)}${unit}`;
  },

  /**
   * Cria um popup com informações formatadas
   */
  createFeaturePopup: (feature) => {
    const properties = feature.properties;
    let content = '<div class="feature-popup">';
    
    Object.entries(properties).forEach(([key, value]) => {
      if (key === 'timestamp') {
        content += `<strong>${key}:</strong> ${utils.formatTimestamp(value)}<br>`;
      } else if (typeof value === 'number') {
        content += `<strong>${key}:</strong> ${utils.formatNumber(value)}<br>`;
      } else {
        content += `<strong>${key}:</strong> ${value}<br>`;
      }
    });
    
    content += '</div>';
    return content;
  },

  /**
   * Cria um tooltip para um feature
   */
  createFeatureTooltip: (feature) => {
    const properties = feature.properties;
    let content = '<div class="centroid-tooltip">';
    
    // Mostrar apenas algumas propriedades importantes no tooltip
    const importantKeys = ['uid', 'status', 'size'];
    importantKeys.forEach(key => {
      if (properties[key] !== undefined) {
        content += `<strong>${key}:</strong> ${properties[key]}<br>`;
      }
    });
    
    content += '</div>';
    return content;
  }
};

/**
 * Salva o estado atual da visualização do mapa
 */
const saveMapViewState = () => {
  try {
    // Verificar se o mapa existe e está inicializado
    if (!elements.map || typeof elements.map.getCenter !== 'function') {
      return;
    }

    const mapCenter = elements.map.getCenter();
    const mapZoom = elements.map.getZoom();
    
    // Verificar se os valores são válidos antes de salvar
    if (mapCenter && !isNaN(mapCenter.lat) && !isNaN(mapCenter.lng) && !isNaN(mapZoom)) {
      const viewState = {
        center: [mapCenter.lat, mapCenter.lng],
        zoom: mapZoom
      };
      
      localStorage.setItem('mapViewState', JSON.stringify(viewState));
    }
  } catch (e) {
    console.error("Erro ao salvar estado do mapa:", e);
  }
};

/**
 * Restaura o estado da visualização do mapa
 */
const restoreMapViewState = () => {
  try {
    // Verificar se o mapa existe e está inicializado
    if (!elements.map || typeof elements.map.setView !== 'function') {
      return;
    }

    const savedView = localStorage.getItem('mapViewState');
    if (savedView) {
      const viewState = JSON.parse(savedView);
      // Verificar se os valores são válidos antes de aplicar
      if (viewState.center && 
          Array.isArray(viewState.center) && 
          viewState.center.length === 2 &&
          !isNaN(viewState.center[0]) && 
          !isNaN(viewState.center[1]) && 
          !isNaN(viewState.zoom)) {
        elements.map.setView(viewState.center, viewState.zoom);
      } else {
        console.warn("Dados de visualização inválidos, usando valores padrão");
      }
    }
  } catch (e) {
    console.error("Erro ao restaurar estado do mapa:", e);
  }
};

document.addEventListener("DOMContentLoaded", () => {
  /// Modificar o container do gráfico para ficar no topo direito com tamanho reduzido
  const chartContainer = document.createElement("div");
  chartContainer.id = "polygon-chart-container";
  
  // Criar header com título e controles
  const chartHeaderContainer = document.createElement("div");
  chartHeaderContainer.className = "header-with-controls";

  const chartTitle = document.createElement("h4");
  chartTitle.textContent = "System Evolution";

  // Container para os botões
  const chartHeaderButtons = document.createElement("div");
  chartHeaderButtons.className = "chart-header-buttons";

  // Botão de minimizar
  const minimizeButton = document.createElement("button");
  minimizeButton.className = "minimize-button";
  minimizeButton.innerHTML = "−";
  minimizeButton.title = "Minimizar gráfico";

  // Botão de fechar
  const closeButton = document.createElement("button");
  closeButton.className = "close-button";
  closeButton.innerHTML = "×";
  closeButton.title = "Fechar gráfico";

  // Adicionar botões ao container de botões
  chartHeaderButtons.appendChild(minimizeButton);
  chartHeaderButtons.appendChild(closeButton);

  // Montar o header completo
  chartHeaderContainer.appendChild(chartTitle);
  chartHeaderContainer.appendChild(chartHeaderButtons);

  // Adicionar seletor de variável para o gráfico
  const variableSelector = document.createElement("select");
  variableSelector.id = "variable-selector";
  CONFIG.CHART.EVOLUTION_VARIABLES.forEach(variable => {
    const option = document.createElement("option");
    option.value = variable;
    option.text = variable.charAt(0).toUpperCase() + variable.slice(1);
    if (variable === CONFIG.CHART.DEFAULT_VARIABLE) {
      option.selected = true;
    }
    variableSelector.appendChild(option);
  });

  // Criar o corpo do container do gráfico
  const chartBody = document.createElement("div");
  chartBody.id = "chart-body";

  // Ajustar a altura do canvas para o gráfico
  const chartCanvas = document.createElement("canvas");
  chartCanvas.id = "polygon-chart";
  chartBody.appendChild(variableSelector);
  chartBody.appendChild(chartCanvas);

  // Adicionar handle de redimensionamento
  const resizeHandle = document.createElement("div");
  resizeHandle.className = "resize-handle";
  chartContainer.appendChild(resizeHandle);

  // Adicionar todos os elementos ao container principal
  chartContainer.appendChild(chartHeaderContainer);
  chartContainer.appendChild(chartBody);
  document.body.appendChild(chartContainer);

  // Implementar funcionalidade de arrasto
  let isDragging = false;
  let currentX;
  let currentY;
  let initialX;
  let initialY;
  let xOffset = 0;
  let yOffset = 0;

  chartHeaderContainer.addEventListener("mousedown", dragStart);
  document.addEventListener("mousemove", drag);
  document.addEventListener("mouseup", dragEnd);

  function dragStart(e) {
    // Não iniciar arrasto se estiver redimensionando
    if (isResizing) return;
    
    // Só iniciar arrasto se clicar na barra de título
    if (e.target === chartHeaderContainer || e.target.parentNode === chartHeaderContainer) {
      isDragging = true;
      chartContainer.classList.add("dragging");
      
      // Capturar a posição inicial do mouse e o offset atual
      initialX = e.clientX;
      initialY = e.clientY;
      
      // Obter o offset atual do container
      const transform = window.getComputedStyle(chartContainer).transform;
      if (transform !== 'none') {
        const matrix = new DOMMatrix(transform);
        xOffset = matrix.m41;
        yOffset = matrix.m42;
      }
    }
  }

  function drag(e) {
    if (isDragging) {
      e.preventDefault();
      
      // Calcular a nova posição baseada no movimento do mouse
      const dx = e.clientX - initialX;
      const dy = e.clientY - initialY;
      
      currentX = xOffset + dx;
      currentY = yOffset + dy;

      // Obter dimensões do container e da janela
      const containerRect = chartContainer.getBoundingClientRect();
      const windowWidth = window.innerWidth;
      const windowHeight = window.innerHeight;
      
      // Calcular limites baseados no tamanho da tela
      const maxX = windowWidth - containerRect.width;
      const maxY = windowHeight - containerRect.height;
      
      // Aplicar limites com margens de segurança
      const margin = 20; // Margem de segurança em pixels
      currentX = Math.min(Math.max(currentX, margin), maxX - margin);
      currentY = Math.min(Math.max(currentY, margin), maxY - margin);

      // Usar requestAnimationFrame para melhor performance
      requestAnimationFrame(() => {
        setTranslate(currentX, currentY, chartContainer);
      });
    }
  }

  function dragEnd(e) {
    if (isDragging) {
      isDragging = false;
      chartContainer.classList.remove("dragging");
      
      // Atualizar o offset para a próxima operação de arrasto
      xOffset = currentX;
      yOffset = currentY;
    }
  }

  function setTranslate(xPos, yPos, el) {
    // Usar transform3d para forçar aceleração de hardware
    el.style.transform = `translate3d(${xPos}px, ${yPos}px, 0)`;
  }

  // Implementar funcionalidade de redimensionamento
  let isResizing = false;
  let startX, startY, startWidth, startHeight;

  resizeHandle.addEventListener("mousedown", initResize);

  function initResize(e) {
    e.preventDefault();
    isResizing = true;
    chartContainer.classList.add("resizing");
    
    startX = e.clientX;
    startY = e.clientY;
    startWidth = parseInt(document.defaultView.getComputedStyle(chartContainer).width, 10);
    startHeight = parseInt(document.defaultView.getComputedStyle(chartContainer).height, 10);
    
    document.addEventListener("mousemove", resize);
    document.addEventListener("mouseup", stopResize);
  }

  function resize(e) {
    if (!isResizing) return;
    
    // Calcular nova largura e altura
    const width = startWidth + (e.clientX - startX);
    const height = startHeight + (e.clientY - startY);
    
    // Obter dimensões da janela
    const windowWidth = window.innerWidth;
    const windowHeight = window.innerHeight;
    
    // Calcular limites baseados no tamanho da tela
    const minWidth = 250;
    const minHeight = 200;
    const maxWidth = windowWidth * 0.9; // 90% da largura da tela
    const maxHeight = windowHeight * 0.9; // 90% da altura da tela
    
    // Aplicar nova dimensão com limites
    const newWidth = Math.min(Math.max(width, minWidth), maxWidth);
    const newHeight = Math.min(Math.max(height, minHeight), maxHeight);
    
    // Aplicar a nova dimensão apenas se for diferente da atual
    if (newWidth !== parseInt(chartContainer.style.width) || 
        newHeight !== parseInt(chartContainer.style.height)) {
      chartContainer.style.width = newWidth + "px";
      chartContainer.style.height = newHeight + "px";
      
      // Atualizar o gráfico
      if (polygonChart) {
        polygonChart.resize();
      }
    }
  }

  function stopResize() {
    if (isResizing) {
      isResizing = false;
      chartContainer.classList.remove("resizing");
      document.removeEventListener("mousemove", resize);
      document.removeEventListener("mouseup", stopResize);
    }
  }

  // Evento para minimizar/maximizar o gráfico
  minimizeButton.addEventListener("click", () => {
    chartContainer.classList.toggle("minimized");
    minimizeButton.innerHTML = chartContainer.classList.contains("minimized") ? "+" : "−";
    
    // Se estiver minimizando, ajustar a altura para 50px
    if (chartContainer.classList.contains("minimized")) {
      chartContainer.style.height = "50px";
      chartBody.style.display = "none";
    } else {
      // Se estiver maximizando, restaurar a altura original
      chartContainer.style.height = "40vh";
      chartBody.style.display = "block";
    }
  });

  // Evento para fechar o gráfico
  closeButton.addEventListener("click", () => {
    chartContainer.style.display = "none";
    // Limpar seleção se o painel de gráfico for fechado
    if (state.selection.uid) {
      if (state.currentBoundaryLayer) {
        state.currentBoundaryLayer.eachLayer(layer => {
          state.currentBoundaryLayer.resetStyle(layer);
        });
      }
      
      state.selection.uid = null;
      state.selection.feature = null;
      state.selection.layer = null;
      updateMarkers();
    }
  });

  // Adicionar a biblioteca Chart.js
  if (!document.querySelector('script[src*="chart.js"]')) {
    const chartScript = document.createElement("script");
    chartScript.src = "https://cdn.jsdelivr.net/npm/chart.js@3.9.1/dist/chart.min.js";
    chartScript.onload = function() {
      console.log("Chart.js carregado com sucesso");
    };
    document.head.appendChild(chartScript);
  }
  
  // Variável para armazenar a instância do gráfico
  let polygonChart = null;

  // Adicionar change event ao seletor de variável
  variableSelector.addEventListener("change", () => {
    if (state.selection.feature) {
      updatePolygonChart(state.selection.feature);
    }
  });

  // Adicionar ResizeObserver para atualizar o gráfico quando o container for redimensionado
  const resizeObserver = new ResizeObserver(entries => {
    for (const entry of entries) {
      if (polygonChart) {
        polygonChart.resize();
      }
    }
  });

  resizeObserver.observe(chartContainer);

  /**
   * Função que coleta dados do polígono em todas as camadas de tempo (versão otimizada)
   */
  const collectPolygonDataOverTime = (uid) => {
    // Cache dos dados já coletados para evitar reprocessamento
    if (state.dataCache && state.dataCache[uid]) {
      return state.dataCache[uid];
    }
    
    // Array para armazenar dados temporais ordenados
    const dataPoints = [];
    
    // Percorre todas as camadas para encontrar o mesmo UID
    state.geojsonLayers.forEach(layer => {
      if (!layer.geojson || !layer.geojson.features) return;
      
      // Encontra o polígono com o UID específico nesta camada
      const feature = layer.geojson.features.find(f => 
        f.properties && f.properties.uid === uid);
      
      if (!feature || !feature.properties) return;
      
      // Extrai timestamp do nome do arquivo
      const timestamp = extractTimestampFromFileName(layer.fileName);
      if (!timestamp) return;
      
      // Criar objeto base com timestamp e data para ordenação
      const dataPoint = {
        timestamp: timestamp,
        originalDate: new Date(timestamp)
      };
      
      // Adicionar dinamicamente todas as variáveis configuradas
      CONFIG.CHART.EVOLUTION_VARIABLES.forEach(variable => {
        dataPoint[variable] = parseFloat(feature.properties[variable] || 0);
      });
      
      // Armazenar o ponto de dados
      dataPoints.push(dataPoint);
    });
    
    // Ordenar pelo timestamp real (data)
    dataPoints.sort((a, b) => a.originalDate - b.originalDate);
    
    // Preparar estrutura base para o resultado
    const timeSeriesData = {
      timestamps: dataPoints.map(p => p.timestamp)
    };
    
    // Popular dinamicamente os arrays de valores para cada variável
    CONFIG.CHART.EVOLUTION_VARIABLES.forEach(variable => {
      timeSeriesData[variable] = dataPoints.map(p => p[variable]);
    });
    
    // Armazena no cache para uso futuro
    if (!state.dataCache) state.dataCache = {};
    state.dataCache[uid] = timeSeriesData;
    
    return timeSeriesData;
  };

  /**
   * Atualiza o gráfico com dados do polígono selecionado
   */
  const updatePolygonChart = (feature) => {
    if (!feature || !feature.properties) return;
    
    const props = feature.properties;
    const uid = props.uid || "N/A";
    
    // Atualizar com o novo formato de título
    chartTitle.textContent = `System Evolution UID: ${uid}`;
    
    // Mostrar o container do gráfico
    chartContainer.style.display = "block";
    chartContainer.classList.remove("minimized");
    minimizeButton.innerHTML = "−";
    
    // Coletar dados ao longo do tempo para este polígono
    
    const allTimeSeriesData = collectPolygonDataOverTime(uid);
    
    // Verificar se Chart.js está disponível
    if (typeof Chart === "undefined") {
      console.error("Chart.js não foi carregado ainda");
      return;
    }
    
    // Encontrar o índice do timestamp atual
    const currentFileName = state.geojsonLayers[state.currentIndex].fileName;
    const currentTimestamp = extractTimestampFromFileName(currentFileName);
    
    // Filtrar dados até o timestamp atual
    let currentIndex = allTimeSeriesData.timestamps.findIndex(ts => 
      new Date(ts) > new Date(currentTimestamp)
    );
    
    // Se não encontrou (findIndex retorna -1), usar todos os dados
    if (currentIndex === -1) currentIndex = allTimeSeriesData.timestamps.length;
    
    // Filtrar dados até o timestamp atual - estrutura base
    const timeSeriesData = {
      timestamps: allTimeSeriesData.timestamps.slice(0, currentIndex)
    };
    
    // Adicionar dinamicamente todas as variáveis
    CONFIG.CHART.EVOLUTION_VARIABLES.forEach(variable => {
      if (allTimeSeriesData[variable]) {
        timeSeriesData[variable] = allTimeSeriesData[variable].slice(0, currentIndex);
      }
    });
    
    // Formatar os timestamps para melhor legibilidade
    const formattedLabels = timeSeriesData.timestamps.map(ts => {
      // Extrair apenas a parte de hora:minuto
      return ts.split(' ')[1];
    });
    
    // Obter a variável selecionada
    const selectedVariable = document.getElementById(CONFIG.DOM_IDS.VARIABLE_SELECTOR).value;
    
    // Destruir gráfico anterior se existir
    if (polygonChart) {
      polygonChart.destroy();
    }
    
    // Criar novo gráfico de linha
    const chartElement = document.getElementById(CONFIG.DOM_IDS.POLYGON_CHART);
    polygonChart = new Chart(chartElement, {
      type: 'line',
      data: {
        labels: formattedLabels,
        datasets: [{
          label: selectedVariable.charAt(0).toUpperCase() + selectedVariable.slice(1),
          data: timeSeriesData[selectedVariable],
          borderColor: 'rgb(75, 192, 192)',
          backgroundColor: 'rgba(75, 192, 192, 0.2)',
          tension: 0.1,
          pointRadius: 4,
          pointHoverRadius: 6,
          // Destaque para o último ponto
          pointBackgroundColor: (context) => {
            return context.dataIndex === timeSeriesData.timestamps.length - 1 ? 
              'rgb(255, 0, 0)' : 'rgb(75, 192, 192)';
          },
          pointBorderColor: (context) => {
            return context.dataIndex === timeSeriesData.timestamps.length - 1 ? 
              'rgb(255, 0, 0)' : 'rgb(75, 192, 192)';
          },
          pointRadius: (context) => {
            return context.dataIndex === timeSeriesData.timestamps.length - 1 ? 
              6 : 4;
          },
          pointStyle: (context) => {
            return context.dataIndex === timeSeriesData.timestamps.length - 1 ? 
              'circle' : 'circle';
          }
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false, // Crucial para controle correto de dimensões
        plugins: {
          legend: {
            display: true,
            position: 'top',
            labels: {
              color: '#f0f0f0' // Cor clara para as legendas
            }
          },
          tooltip: {
            callbacks: {
              title: (items) => {
                // Mostrar o timestamp completo apenas no tooltip
                const idx = items[0].dataIndex;
                return `Timestamp: ${timeSeriesData.timestamps[idx]}`;
              },
              afterLabel: (context) => {
                return context.dataIndex === timeSeriesData.timestamps.length - 1 ? 
                  'Atual' : '';
              }
            },
            backgroundColor: 'rgba(50, 50, 50, 0.9)', // Fundo escuro para o tooltip
            titleColor: '#f0f0f0', // Texto claro para o título do tooltip
            bodyColor: '#f0f0f0', // Texto claro para o corpo do tooltip
            borderColor: '#555', // Borda cinza para o tooltip
            borderWidth: 1
          }
        },
        scales: {
          x: {
            title: {
              display: true,
              text: 'Time',
              padding: {
                top: 10
              },
              color: '#f0f0f0' // Cor clara para o título do eixo X
            },
            ticks: {
              maxRotation: 45,
              minRotation: 45,
              autoSkip: true,
              maxTicksLimit: 8,
              padding: 8,
              font: {
                size: 10
              },
              color: '#e0e0e0' // Cor clara para os rótulos do eixo X
            },
            grid: {
              color: 'rgba(160, 160, 160, 0.3)' // Linhas de grade mais claras e sutis
            }
          },
          y: {
            title: {
              display: true,
              text: selectedVariable.charAt(0).toUpperCase() + selectedVariable.slice(1),
              color: '#f0f0f0' // Cor clara para o título do eixo Y
            },
            ticks: {
              callback: function(value) {
                return Number.isInteger(value) ? value : value.toFixed(2);
              },
              color: '#e0e0e0', // Cor clara para os rótulos do eixo Y
              maxTicksLimit: 8 // Limitar número de ticks no eixo Y
            },
            grid: {
              color: 'rgba(160, 160, 160, 0.3)' // Linhas de grade mais claras e sutis
            },
            beginAtZero: true,
            grace: '10%', // Pequeno espaço acima do valor máximo
          }
        }
      }
    });
    
    // Mostrar o container do gráfico
    document.getElementById(CONFIG.DOM_IDS.POLYGON_CHART_CONTAINER).style.display = "block";

    // Adicionar animação ao gráfico
    polygonChart.options.animation = {
      duration: 1000,
      easing: 'easeInOutQuart'
    };
    
    // Adicionar tooltips personalizados
    polygonChart.options.plugins.tooltip = {
      callbacks: {
        label: (context) => {
          const value = context.parsed.y;
          return `${context.dataset.label}: ${utils.formatNumber(value)}`;
        }
      }
    };
    
    polygonChart.update();

    // Adicionar configuração para responsividade do gráfico
    if (polygonChart) {
      polygonChart.options.responsive = true;
      polygonChart.options.maintainAspectRatio = false;
      polygonChart.update();
    }
  };

  /**
   * Extrai timestamp de um nome de arquivo
   */
  const extractTimestampFromFileName = (fileName) => {
    const fileNameMatch = fileName.match(/(\d{4})(\d{2})(\d{2})_(\d{2})(\d{2})/);
    
    if (fileNameMatch) {
      const [_, year, month, day, hour, minute] = fileNameMatch;
      
      // Criar data em UTC e aplicar ajustes
      const utcDate = new Date(Date.UTC(
        parseInt(year),
        parseInt(month) - 1,
        parseInt(day),
        parseInt(hour),
        parseInt(minute)
      ));
      
      const offsetMilliseconds = CONFIG.TIME_OFFSET * 60 * 60 * 1000;
      const incrementMilliseconds = CONFIG.TIME_INCREMENT * 60 * 1000;
      const localDate = new Date(utcDate.getTime() + offsetMilliseconds + incrementMilliseconds);
      
      // Formatar a data para exibição
      return localDate.toISOString().replace('T', ' ').substring(0, 16);
    }
    
    return null;
  };

  // Substituir ou adicionar a função updatePolygonChart ao escopo onde é usada
  window.updatePolygonChart = updatePolygonChart;

  // ============ INICIALIZAÇÃO DE UI ============
  const elements = {
    map: L.map("map", {
      center: [0, 0], // Centro do mapa no equador
      zoom: CONFIG.MAP.DEFAULT_ZOOM,
      maxBounds: [[-90, -180], [90, 180]], // Limites máximos para navegação
      zoomSnap: 0.1,
      zoomDelta: 0.1
    }),
    timelineSlider: document.getElementById("timeline"),
    prevBtn: document.getElementById("prevLayer"),
    playPauseBtn: document.getElementById("playPause"),
    nextBtn: document.getElementById("nextLayer"),
    speedInput: document.getElementById("speed"),
    speedValueSpan: document.getElementById("speedValue"),
    trackInfo: document.getElementById("track-info") || document.getElementById("timestamp-info"),
    dynamicOptionsContainer: document.getElementById("dynamic-options"),
    showTrajectoryCheckbox: document.getElementById("showTrajectory"),
    thresholdRadios: document.getElementsByName("thresholdFilter"),
    helpButton: document.getElementById('help-button'),
    helpModal: document.getElementById('help-modal'),
    closeModal: document.querySelector('.close'),
    togglePanel: document.getElementById('toggle-panel'),
    infoPanel: document.getElementById('info-panel'),
    layerControls: document.getElementById('layer-controls'),
    currentTime: document.getElementById('current-time'),
    infoContent: document.getElementById('info-content')
  };

  // Inicialização das camadas de mapa (tile layers)
  const baseLayers = {};
  let currentBaseLayer = null;

  // Cria o controle de camadas
  const createLayersControl = () => {
    // Criar botão para mostrar/ocultar o painel de camadas
    const toggleButton = document.createElement('button');
    toggleButton.id = 'toggle-map-layers';
    toggleButton.innerHTML = '<i class="fa fa-layers"></i> Mapa';
    document.body.appendChild(toggleButton);
    
    // Criar painel de controle de camadas
    const layersControl = document.createElement('div');
    layersControl.id = 'map-layers-control';
    
    // Criar um header com controles
    const headerContainer = document.createElement('div');
    headerContainer.className = 'header-with-controls';
    
    const controlTitle = document.createElement('h4');
    controlTitle.textContent = 'Tipos de Mapa';
    
    // Botão de minimizar
    const minimizeButton = document.createElement('button');
    minimizeButton.className = 'minimize-button';
    minimizeButton.innerHTML = '−'; // Character Unicode para o símbolo de minimizar
    minimizeButton.title = 'Minimizar painel';
    
    // Adicionar ao container de header
    headerContainer.appendChild(controlTitle);
    headerContainer.appendChild(minimizeButton);
    
    // Adicionar o header ao painel de camadas
    layersControl.appendChild(headerContainer);
    
    // Corpo do controle de camadas para conter as opções de radio
    const layersControlBody = document.createElement('div');
    layersControlBody.id = 'map-layers-control-body';
    
    // Adicionar opções de camadas ao corpo do container
    Object.keys(CONFIG.MAP.LAYERS).forEach((layerKey, index) => {
      const layer = CONFIG.MAP.LAYERS[layerKey];
      
      // Criar tile layer
      const tileLayer = L.tileLayer(layer.url, { attribution: layer.attribution });
      baseLayers[layerKey] = tileLayer;
      
      // Se for a primeira camada ou a camada padrão, adicioná-la ao mapa
      if (index === 0) {
        currentBaseLayer = tileLayer;
        tileLayer.addTo(elements.map);
      }
      
      // Criar opção de radio para esta camada
      const layerOption = document.createElement('label');
      const radio = document.createElement('input');
      radio.type = 'radio';
      radio.name = 'mapLayer';
      radio.value = layerKey;
      radio.checked = index === 0;
      
      radio.addEventListener('change', () => {
        // Remover camada atual
        if (currentBaseLayer) {
          elements.map.removeLayer(currentBaseLayer);
        }
        
        // Adicionar a nova camada selecionada
        currentBaseLayer = baseLayers[layerKey];
        currentBaseLayer.addTo(elements.map);
        
        // Salvar preferência do usuário
        localStorage.setItem('preferredMapLayer', layerKey);
      });
      
      layerOption.appendChild(radio);
      layerOption.appendChild(document.createTextNode(layer.name));
      layersControlBody.appendChild(layerOption);
    });
    
    // Adicionar o corpo ao painel principal
    layersControl.appendChild(layersControlBody);
    
    document.body.appendChild(layersControl);
    
    // Evento para minimizar/maximizar o painel (alternando apenas o corpo)
    minimizeButton.addEventListener('click', () => {
      if (layersControlBody.style.display === 'none') {
        layersControlBody.style.display = 'block';
        minimizeButton.innerHTML = '−'; // Símbolo de minimizar
        minimizeButton.title = 'Minimizar painel';
      } else {
        layersControlBody.style.display = 'none';
        minimizeButton.innerHTML = '+'; // Símbolo de maximizar
        minimizeButton.title = 'Expandir painel';
      }
    });
    
    // Evento para mostrar/ocultar o painel completo
    toggleButton.addEventListener('click', () => {
      if (layersControl.style.display === 'block') {
        layersControl.style.display = 'none';
      } else {
        layersControl.style.display = 'block';
      }
    });
    
    // Restaurar preferência do usuário
    const preferredLayer = localStorage.getItem('preferredMapLayer');
    if (preferredLayer && baseLayers[preferredLayer]) {
      const radioToSelect = document.querySelector(`input[name="mapLayer"][value="${preferredLayer}"]`);
      if (radioToSelect) {
        radioToSelect.checked = true;
        // Dispara manualmente o evento change
        const event = new Event('change');
        radioToSelect.dispatchEvent(event);
      }
    }
  };

  // Remover a inicialização padrão do tile layer
  // L.tileLayer(CONFIG.MAP.TILE_LAYER, { attribution: CONFIG.MAP.TILE_ATTRIBUTION }).addTo(elements.map);

  // Chamar a função para criar o controle de camadas
  createLayersControl();

  const markerGroup = L.layerGroup().addTo(elements.map);

  // Melhor controle de event listeners no mapa
  // Criar uma função para o evento de clique no mapa e usar apenas uma vez na inicialização
  const onMapClick = () => {
    if (state.selection.uid) {
      // Limpar tudo
      if (state.currentBoundaryLayer) {
        state.currentBoundaryLayer.eachLayer(layer => {
          state.currentBoundaryLayer.resetStyle(layer);
        });
      }
      
      state.selection.uid = null;
      state.selection.feature = null;
      state.selection.layer = null;
      // Esconder o gráfico
      document.getElementById('polygon-chart-container').style.display = "none";
      updateMarkers(); // Atualiza marcadores para mostrar todos conforme config global
    }
  };

  // Na inicialização:
  elements.map.on('click', onMapClick);

  // Na inicialização do mapa, após criar o objeto map:

  // Adicionar eventos para salvar o estado da visualização
  elements.map.on('moveend', saveMapViewState);
  elements.map.on('zoomend', saveMapViewState);

  // Adicionar após os event listeners do mapa:

  // Salvar estado do mapa quando o usuário sai da página
  window.addEventListener('beforeunload', saveMapViewState);

  // ============ GERENCIAMENTO DE LAYERS E MARKERS ============
  /**
   * Verifica se uma feature passa pelo filtro de limite
   */
  const passesThreshold = feature =>
    feature.properties && feature.properties.threshold !== undefined ?
      parseFloat(feature.properties.threshold) === parseFloat(state.currentThresholdFilter) : false;

  /**
   * Cria uma layer de trajetória a partir de um GeoJSON
   */
  const createTrajectoryLayer = geojson => L.geoJSON(geojson, {
    filter: feature => {
      // Filtra apenas as trajetórias que correspondem aos UIDs dos polígonos visíveis
      // e que passam pelo threshold atual
      if (!feature.properties || !feature.properties.uid || !feature.properties.threshold) return false;
  
      // Verificar se o threshold corresponde ao filtro atual
      const matchesThreshold = parseFloat(feature.properties.threshold) === parseFloat(state.currentThresholdFilter);
      if (!matchesThreshold) return false;
      
      // Se há um polígono específico selecionado, mostra apenas sua trajetória
      if (state.selection.uid) {
        return feature.properties.uid === state.selection.uid;
      }
      
      // Caso contrário, mostra trajetórias dos polígonos visíveis na camada atual
      const currentBoundaryFeatures = state.geojsonLayers[state.currentIndex].geojson.features;
      return currentBoundaryFeatures.some(boundaryFeature => 
        boundaryFeature.properties && 
        boundaryFeature.properties.uid === feature.properties.uid &&
        passesThreshold(boundaryFeature)
      );
    },
    style: CONFIG.STYLES.TRAJECTORY
  });

  /**
   * Computa o centroide de uma feature poligonal
   */
  const computeCentroid = feature => {
    if (!feature.geometry) return null;
    
    let coords;
    if (feature.geometry.type === "Polygon") {
      coords = feature.geometry.coordinates[0];
    } else if (feature.geometry.type === "MultiPolygon") {
      // Para MultiPolygon, usamos o primeiro polígono para calcular o centroide
      coords = feature.geometry.coordinates[0][0];
    } else {
      return null;
    }
    
    let [sumX, sumY] = [0, 0];
    coords.forEach(c => { sumX += c[0]; sumY += c[1]; });
    return [sumY / coords.length, sumX / coords.length];
  };

  /**
   * Atualiza a informação de timestamp exibida
   */
  const updateTimestampInfo = obj => {
    let ts = "";
    
    // Extrair timestamp do nome do arquivo (formato: YYYYMMDD_HHMM)
    const fileNameMatch = obj.fileName.match(/(\d{4})(\d{2})(\d{2})_(\d{2})(\d{2})/);
    
    if (fileNameMatch) {
      const [_, year, month, day, hour, minute] = fileNameMatch;
      
      // Criar data em UTC
      const utcDate = new Date(Date.UTC(
        parseInt(year),
        parseInt(month) - 1, // Mês em JavaScript é 0-11
        parseInt(day),
        parseInt(hour),
        parseInt(minute)
      ));
      
      // Ajustar para UTC-3 e adicionar o incremento de 10 minutos
      const offsetMilliseconds = CONFIG.TIME_OFFSET * 60 * 60 * 1000; // -3 horas em milissegundos
      const incrementMilliseconds = CONFIG.TIME_INCREMENT * 60 * 1000; // +10 minutos em milissegundos
      const localDate = new Date(utcDate.getTime() + offsetMilliseconds + incrementMilliseconds);
      
      // Formatar a data
      ts = localDate.toISOString().replace('T', ' ').substring(0, 16);
    } else {
      // Fallback: tentar obter do GeoJSON se a extração do nome do arquivo falhar
      if (obj.geojson && obj.geojson.features && obj.geojson.features.length > 0) {
        ts = obj.geojson.features[0].timestamp ||
             (obj.geojson.features[0].properties && obj.geojson.features[0].properties.timestamp) || "";
        
        // Aplicar offset e incremento se timestamp estiver presente
        if (ts) {
          const date = new Date(ts);
          // Aplicar ajuste de fuso horário e incremento de minutos
          date.setTime(date.getTime());
          ts = date.toISOString().replace('T', ' ').substring(0, 16);
        }
      }
    }
    
    if (elements.trackInfo) {
      if (ts) {
        elements.trackInfo.textContent = `Track: ${ts} (UTC${CONFIG.TIME_OFFSET})`;
      } else {
        elements.trackInfo.textContent = "Track: Sem dados de timestamp";
      }
    } else {
      console.error("Elemento trackInfo não encontrado");
    }
  };

  /**
   * Remove a layer de fronteira atual e markers associados
   */
  const removeCurrentLayer = () => {
    if (state.currentBoundaryLayer) { 
      elements.map.removeLayer(state.currentBoundaryLayer); 
      state.currentBoundaryLayer = null; 
    }
    markerGroup.clearLayers();
    removeTrajectoryLayer();
  };

  /**
   * Remove a layer de trajetória atual
   */
  const removeTrajectoryLayer = () => {
    if (state.currentTrajectoryLayer) {
      elements.map.removeLayer(state.currentTrajectoryLayer);
      state.currentTrajectoryLayer = null;
    }
  };

  /**
   * Atualiza a layer de fronteira exibida
   */
  const updateBoundaryLayer = () => {
    if (state.currentBoundaryLayer) elements.map.removeLayer(state.currentBoundaryLayer);
    
    // Resetar apenas as referências à layer e feature, mantendo o UID
    state.selection.feature = null;
    state.selection.layer = null;
    
    const obj = state.geojsonLayers[state.currentIndex];
    if (!obj || !obj.geojson) return; // Proteção contra dados ausentes
    
    // Cria um estilo como função para evitar cálculos repetidos
    const getFeatureStyle = feature => {
      return state.selection.uid && feature.properties.uid === state.selection.uid 
        ? CONFIG.STYLES.SELECTED 
        : CONFIG.STYLES.BOUNDARY;
    };

    state.currentBoundaryLayer = L.geoJSON(obj.geojson, {
      filter: passesThreshold,
      style: getFeatureStyle,
      onEachFeature: (feature, layer) => {
        // Adiciona evento de clique para mostrar informações do polígono
        layer.on('click', (e) => {
          L.DomEvent.stopPropagation(e); // Evita a propagação do evento para o mapa
          
          // Se estamos clicando no mesmo polígono, desseleciona
          if (state.selection.uid === feature.properties.uid) {
            // Desselecionar completamente
            state.selection.uid = null;
            state.selection.feature = null;
            state.selection.layer = null;
            
            // Restaurar o estilo padrão
            layer.setStyle(CONFIG.STYLES.BOUNDARY);
            
            // Esconder o gráfico
            document.getElementById(CONFIG.DOM_IDS.POLYGON_CHART_CONTAINER).style.display = "none";
            
            updateMarkers(); // Atualiza os marcadores para mostrar todos
            return;
          }
          
          // Primeiro, limpar a seleção anterior - este é o ponto chave da correção
          if (state.selection.uid) {
            // Resetar o estilo de todos os polígonos para garantir que nenhum fique rosa
            state.currentBoundaryLayer.eachLayer(l => {
              l.setStyle(CONFIG.STYLES.BOUNDARY);
            });
          }
          
          // Define este como o novo polígono selecionado
          state.selection.uid = feature.properties.uid;
          state.selection.feature = feature;
          state.selection.layer = layer;
          
          // Aplica estilo de destaque ao polígono selecionado
          layer.setStyle(CONFIG.STYLES.SELECTED);
          
          // Atualizar o gráfico com os dados do polígono selecionado
          updatePolygonChart(feature);
          
          // Verifica se há opções de exibição ativas
          const hasActiveOptions = Object.values(state.displayOptions).some(val => val);
          
          // Se não houver opções ativas, ativa automaticamente a exibição do UID
          if (!hasActiveOptions && CONFIG.DISPLAY_KEYS.includes('uid')) {
            state.displayOptions.uid = true;
            const uidCheckbox = document.querySelector(`input[name="uid"]`);
            if (uidCheckbox) uidCheckbox.checked = true;
          }
          
          // Atualiza os marcadores para mostrar apenas este polígono
          updateMarkers();
        });

        // Adicionar popups e tooltips aos features
        layer.bindPopup(utils.createFeaturePopup(feature));
        layer.bindTooltip(utils.createFeatureTooltip(feature), {
          permanent: false,
          direction: 'auto'
        });
      }
    });
    
    state.currentBoundaryLayer.addTo(elements.map);
    
    // Adicionar a remoção da camada de trajetória ao atualizar a camada de fronteira
    removeTrajectoryLayer();
  };

  /**
   * Atualiza os markers com informações exibidas no mapa
   */
  const updateMarkers = () => {
    markerGroup.clearLayers();
    if (!state.geojsonLayers[state.currentIndex]) return;
    
    // Filtra features pela threshold e pela seleção
    const filteredFeatures = state.geojsonLayers[state.currentIndex].geojson.features
      .filter(feature => {
        // Se tiver uma feature selecionada, mostra apenas ela
        if (state.selection.feature) {
          return feature.properties.uid === state.selection.feature.properties.uid && passesThreshold(feature);
        }
        // Caso contrário, mostra todas que passam pelo threshold
        return passesThreshold(feature);
      });
    
    filteredFeatures.forEach(feature => {
      const centroid = computeCentroid(feature);
      if (!centroid) return;
      
      let infoText = "";
      CONFIG.DISPLAY_KEYS.forEach(field => {
        if (state.displayOptions[field] && feature.properties && feature.properties[field] !== undefined) {
          infoText += `${field}: ${feature.properties[field]}<br>`;
        }
      });
      
      if (infoText) {
        const marker = L.marker(centroid, { opacity: 0 });
        marker.bindTooltip(infoText, { 
          permanent: true, 
          direction: "top", 
          offset: [0, -10], 
          className: "centroid-tooltip" 
        });
        markerGroup.addLayer(marker);
      }
    });
  };

  // ============ CARREGAMENTO DE DADOS ============
  /**
   * Busca lista de arquivos de fronteira
   */
  const fetchBoundaryFileList = () => 
    utils.scanLocalDirectory(CONFIG.DIRECTORIES.BOUNDARY).then(files => {
      if (files.length > 0) {
        return utils.sortFiles(files.map(f => ({ 
          name: f, 
          download_url: utils.getLocalUrl(f, CONFIG.DIRECTORIES.BOUNDARY) 
        })), "name");
      }
      
      return fetch(CONFIG.GITHUB.BOUNDARY_API)
        .then(r => { 
          if (!r.ok) throw new Error(r.status); 
          return r.json(); 
        })
        .then(files => utils.sortFiles(files.filter(file => /\.geojson$/i.test(file.name)), "name"));
    });

  /**
   * Busca lista de arquivos de trajetória
   */
  const fetchTrajectoryFileList = () =>
    utils.scanLocalDirectory(CONFIG.DIRECTORIES.TRAJECTORY).then(files => {
      if (files.length > 0) {
        let fileMap = {};
        files.forEach(f => fileMap[utils.getBaseName(f)] = utils.getLocalUrl(f, CONFIG.DIRECTORIES.TRAJECTORY));
        return fileMap;
      }
      
      return fetch(CONFIG.GITHUB.TRAJECTORY_API)
        .then(r => { 
          if (!r.ok) throw new Error(r.status); 
          return r.json(); 
        })
        .then(files => {
          let m = {};
          files.forEach(f => { 
            if (/\.geojson$/i.test(f.name)) m[f.name] = f.download_url; 
          });
          return m;
        });
    });

  /**
   * Carrega as camadas de fronteira
   */
  const loadBoundaryLayers = () => {
    fetchBoundaryFileList().then(files => {
      if (!files.length) {
        throw new Error("Nenhum arquivo .geojson encontrado para boundary");
      }

      // Verificar novos arquivos
      const storedFiles = JSON.parse(localStorage.getItem('boundaryFiles')) || [];
      const newFiles = files.filter(file => 
        !storedFiles.some(storedFile => storedFile.name === file.name)
      );

      if (newFiles.length > 0) {
        // Atualizar a lista de arquivos armazenada e recarregar
        localStorage.setItem('boundaryFiles', JSON.stringify(files));
        location.reload();
        return;
      }

      // Carregar todos os arquivos
      let loadingPromises = [];
      files.forEach(file => {
        const promise = fetch(file.download_url)
          .then(r => { 
            if (!r.ok) throw new Error(file.download_url); 
            return r.json(); 
          })
          .then(geojson => state.geojsonLayers.push({
            fileName: file.name,
            geojson,
            trajectoryLayer: null,
            trajectoryGeojson: null
          }))
          .catch(err => console.error(`Erro ao carregar arquivo ${file.name}:`, err));
        
        loadingPromises.push(promise);
      });

      // Usar Promise.all para garantir que todos os arquivos sejam carregados
      Promise.all(loadingPromises)
        .then(() => {
          if (state.geojsonLayers.length > 0) {
            // Processamento após carregar todos os arquivos
            state.geojsonLayers.sort((a, b) => 
              a.fileName.toLowerCase().localeCompare(b.fileName.toLowerCase())
            );
            
            // Configurar UI
            elements.timelineSlider.disabled = false;
            elements.timelineSlider.min = 0;
            elements.timelineSlider.max = state.geojsonLayers.length - 1;
            elements.timelineSlider.value = state.geojsonLayers.length - 1; // Último índice
            
            // Forçar a exibição da primeira camada
            showLayerAtIndex(0);
            
            // Depois, se necessário, mostrar a última camada
            setTimeout(() => {
              showLayerAtIndex(state.geojsonLayers.length - 1);
              state.playing = false;
              elements.playPauseBtn.textContent = "Play";
              
              // Verificar se havia um sistema selecionado antes do recarregamento
              const previouslySelectedUid = localStorage.getItem('selectedSystemUid');
              if (previouslySelectedUid) {
                // Tentar selecionar o mesmo sistema após o recarregamento
                setTimeout(() => {
                  selectPolygonByUid(previouslySelectedUid);
                  // Limpar o UID armazenado após restaurar a seleção
                  localStorage.removeItem('selectedSystemUid');
                }, 300);
              }
              
              // Forçar uma atualização de exibição
              updateBoundaryLayer();
              updateMarkers();
              if (elements.showTrajectoryCheckbox.checked) {
                loadTrajectoryForCurrentLayer();
              }
              // Inicializar o progresso da timeline
              updateTimelineProgress();

              // Restaurar o estado do mapa após um pequeno delay para garantir que tudo está inicializado
              setTimeout(() => {
                restoreMapViewState();
              }, 500);
            }, 300);
          }
        });
    }).catch(err => {
      console.error("Erro ao carregar camadas de fronteira:", err);
    });
  };

  /**
   * Verifica periodicamente por novos arquivos de fronteira
   */
  const checkForNewBoundaryFiles = () => {
    fetchBoundaryFileList().then(files => {
      const storedFiles = JSON.parse(localStorage.getItem('boundaryFiles')) || [];
      const newFiles = files.filter(file => 
        !storedFiles.some(storedFile => storedFile.name === file.name)
      );
      
      if (newFiles.length > 0) {
        console.log("Novos arquivos encontrados, recarregando...");
        
        // Salvar o UID do sistema selecionado antes do recarregamento
        if (state.selection.uid) {
          localStorage.setItem('selectedSystemUid', state.selection.uid);
        }
        
        // Salvar o estado da visualização do mapa
        saveMapViewState();
        
        localStorage.setItem('boundaryFiles', JSON.stringify(files));
        location.reload();
      }
    }).catch(err => {
      console.error("Erro ao verificar novos arquivos:", err);
    });
  };

  /**
   * Carrega os arquivos de trajetória
   */
  const loadTrajectoryFiles = () => {
    fetchTrajectoryFileList()
      .then(filesMap => {
        state.trajectoryFiles = filesMap;
      })
      .catch(err => {
        console.error("Erro ao carregar arquivos de trajetória:", err);
      });
  };

  /**
   * Carrega a trajetória para a camada atual
   */
  const loadTrajectoryForCurrentLayer = () => {
    const currentLayer = state.geojsonLayers[state.currentIndex];
    if (!currentLayer) return;
    
    const baseName = utils.getBaseName(currentLayer.fileName);
    let trajectoryUrl = state.trajectoryFiles[baseName] ||
      Object.keys(state.trajectoryFiles).find(k => 
        k.toLowerCase() === baseName.toLowerCase()
      );
    
    if (!trajectoryUrl) {
      // Fallback para a URL raw do GitHub
      trajectoryUrl = CONFIG.DIRECTORIES.TRAJECTORY + baseName;
      console.info("Fallback para GitHub raw URL para trajectory:", trajectoryUrl);
    }
    
    // Remover qualquer layer de trajetória existente
    removeTrajectoryLayer();
    
    // Se já temos os dados da trajetória, apenas exibimos
    if (currentLayer.trajectoryGeojson) {
      state.currentTrajectoryLayer = createTrajectoryLayer(currentLayer.trajectoryGeojson);
      state.currentTrajectoryLayer.addTo(elements.map);
      currentLayer.trajectoryLayer = state.currentTrajectoryLayer;
      return;
    }
    
    // Caso contrário, carregamos os dados
    fetch(trajectoryUrl)
      .then(r => { 
        if (!r.ok) throw new Error(trajectoryUrl); 
        return r.json(); 
      })
      .then(geojson => {
        currentLayer.trajectoryGeojson = geojson;
        state.currentTrajectoryLayer = createTrajectoryLayer(geojson);
        state.currentTrajectoryLayer.addTo(elements.map);
        currentLayer.trajectoryLayer = state.currentTrajectoryLayer;
      })
      .catch(err => { 
        console.error("Erro ao carregar trajetória:", err); 
        elements.showTrajectoryCheckbox.checked = false; 
      });
  };

  /**
   * Gera opções de campos para exibição
   */
  const generateFieldOptions = () => {
    elements.dynamicOptionsContainer.innerHTML = "";
    CONFIG.DISPLAY_KEYS.forEach(field => {
      const container = document.createElement("div"),
        label = document.createElement("label"),
        checkbox = document.createElement("input");
      
      container.className = "field-option";
      checkbox.type = "checkbox"; 
      checkbox.name = field; 
      checkbox.checked = false;
      checkbox.addEventListener("change", updateDisplayOptions);
      
      label.appendChild(checkbox);
      label.appendChild(document.createTextNode("" + field));
      container.appendChild(label);
      elements.dynamicOptionsContainer.appendChild(container);
    });
    updateMarkers();
  };

  /**
   * Atualiza as opções de exibição com base nas escolhas do usuário
   */
  const updateDisplayOptions = () => {
    CONFIG.DISPLAY_KEYS.forEach(field => {
      const chk = document.querySelector(`input[name="${field}"]`);
      if (chk) {
        state.displayOptions[field] = chk.checked;
        // Salvar no localStorage
        localStorage.setItem('displayOptions', JSON.stringify(state.displayOptions));
      }
    });
    updateMarkers();
  };

  /**
   * Atualiza a exibição da trajetória
   */
  const updateTrajectoryDisplay = () =>
    elements.showTrajectoryCheckbox.checked ? loadTrajectoryForCurrentLayer() : removeTrajectoryLayer();

  /**
   * Atualiza o filtro de limite
   */
  const updateThresholdFilter = () => {
    for (const radio of elements.thresholdRadios) {
      if (radio.checked) { 
        state.currentThresholdFilter = radio.value; 
        break; 
      }
    }
    updateBoundaryLayer();
    updateMarkers();
    if (elements.showTrajectoryCheckbox.checked) loadTrajectoryForCurrentLayer();
  };

  /**
   * Mostra a camada no índice especificado
   */
  const showLayerAtIndex = index => {
    if (index < 0 || index >= state.geojsonLayers.length) return;
    
    // Salvar o UID atual antes de remover a camada
    const currentSelectedUid = state.selection.uid;
    
    removeCurrentLayer();
    state.currentIndex = index;
    updateBoundaryLayer();
    
    // Se havia um polígono selecionado, tentar selecioná-lo novamente na nova camada
    if (currentSelectedUid) {
      // Restaurar a seleção do UID na nova camada
      state.selection.uid = currentSelectedUid;
      
      // Tentar encontrar o polígono na nova camada e aplicar estilo
      let found = false;
      state.currentBoundaryLayer.eachLayer(layer => {
        if (layer.feature && 
            layer.feature.properties && 
            layer.feature.properties.uid === currentSelectedUid &&
            passesThreshold(layer.feature)) {
          
          state.selection.feature = layer.feature;
          state.selection.layer = layer;
          layer.setStyle(CONFIG.STYLES.SELECTED);
          
          updatePolygonChart(layer.feature);
          found = true;
        }
      });
      
      if (!found) {
        state.selection.feature = null;
        state.selection.layer = null;
        document.getElementById(CONFIG.DOM_IDS.POLYGON_CHART_CONTAINER).style.display = "none";
      }
    }
    
    // Atualizar os marcadores com as opções de exibição atuais
    updateMarkers();
    updateTimestampInfo(state.geojsonLayers[state.currentIndex]);
    updateTrajectoryDisplay();
    elements.timelineSlider.value = state.currentIndex;
    updateTimelineProgress();
  };

  /**
   * Atualiza o intervalo de reprodução
   */
  const updatePlayInterval = () => {
    if (state.playInterval) clearInterval(state.playInterval);
    
    state.playInterval = setInterval(() => {
      let next = state.currentIndex + 1;
      if (next >= state.geojsonLayers.length) next = 0;
      showLayerAtIndex(next);
    }, parseFloat(elements.speedInput.value) * 1000);
  };

  // ============ CONFIGURAÇÃO DE EVENTOS ============
  elements.timelineSlider.addEventListener("input", e => {
    const idx = parseInt(e.target.value);
    if (!isNaN(idx)) showLayerAtIndex(idx);
  });
  
  elements.prevBtn.addEventListener("click", () => 
    showLayerAtIndex((state.currentIndex - 1 + state.geojsonLayers.length) % state.geojsonLayers.length)
  );
  
  elements.nextBtn.addEventListener("click", () => 
    showLayerAtIndex((state.currentIndex + 1) % state.geojsonLayers.length)
  );
  
  elements.playPauseBtn.addEventListener("click", () => {
    if (!state.geojsonLayers.length) return;
    
    state.playing = !state.playing;
    elements.playPauseBtn.textContent = state.playing ? "Pause" : "Play";
    
    if (state.playing) {
      updatePlayInterval();
    } else {
      clearInterval(state.playInterval);
    }
  });
  
  elements.speedInput.addEventListener("input", () => {
    elements.speedValueSpan.textContent = elements.speedInput.value;
    if (state.playing) updatePlayInterval();
  });
  
  elements.showTrajectoryCheckbox.addEventListener("change", updateTrajectoryDisplay);
  
  Array.from(elements.thresholdRadios).forEach(radio => 
    radio.addEventListener("change", updateThresholdFilter)
  );

  // Adicionar uma função para limpar todos os event listeners quando houver recarregamento
  const clearEventListeners = () => {
    elements.timelineSlider.removeEventListener("input", handleTimelineChange);
    elements.prevBtn.removeEventListener("click", handlePrevClick);
    elements.nextBtn.removeEventListener("click", handleNextClick);
    elements.playPauseBtn.removeEventListener("click", handlePlayPauseClick);
    elements.speedInput.removeEventListener("input", handleSpeedChange);
    elements.showTrajectoryCheckbox.removeEventListener("change", updateTrajectoryDisplay);
    
    Array.from(elements.thresholdRadios).forEach(radio => 
      radio.removeEventListener("change", updateThresholdFilter)
    );
    
    elements.map.off();
  };

  // ============ INICIALIZAÇÃO DA APLICAÇÃO ============
  generateFieldOptions();
  loadTrajectoryFiles();
  loadBoundaryLayers();

  // Verificar novos arquivos periodicamente
  setInterval(checkForNewBoundaryFiles, CONFIG.AUTO_CHECK_INTERVAL);

  /**
   * Seleciona um polígono pelo seu UID
   */
  const selectPolygonByUid = (uid) => {
    let found = false;
    
    state.currentBoundaryLayer.eachLayer(layer => {
      if (layer.feature && layer.feature.properties && layer.feature.properties.uid === uid) {
        // Encontramos o polígono com o mesmo UID
        state.selection.feature = layer.feature;
        state.selection.layer = layer;
        // Aplicar estilo
        layer.setStyle(CONFIG.STYLES.SELECTED);
        // Atualizar o gráfico com os dados do polígono
        updatePolygonChart(layer.feature);
        found = true;
      }
    });
    
    if (found) {
      // Se encontramos o polígono, mantemos o UID selecionado
      state.selection.uid = uid;
    } else {
      // Se não encontramos o polígono com este UID nesta camada, limpamos a seleção
      state.selection.uid = null;
      state.selection.feature = null;
      state.selection.layer = null;
      // Esconder o gráfico
      document.getElementById(CONFIG.DOM_IDS.POLYGON_CHART_CONTAINER).style.display = "none";
    }
    
    return found;
  };

  // Adicione esta função ao seu arquivo script.js
  function updateTimelineProgress() {
    const timeline = document.getElementById('timeline');
    if (timeline) {
      const value = timeline.value;
      const max = timeline.max || 100;
      const progress = (value / max) * 100;
      timeline.style.setProperty('--progress', `${progress}%`);
    }
  }

  // Exportar para o escopo global para permitir chamar de fora
  window.updateTimelineProgress = updateTimelineProgress;
  window.updatePlayerProgress = updateTimelineProgress; // Alias para compatibilidade

  // Adicione estes event listeners
  const timeline = document.getElementById('timeline');
  if (timeline) {
    timeline.addEventListener('input', updateTimelineProgress);
    
    // Atualize também quando o valor mudar programaticamente
    const originalSetAttribute = timeline.setAttribute;
    timeline.setAttribute = function(name, value) {
      originalSetAttribute.call(this, name, value);
      if (name === 'value') {
        updateTimelineProgress();
      }
    };
    
    // Inicialização
    updateTimelineProgress();
  }

  // Adicionar novos manipuladores de eventos
  const eventHandlers = {
    /**
     * Manipula o clique no botão de ajuda
     */
    handleHelpButtonClick: () => {
      state.helpModalVisible = !state.helpModalVisible;
      elements.helpModal.style.display = state.helpModalVisible ? 'block' : 'none';
    },

    /**
     * Manipula o clique no botão de fechar o modal
     */
    handleCloseModalClick: () => {
      state.helpModalVisible = false;
      elements.helpModal.style.display = 'none';
    },

    /**
     * Manipula o clique no botão de alternar painel
     */
    handleTogglePanelClick: () => {
      state.isPanelCollapsed = !state.isPanelCollapsed;
      const panel = elements.infoPanel;
      const toggleButton = elements.togglePanel;
      
      if (state.isPanelCollapsed) {
        panel.style.transform = 'translateX(calc(100% - 40px))';
        toggleButton.innerHTML = '<i class="fas fa-chevron-right"></i>';
        // Garantir que o painel fique visível
        panel.style.opacity = '1';
        panel.style.pointerEvents = 'auto';
      } else {
        panel.style.transform = 'translateX(0)';
        toggleButton.innerHTML = '<i class="fas fa-chevron-left"></i>';
      }
      
      // Salvar estado do painel
      localStorage.setItem('panelState', state.isPanelCollapsed ? 'collapsed' : 'expanded');
    },

    /**
     * Manipula a mudança de camada do mapa
     */
    handleMapLayerChange: (layerName) => {
      state.currentMapLayer = layerName;
      const layerConfig = CONFIG.MAP.LAYERS[layerName];
      
      // Remove a camada atual
      if (state.currentMapLayer) {
        elements.map.removeLayer(elements.mapLayer);
      }
      
      // Adiciona a nova camada
      elements.mapLayer = L.tileLayer(layerConfig.url, {
        attribution: layerConfig.attribution
      }).addTo(elements.map);
    }
  };

  // Adicionar novas funções de inicialização
  const init = {
    /**
     * Inicializa os controles de camada do mapa
     */
    initMapLayerControls: () => {
      const container = elements.layerControls;
      container.innerHTML = '';
      
      Object.entries(CONFIG.MAP.LAYERS).forEach(([key, layer]) => {
        const label = document.createElement('label');
        const radio = document.createElement('input');
        radio.type = 'radio';
        radio.name = 'mapLayer';
        radio.value = key;
        radio.checked = key === state.currentMapLayer;
        
        radio.addEventListener('change', () => eventHandlers.handleMapLayerChange(key));
        
        label.appendChild(radio);
        label.appendChild(document.createTextNode(layer.name));
        container.appendChild(label);
      });
    },

    /**
     * Inicializa os eventos do modal de ajuda
     */
    initHelpModal: () => {
      elements.helpButton.addEventListener('click', eventHandlers.handleHelpButtonClick);
      elements.closeModal.addEventListener('click', eventHandlers.handleCloseModalClick);
      
      // Fechar modal ao clicar fora
      window.addEventListener('click', (event) => {
        if (event.target === elements.helpModal) {
          eventHandlers.handleCloseModalClick();
        }
      });
    },

    /**
     * Inicializa os eventos do painel de informações
     */
    initInfoPanel: () => {
      elements.togglePanel.addEventListener('click', eventHandlers.handleTogglePanelClick);
    }
  };

  // Inicializar novos componentes
  init.initMapLayerControls();
  init.initHelpModal();
  init.initInfoPanel();
  
  // Restaurar estado do painel
  const savedPanelState = localStorage.getItem('panelState');
  if (savedPanelState === 'collapsed') {
    state.isPanelCollapsed = true;
    elements.infoPanel.style.transform = 'translateX(calc(100% - 40px))';
    elements.togglePanel.innerHTML = '<i class="fas fa-chevron-right"></i>';
  }

  // Carregar campos selecionados do localStorage
  const loadSelectedFields = () => {
    const savedFields = localStorage.getItem('selectedFields');
    if (savedFields) {
      const selectedFields = JSON.parse(savedFields);
      elements.fieldCheckboxes.forEach(checkbox => {
        checkbox.checked = selectedFields.includes(checkbox.value);
      });
    }
  };

  // Chamar a função quando a página carregar
  document.addEventListener('DOMContentLoaded', loadSelectedFields);

  // Adicione no início do arquivo, após a definição do state:
  // Carregar opções de exibição do localStorage
  const loadDisplayOptions = () => {
    const savedOptions = localStorage.getItem('displayOptions');
    if (savedOptions) {
      state.displayOptions = JSON.parse(savedOptions);
      // Atualizar os checkboxes
      Object.entries(state.displayOptions).forEach(([key, value]) => {
        const checkbox = document.querySelector(`input[name="${key}"]`);
        if (checkbox) {
          checkbox.checked = value;
        }
      });
    }
  };

  // Chamar a função quando a página carregar
  document.addEventListener('DOMContentLoaded', loadDisplayOptions);

  // Função para centralizar o gráfico na tela
  function centerChart() {
    const containerRect = chartContainer.getBoundingClientRect();
    const windowWidth = window.innerWidth;
    const windowHeight = window.innerHeight;
    
    const centerX = (windowWidth - containerRect.width) / 2;
    const centerY = (windowHeight - containerRect.height) / 2;
    
    setTranslate(centerX, centerY, chartContainer);
    xOffset = centerX;
    yOffset = centerY;
  }

  // Adicionar listener para redimensionamento da janela
  window.addEventListener('resize', () => {
    // Se o gráfico estiver visível, ajustar sua posição
    if (chartContainer.style.display !== 'none') {
      const containerRect = chartContainer.getBoundingClientRect();
      const windowWidth = window.innerWidth;
      const windowHeight = window.innerHeight;
      
      // Verificar se o gráfico está fora da tela
      if (xOffset + containerRect.width > windowWidth || 
          yOffset + containerRect.height > windowHeight) {
        centerChart();
      }
    }
  });
});

// Na função updateFeatureInfo:
updateFeatureInfo: (feature) => {
  const infoContent = elements.infoContent;
  if (!feature) {
    infoContent.innerHTML = '<p>Nenhum elemento selecionado</p>';
    return;
  }

  const properties = feature.getProperties();
  const selectedFields = Array.from(elements.fieldCheckboxes)
    .filter(checkbox => checkbox.checked)
    .map(checkbox => checkbox.value);

  let html = '<div class="feature-info">';
  
  // Mostrar campos marcados primeiro
  if (selectedFields.length > 0) {
    html += '<div class="selected-fields">';
    selectedFields.forEach(field => {
      if (properties[field] !== undefined) {
        html += `<div class="field-item">
          <span class="field-label">${field}:</span>
          <span class="field-value">${properties[field]}</span>
        </div>`;
      }
    });
    html += '</div>';
  }

  // Mostrar outros campos
  html += '<div class="other-fields">';
  Object.entries(properties).forEach(([key, value]) => {
    if (!selectedFields.includes(key) && value !== undefined) {
      html += `<div class="field-item">
        <span class="field-label">${key}:</span>
        <span class="field-value">${value}</span>
      </div>`;
    }
  });
  html += '</div></div>';

  infoContent.innerHTML = html;
  
  // Salvar campos selecionados
  localStorage.setItem('selectedFields', JSON.stringify(selectedFields));
}
