/**
 * Aplicação de Visualização Geoespacial
 * 
 * Esta aplicação carrega e exibe dados geoespaciais de fronteiras e trajetórias em um mapa.
 * Permite navegação no tempo através de diferentes camadas, filtro por limites e exibição
 * de informações sobre as características geoespaciais.
 */

// ============ CONFIGURAÇÕES E CONSTANTES ============
const CONFIG = {
  DISPLAY_KEYS: ['uid', 'status', 'size', 'min', 'ang_'],
  DEFAULT_THRESHOLD: "235.0",
  AUTO_CHECK_INTERVAL: 60000, // 60 segundos
  TIME_OFFSET: -3, // UTC-3 horas
  TIME_INCREMENT: 10, // +10 minutos
  DIRECTORIES: {
    BOUNDARY: "track/boundary/",
    TRAJECTORY: "track/trajectory/"
  },
  MAP: {
    BOUNDS: [[-35.01807360131674, -79.99568018181952], [4.986926398683252, -30.000680181819533]],
    DEFAULT_ZOOM: 4.4, // Nível de zoom padrão (valores maiores = mais zoom)
    TILE_LAYER: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
    TILE_ATTRIBUTION: "© OpenStreetMap contributors"
  },
  STYLES: {
    BOUNDARY: { color: "#3388ff", weight: 1, opacity: 1, fillOpacity: 0.2 },
    TRAJECTORY: { color: "#FF0000", weight: 2, opacity: 0.7 },
    SELECTED: { color: "#FF00FF", weight: 3, opacity: 1, fillOpacity: 0.3 } // Estilo para polígono selecionado
  },
  GITHUB: {
    RAW_URL: "https://raw.githubusercontent.com/fortracc/fortracc.github.io/main/",
    BOUNDARY_API: "",
    TRAJECTORY_API: ""
  },
  CHART: {
    EVOLUTION_VARIABLES: ['size', 'min', 'max'], // Variáveis que podem ser exibidas no gráfico de evolução
    DEFAULT_VARIABLE: 'size' // Variável exibida por padrão
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
  }
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
  }
};

