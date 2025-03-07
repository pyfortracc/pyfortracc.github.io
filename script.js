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
  selectedFeature: null,     // Armazena feature selecionada
  selectedLayer: null,       // Armazena layer selecionada
  selectedFeatureUid: null   // Armazena o UID do feature selecionado para persistência entre camadas
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

  // Modificar o container do gráfico para ficar no topo direito
  const chartContainer = document.createElement("div");
  chartContainer.id = "polygon-chart-container";
  chartContainer.style.cssText = "position: absolute; top: 10px; right: 10px; width: 380px; height: 250px; background: white; border-radius: 5px; box-shadow: 0 0 10px rgba(0,0,0,0.2); padding: 10px; display: none; z-index: 1000;";
  
  const chartTitle = document.createElement("h4");
  chartTitle.style.cssText = "margin: 0 0 10px 0; font-size: 14px; text-align: center;";
  chartTitle.textContent = "Evolução do Polígono";
  
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
  
  const chartCanvas = document.createElement("canvas");
  chartCanvas.id = "polygon-chart";
  chartCanvas.style.width = "100%";
  chartCanvas.style.height = "170px";
  
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
  const chartScript = document.createElement("script");
  chartScript.src = "https://cdn.jsdelivr.net/npm/chart.js@3.9.1/dist/chart.min.js";
  chartScript.onload = function() {
    console.log("Chart.js carregado com sucesso");
  };
  document.head.appendChild(chartScript);
  
  // Variável para armazenar a instância do gráfico
  let polygonChart = null;

  // Adicionar change event ao seletor de variável
  variableSelector.addEventListener("change", () => {
    if (state.selectedFeature) {
      updatePolygonChart(state.selectedFeature);
    }
  });

  /**
   * Função que coleta dados do polígono em todas as camadas de tempo
   */
  const collectPolygonDataOverTime = (uid) => {
    // Array para armazenar dados temporais ordenados
    const dataPoints = [];
    
    // Percorre todas as camadas para encontrar o mesmo UID
    state.geojsonLayers.forEach(layer => {
      if (layer.geojson && layer.geojson.features) {
        // Encontra o polígono com o UID específico nesta camada
        const feature = layer.geojson.features.find(f => 
          f.properties && f.properties.uid === uid);
        
        if (feature && feature.properties) {
          // Extrai timestamp do nome do arquivo
          const fileNameMatch = layer.fileName.match(/(\d{4})(\d{2})(\d{2})_(\d{2})(\d{2})/);
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
            const ts = localDate.toISOString().replace('T', ' ').substring(0, 16);
            
            // Armazenar o ponto de dados com seu timestamp original para ordenação posterior
            dataPoints.push({
              timestamp: ts,
              originalDate: localDate, // Para ordenação correta
              size: parseFloat(feature.properties.size || 0),
              min: parseFloat(feature.properties.min || 0),
              max: parseFloat(feature.properties.max || 0)
            });
          }
        }
      }
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
    
    return timeSeriesData;
  };

  /**
   * Atualiza o gráfico com dados do polígono selecionado
   */
  const updatePolygonChart = (feature) => {
    if (!feature || !feature.properties) return;
    
    const props = feature.properties;
    const uid = props.uid || "N/A";
    
    chartTitle.textContent = `Evolução do Polígono UID: ${uid}`;
    
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
    
    // Obter a variável selecionada
    const selectedVariable = document.getElementById("variable-selector").value;
    
    // Destruir gráfico anterior se existir
    if (polygonChart) {
      polygonChart.destroy();
    }
    
    // Criar novo gráfico de linha
    polygonChart = new Chart(document.getElementById('polygon-chart'), {
      type: 'line',
      data: {
        labels: timeSeriesData.timestamps,
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
                return `Timestamp: ${items[0].label}`;
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
              text: 'Timestamp'
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
    chartContainer.style.display = "block";
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

  // Adicionar div para o gráfico no HTML
  const chartContainerOld = document.createElement("div");
  chartContainerOld.id = "polygon-chart-container";
  chartContainerOld.style.cssText = "position: absolute; bottom: 10px; right: 10px; width: 300px; height: 200px; background: white; border-radius: 5px; box-shadow: 0 0 10px rgba(0,0,0,0.2); padding: 10px; display: none; z-index: 1000;";
  
  const chartTitleOld = document.createElement("h4");
  chartTitleOld.style.cssText = "margin: 0 0 10px 0; font-size: 14px; text-align: center;";
  chartTitleOld.textContent = "Polígono Selecionado";
  
  const chartCanvasOld = document.createElement("canvas");
  chartCanvasOld.id = "polygon-chart";
  chartCanvasOld.style.width = "100%";
  chartCanvasOld.style.height = "150px";
  
  const closeButtonOld = document.createElement("button");
  closeButtonOld.textContent = "×";
  closeButtonOld.style.cssText = "position: absolute; top: 5px; right: 5px; background: none; border: none; font-size: 18px; cursor: pointer; padding: 0 5px;";
  closeButtonOld.addEventListener("click", () => {
    chartContainerOld.style.display = "none";
  });
  
  chartContainerOld.appendChild(closeButtonOld);
  chartContainerOld.appendChild(chartTitleOld);
  chartContainerOld.appendChild(chartCanvasOld);
  document.body.appendChild(chartContainerOld);
  
  // Adicionar a biblioteca Chart.js
  const chartScriptOld = document.createElement("script");
  chartScriptOld.src = "https://cdn.jsdelivr.net/npm/chart.js@3.9.1/dist/chart.min.js";
  chartScriptOld.onload = function() {
    console.log("Chart.js carregado com sucesso");
  };
  document.head.appendChild(chartScriptOld);
  
  // Variável para armazenar a instância do gráfico
  let polygonChartOld = null;

  // Função para criar ou atualizar o gráfico com os dados do polígono
  const updatePolygonChartOld = (feature) => {
    if (!feature || !feature.properties) return;
    
    const props = feature.properties;
    const uid = props.uid || "N/A";
    const size = props.size !== undefined ? parseFloat(props.size) : 0;
    const min = props.min !== undefined ? parseFloat(props.min) : 0;
    const max = props.max !== undefined ? parseFloat(props.max) : 0;
    
    chartTitleOld.textContent = `Polígono UID: ${uid}`;
    
    // Verificar se Chart.js está disponível
    if (typeof Chart === "undefined") {
      console.error("Chart.js não foi carregado ainda");
      return;
    }
    
    // Destruir gráfico anterior se existir
    if (polygonChartOld) {
      polygonChartOld.destroy();
    }
    
    // Criar novo gráfico
    polygonChartOld = new Chart(document.getElementById('polygon-chart'), {
      type: 'bar',
      data: {
        labels: ['Size', 'Min', 'Max'],
        datasets: [{
          label: 'Valores',
          data: [size, min, max],
          backgroundColor: [
            'rgba(54, 162, 235, 0.6)',
            'rgba(75, 192, 192, 0.6)',
            'rgba(255, 99, 132, 0.6)'
          ],
          borderColor: [
            'rgb(54, 162, 235)',
            'rgb(75, 192, 192)',
            'rgb(255, 99, 132)'
          ],
          borderWidth: 1
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          y: {
            beginAtZero: true
          }
        }
      }
    });
    
    // Mostrar o container do gráfico
    chartContainerOld.style.display = "block";
  };

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
    
    // Debug do nome do arquivo
    console.log("Processando arquivo:", obj.fileName);
    
    // Extrair timestamp do nome do arquivo (formato: YYYYMMDD_HHMM)
    const fileNameMatch = obj.fileName.match(/(\d{4})(\d{2})(\d{2})_(\d{2})(\d{2})/);
    
    if (fileNameMatch) {
      const [_, year, month, day, hour, minute] = fileNameMatch;
      console.log(`Timestamp extraído: ${year}-${month}-${day} ${hour}:${minute}`);
      
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
      console.log(`Timestamp formatado: ${ts}`);
    } else {
      console.log("Nenhum timestamp encontrado no nome do arquivo, tentando GeoJSON");
      // Fallback: tentar obter do GeoJSON se a extração do nome do arquivo falhar
      if (obj.geojson && obj.geojson.features && obj.geojson.features.length > 0) {
        ts = obj.geojson.features[0].timestamp ||
             (obj.geojson.features[0].properties && obj.geojson.features[0].properties.timestamp) || "";
        
        console.log(`Timestamp do GeoJSON: ${ts}`);
        
        // Aplicar offset e incremento se timestamp estiver presente
        if (ts) {
          const date = new Date(ts);
          // Aplicar ajuste de fuso horário e incremento de minutos
          date.setTime(date.getTime() + (CONFIG.TIME_OFFSET * 60 * 60 * 1000) + (CONFIG.TIME_INCREMENT * 60 * 1000));
          ts = date.toISOString().replace('T', ' ').substring(0, 16);
          console.log(`Timestamp ajustado: ${ts}`);
        }
      } else {
        console.log("Nenhum timestamp encontrado no GeoJSON");
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
    state.selectedFeature = null;
    state.selectedLayer = null;
    
    let obj = state.geojsonLayers[state.currentIndex];
    state.currentBoundaryLayer = L.geoJSON(obj.geojson, {
      filter: passesThreshold,
      style: feature => {
        // Aplica estilo de seleção se o feature tiver o UID selecionado
        return state.selectedFeatureUid && feature.properties.uid === state.selectedFeatureUid 
          ? CONFIG.STYLES.SELECTED 
          : CONFIG.STYLES.BOUNDARY;
      },
      onEachFeature: (feature, layer) => {
        // Adiciona evento de clique para mostrar informações do polígono
        layer.on('click', (e) => {
          L.DomEvent.stopPropagation(e); // Evita a propagação do evento para o mapa
          
          // Se estamos clicando no mesmo polígono, desseleciona
          if (state.selectedFeatureUid === feature.properties.uid) {
            // Desselecionar completamente
            state.selectedFeatureUid = null;
            state.selectedFeature = null;
            state.selectedLayer = null;
            
            // Restaurar o estilo padrão
            layer.setStyle(CONFIG.STYLES.BOUNDARY);
            
            // Esconder o gráfico
            document.getElementById('polygon-chart-container').style.display = "none";
            
            updateMarkers(); // Atualiza os marcadores para mostrar todos
            return;
          }
          
          // Resetar o estilo de todos os polígonos
          state.currentBoundaryLayer.eachLayer(l => {
            state.currentBoundaryLayer.resetStyle(l);
          });
          
          // Define este como o novo polígono selecionado
          state.selectedFeatureUid = feature.properties.uid;
          state.selectedFeature = feature;
          state.selectedLayer = layer;
          
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
    
    // Adicionar evento de clique no mapa para limpar a seleção
    elements.map.off('click'); // Remove eventos anteriores para evitar duplicação
    elements.map.on('click', function() {
      if (state.selectedFeatureUid) {
        // Limpar tudo
        state.currentBoundaryLayer.eachLayer(layer => {
          state.currentBoundaryLayer.resetStyle(layer);
        });
        
        state.selectedFeatureUid = null;
        state.selectedFeature = null;
        state.selectedLayer = null;
        // Esconder o gráfico
        document.getElementById('polygon-chart-container').style.display = "none";
        updateMarkers(); // Atualiza marcadores para mostrar todos conforme config global
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
        if (state.selectedFeature) {
          return feature.properties.uid === state.selectedFeature.properties.uid && passesThreshold(feature);
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
    if (state.selectedFeatureUid) {
      selectPolygonByUid(state.selectedFeatureUid);
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

  // ============ INICIALIZAÇÃO DA APLICAÇÃO ============
  generateFieldOptions();
  loadTrajectoryFiles();
  loadBoundaryLayers();

  // Verificar novos arquivos periodicamente
  setInterval(checkForNewBoundaryFiles, CONFIG.AUTO_CHECK_INTERVAL);
});

/**
 * Seleciona um polígono pelo seu UID
 */
const selectPolygonByUid = (uid) => {
  let found = false;
  
  state.currentBoundaryLayer.eachLayer(layer => {
    if (layer.feature && layer.feature.properties && layer.feature.properties.uid === uid) {
      // Encontramos o polígono com o mesmo UID
      state.selectedFeature = layer.feature;
      state.selectedLayer = layer;
      // Aplicar estilo
      layer.setStyle(CONFIG.STYLES.SELECTED);
      // Atualizar o gráfico com os dados do polígono
      updatePolygonChart(layer.feature);
      found = true;
    }
  });
  
  if (found) {
    // Se encontramos o polígono, mantemos o UID selecionado
    state.selectedFeatureUid = uid;
  } else {
    // Se não encontramos o polígono com este UID nesta camada, limpamos a seleção
    state.selectedFeatureUid = null;
    state.selectedFeature = null;
    state.selectedLayer = null;
    // Esconder o gráfico
    document.getElementById('polygon-chart-container').style.display = "none";
  }
  
  return found;
};