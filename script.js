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
    TILE_LAYER: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
    TILE_ATTRIBUTION: "© OpenStreetMap contributors"
  },
  STYLES: {
    BOUNDARY: { color: "#3388ff", weight: 1, opacity: 1, fillOpacity: 0.2 },
    TRAJECTORY: { color: "#FF0000", weight: 2, opacity: 0.7 }
  },
  GITHUB: {
    RAW_URL: "https://raw.githubusercontent.com/fortracc/fortracc.github.io/main/",
    BOUNDARY_API: "",
    TRAJECTORY_API: ""
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
  displayOptions: CONFIG.DISPLAY_KEYS.reduce((acc, key) => (acc[key] = false, acc), {})
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
  // ============ INICIALIZAÇÃO DE UI ============
  const elements = {
    map: L.map("map").fitBounds(CONFIG.MAP.BOUNDS),
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
    let obj = state.geojsonLayers[state.currentIndex];
    state.currentBoundaryLayer = L.geoJSON(obj.geojson, {
      filter: passesThreshold,
      style: CONFIG.STYLES.BOUNDARY
    });
    state.currentBoundaryLayer.addTo(elements.map);
  };

  /**
   * Atualiza os markers com informações exibidas no mapa
   */
  const updateMarkers = () => {
    markerGroup.clearLayers();
    if (!state.geojsonLayers[state.currentIndex]) return;
    
    state.geojsonLayers[state.currentIndex].geojson.features
      .filter(passesThreshold)
      .forEach(feature => {
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