document.addEventListener("DOMContentLoaded", () => {
  // Adicione no início do DOMContentLoaded
  // Estilo para os popups de features
  const popupStyle = document.createElement('style');
  popupStyle.textContent = `
    .feature-popup {
      padding: 5px;
      max-width: 300px;
      font-size: 14px;
    }
    .feature-popup strong {
      font-weight: bold;
      color: #333;
    }
  `;
  document.head.appendChild(popupStyle);

  /// Modificar o container do gráfico para ficar no topo direito com tamanho reduzido
  const chartContainer = document.createElement("div");
  chartContainer.id = "polygon-chart-container";
  chartContainer.style.cssText = "position: absolute; top: 10px; right: 10px; width: 300px; height: 290px; background: white; border-radius: 5px; box-shadow: 0 0 10px rgba(0,0,0,0.2); padding: 10px; display: none; z-index: 1000;";
  
  const chartTitle = document.createElement("h4");
  chartTitle.style.cssText = "margin: 0 0 10px 0; font-size: 14px; text-align: center;";
  chartTitle.textContent = "System Evolution";
  
  // Adicionar seletor de variável para o gráfico
  const variableSelector = document.createElement("select");
  variableSelector.id = "variable-selector";
  variableSelector.style.cssText = "display: block; margin: 5px auto; width: 80%;";
  CONFIG.CHART.EVOLUTION_VARIABLES.forEach(variable => {
    const option = document.createElement("option");
    option.value = variable;
    option.text = variable.charAt(0).toUpperCase() + variable.slice(1);
    if (variable === CONFIG.CHART.DEFAULT_VARIABLE) {
      option.selected = true;
    }
    variableSelector.appendChild(option);
  });
  
  // Ajustar a altura do canvas para o gráfico
  const chartCanvas = document.createElement("canvas");
  chartCanvas.id = "polygon-chart";
  chartCanvas.style.width = "100%";
  chartCanvas.style.height = "100px"; // Aumentar a altura do canvas
  
  const closeButton = document.createElement("button");
  closeButton.textContent = "×";
  closeButton.style.cssText = "position: absolute; top: 5px; right: 5px; background: none; border: none; font-size: 18px; cursor: pointer; padding: 0 5px;";
  closeButton.addEventListener("click", () => {
    chartContainer.style.display = "none";
  });
  
  chartContainer.appendChild(closeButton);
  chartContainer.appendChild(chartTitle);
  chartContainer.appendChild(variableSelector);
  chartContainer.appendChild(chartCanvas);
  document.body.appendChild(chartContainer);
  
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
      
      // Armazenar o ponto de dados
      dataPoints.push({
        timestamp: timestamp,
        originalDate: new Date(timestamp), // Para ordenação correta
        size: parseFloat(feature.properties.size || 0),
        min: parseFloat(feature.properties.min || 0),
        max: parseFloat(feature.properties.max || 0)
      });
    });
    
    // Ordenar pelo timestamp real (data)
    dataPoints.sort((a, b) => a.originalDate - b.originalDate);
    
    // Separar em arrays para o gráfico
    const timeSeriesData = {
      timestamps: dataPoints.map(p => p.timestamp),
      size: dataPoints.map(p => p.size),
      min: dataPoints.map(p => p.min),
      max: dataPoints.map(p => p.max)
    };
    
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
    
    // Filtrar dados até o timestamp atual
    const timeSeriesData = {
      timestamps: allTimeSeriesData.timestamps.slice(0, currentIndex),
      size: allTimeSeriesData.size.slice(0, currentIndex),
      min: allTimeSeriesData.min.slice(0, currentIndex),
      max: allTimeSeriesData.max.slice(0, currentIndex)
    };
    
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
        maintainAspectRatio: false,
        plugins: {
          legend: {
            display: true,
            position: 'top'
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
            }
          }
        },
        scales: {
          x: {
            title: {
              display: true,
              text: 'Time',
              padding: {
                top: 10 // Adicionar padding para acomodar os rótulos
              }
            },
            ticks: {
              maxRotation: 45,
              minRotation: 45,
              autoSkip: true,
              maxTicksLimit: 8, // Reduzir o número de rótulos para evitar sobreposição
              padding: 8, // Adicionar padding aos rótulos
              font: {
                size: 10 // Reduzir o tamanho da fonte para caber melhor
              }
            }
          },
          y: {
            title: {
              display: true,
              text: selectedVariable.charAt(0).toUpperCase() + selectedVariable.slice(1)
            },
            ticks: {
              callback: function(value) {
                return Number.isInteger(value) ? value : value.toFixed(2);
              }
            }
          }
        }
      }
    });
    
    // Mostrar o container do gráfico
    document.getElementById(CONFIG.DOM_IDS.POLYGON_CHART_CONTAINER).style.display = "block";
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
      center: [
        (CONFIG.MAP.BOUNDS[0][0] + CONFIG.MAP.BOUNDS[1][0]) / 2, 
        (CONFIG.MAP.BOUNDS[0][1] + CONFIG.MAP.BOUNDS[1][1]) / 2
      ],
      zoom: CONFIG.MAP.DEFAULT_ZOOM,
      zoomSnap: 0.1,  // Permite níveis de zoom com incrementos de 0.1
      zoomDelta: 0.1  // Permite alteração do zoom em incrementos de 0.1
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
    thresholdRadios: document.getElementsByName("thresholdFilter")
  };

  // Configuração inicial do mapa
  L.tileLayer(CONFIG.MAP.TILE_LAYER, { attribution: CONFIG.MAP.TILE_ATTRIBUTION }).addTo(elements.map);
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
    filter: passesThreshold,
    style: CONFIG.STYLES.TRAJECTORY
  });

  /**
   * Computa o centroide de uma feature poligonal
   */
  const computeCentroid = feature => {
    if (!feature.geometry || feature.geometry.type !== "Polygon") return null;
    const coords = feature.geometry.coordinates[0];
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
          date.setTime(date.getTime() + (CONFIG.TIME_OFFSET * 60 * 60 * 1000) + (CONFIG.TIME_INCREMENT * 60 * 1000));
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
      if (state.geojsonLayers[state.currentIndex]) {
        state.geojsonLayers[state.currentIndex].trajectoryLayer = null;
      }
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
      }
    });
    
    state.currentBoundaryLayer.addTo(elements.map);
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
      let loadedCount = 0;
      files.forEach(file => {
        fetch(file.download_url)
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
          .catch(err => console.error(`Erro ao carregar arquivo ${file.name}:`, err))
          .finally(() => {
            loadedCount++;
            if (loadedCount === files.length && state.geojsonLayers.length > 0) {
              // Processamento após carregar todos os arquivos
              state.geojsonLayers.sort((a, b) => 
                a.fileName.toLowerCase().localeCompare(b.fileName.toLowerCase())
              );
              
              // Configurar UI
              elements.timelineSlider.disabled = false;
              elements.timelineSlider.min = 0;
              elements.timelineSlider.max = state.geojsonLayers.length - 1;
              elements.timelineSlider.value = state.geojsonLayers.length - 1; // Último índice
              
              // Exibir última camada
              showLayerAtIndex(state.geojsonLayers.length - 1);
              state.playing = false;
              elements.playPauseBtn.textContent = "Play";
            }
          });
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
      trajectoryUrl = CONFIG.GITHUB.RAW_URL + CONFIG.DIRECTORIES.TRAJECTORY + baseName;
      console.info("Fallback para GitHub raw URL para trajectory:", trajectoryUrl);
    }
    
    // Se já temos os dados da trajetória, apenas exibimos
    if (currentLayer.trajectoryGeojson) {
      if (state.currentTrajectoryLayer) elements.map.removeLayer(state.currentTrajectoryLayer);
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

  // ============ CONTROLES DE UI E INTERAÇÃO ============
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
      if (chk) state.displayOptions[field] = chk.checked;
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
    
    removeCurrentLayer();
    state.currentIndex = index;
    updateBoundaryLayer();
    
    // Se há um UID selecionado, tentar encontrar o polígono correspondente na nova camada
    if (state.selection.uid) {
      selectPolygonByUid(state.selection.uid);
    }
    
    updateMarkers();
    updateTimestampInfo(state.geojsonLayers[state.currentIndex]);
    updateTrajectoryDisplay();
    elements.timelineSlider.value = state.currentIndex;
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
});