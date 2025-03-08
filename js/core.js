/**
 * core.js - Core functionality for pyForTraCC Visualizer
 * 
 * Contains:
 * - Configuration constants
 * - Global state management
 * - Core utility functions
 * - Data loading functions
 * - Initialization
 */

// ============ CONFIGURATION CONSTANTS ============
const CONFIG = {
  DISPLAY_KEYS: ['uid', 'status', 'size', 'min', 'ang_','expansion'],
  CHART_DISPLAY_KEYS: ['size', 'min', 'expansion', 'inside_clusters'],
  DEFAULT_CHART_VARIABLE: 'size',
  DEFAULT_THRESHOLD: "235.0",
  AUTO_CHECK_INTERVAL: 60000, // 60 seconds
  TIME_OFFSET: -3, // UTC-3 hours
  TIME_INCREMENT: 10, // +10 minutes
  DIRECTORIES: {
    BOUNDARY: "track/boundary/",
    TRAJECTORY: "track/trajectory/"
  },
  MAP: {
    BOUNDS: [[-35.01807360131674, -79.99568018181952], [4.986926398683252, -30.000680181819533]],
    DEFAULT_ZOOM: 4.4,
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
    SELECTED: { color: "#FF00FF", weight: 3, opacity: 1, fillOpacity: 0.3 }
  },
  GITHUB: {
    BOUNDARY_API: "https://api.github.com/repos/pyfortracc/pyfortracc.github.io/contents/track/boundary/",
    TRAJECTORY_API: "https://api.github.com/repos/pyfortracc/pyfortracc.github.io/contents/track/trajectory/"
  },
  CHART: {
    EVOLUTION_VARIABLES: ['size', 'min', 'expansion', 'inside_clusters'],
    DEFAULT_VARIABLE: 'size',
    COLORS: {
      size: 'rgb(75, 192, 192)', // Teal
      min: 'rgb(255, 159, 64)',  // Orange
      expansion: 'rgb(153, 102, 255)', // Purple
      inside_clusters: 'rgb(54, 162, 235)' // Blue
    },
    LABELS: {
      size: 'Size',
      min: 'Min Value',
      expansion: 'Expansion',
      inside_clusters: 'Inside Clusters'
    }
  },
  DOM_IDS: {
    POLYGON_CHART_CONTAINER: 'polygon-chart-container',
    POLYGON_CHART: 'polygon-chart',
    VARIABLE_SELECTOR: 'variable-selector'
  }
};

// ============ GLOBAL APPLICATION STATE ============
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
    feature: null,    // Stores selected feature
    layer: null,      // Stores selected layer
    uid: null         // Stores the UID of selected feature for persistence between layers
  },
  chart: {
    instance: null,   // Active chart instance
    container: null   // Reference to chart container
  },
  dataCache: {}       // Cache for time series data
};

// ============ DOM ELEMENTS ============
let elements = {};

// Initialize DOM elements after the document is loaded
const initializeElements = () => {
  console.log("Core: Creating DOM element references...");

  try {
    // Make sure the map container exists
    const mapContainer = document.getElementById("map");
    if (!mapContainer) {
      console.error("Map container element not found in the DOM!");
      throw new Error("Map container element not found");
    }
    
    console.log("Core: Creating map instance...");
    
    // Try-catch to handle potential Leaflet map creation errors
    try {
      // Create the map instance with error handlers
      const mapOptions = {
        center: [
          (CONFIG.MAP.BOUNDS[0][0] + CONFIG.MAP.BOUNDS[1][0]) / 2, 
          (CONFIG.MAP.BOUNDS[0][1] + CONFIG.MAP.BOUNDS[1][1]) / 2
        ],
        zoom: CONFIG.MAP.DEFAULT_ZOOM,
        zoomSnap: 0.1,
        zoomDelta: 0.1
      };
      
      // Verify Leaflet is available
      if (!L || !L.map) {
        throw new Error("Leaflet library not loaded or available");
      }
      
      // Create map with proper error detection
      const mapInstance = L.map("map", mapOptions);
      
      // Verify map created successfully
      if (!mapInstance.getContainer) {
        throw new Error("Map creation failed - invalid instance");
      }
      
      console.log("Core: Map instance created successfully", mapInstance);
      
      // Create element references with correct IDs that match the HTML
      elements = {
        map: mapInstance,
        timelineSlider: document.getElementById("timeline"), // Make sure this ID is used in HTML
        prevBtn: document.getElementById("prevLayer"), // Make sure this ID is used in HTML
        playPauseBtn: document.getElementById("playPause"), // Make sure this ID is used in HTML
        nextBtn: document.getElementById("nextLayer"), // Make sure this ID is used in HTML
        speedInput: document.getElementById("speed"), // Make sure this ID is used in HTML
        speedValueSpan: document.getElementById("speedValue"), // Make sure this ID is used in HTML
        trackInfo: document.getElementById("timestamp-info"), // Make sure this ID is used in HTML
        dynamicOptionsContainer: document.getElementById("dynamic-options"), // Make sure this ID is used in HTML
        showTrajectoryCheckbox: document.getElementById("showTrajectory"), // Make sure this ID is used in HTML
        thresholdRadios: document.getElementsByName("thresholdFilter") // Make sure this name is used in HTML
      };
      
      // Add debugging information
      console.log("Core: Map center:", elements.map.getCenter());
      console.log("Core: Map zoom:", elements.map.getZoom());
      console.log("Core: Map container:", elements.map.getContainer());
      
      // Add default tile layer immediately to help initialize the map
      L.tileLayer(CONFIG.MAP.TILE_LAYER, {
        attribution: CONFIG.MAP.TILE_ATTRIBUTION
      }).addTo(elements.map);
      
      // Force a redraw of the map
      setTimeout(() => {
        elements.map.invalidateSize();
        console.log("Core: Map size invalidated");
      }, 100);
      
      // Validate critical elements
      if (!elements.timelineSlider) console.warn("Timeline slider element not found");
      if (!elements.prevBtn) console.warn("Previous button element not found");
      if (!elements.playPauseBtn) console.warn("Play/Pause button element not found");
      if (!elements.nextBtn) console.warn("Next button element not found");
      if (!elements.dynamicOptionsContainer) console.warn("Dynamic options container not found");
      
      console.log("Core: Element references created successfully");
      return elements;
      
    } catch (mapError) {
      console.error("Core: Failed to create map:", mapError);
      throw new Error(`Map creation failed: ${mapError.message}`);
    }
    
  } catch (error) {
    console.error("Core: Error initializing DOM elements:", error);
    throw new Error(`Failed to initialize DOM elements: ${error.message}`);
  }
};

// ============ UTILITY FUNCTIONS ============
const utils = {
  /**
   * Scan a local directory for GeoJSON files
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
   * Sort files by name or other property
   */
  sortFiles: (files, key = "name") =>
    files.sort((a, b) => (a[key] || a).toLowerCase().localeCompare((b[key] || b).toLowerCase())),

  /**
   * Generate local URL for a file
   */
  getLocalUrl: (fileName, dir) => fileName.includes(dir) ? fileName : dir + fileName,

  /**
   * Extract base name from a file path
   */
  getBaseName: fileName => fileName.split('/').pop(),

  /**
   * Format timestamp for display with timezone offset
   */
  formatTimestamp: (timestamp) => {
    if (!timestamp) return "";
    
    // Convert to Date object
    const date = new Date(timestamp);
    
    // Check if date is valid
    if (isNaN(date.getTime())) return timestamp;
    
    // Adjust timestamp by milliseconds to avoid timezone issues
    const utcMilliseconds = date.getTime();
    const offsetMilliseconds = CONFIG.TIME_OFFSET * 60 * 60 * 1000;
    const adjustedDate = new Date(utcMilliseconds + offsetMilliseconds);
    
    // Format the date
    return adjustedDate.toISOString().replace('T', ' ').substring(0, 19);
  },
  
  /**
   * Extract timestamp from a filename in format YYYYmmdd_HHMM.geojson
   * @param {string} fileName - Filename with timestamp
   * @returns {string} Formatted timestamp string
   */
  extractTimestampFromFileName: (fileName) => {
    // Filename pattern is YYYYmmdd_HHMM.geojson
    const fileNameMatch = fileName.match(/(\d{4})(\d{2})(\d{2})_(\d{2})(\d{2})/);
    
    if (fileNameMatch) {
      // Extract components from the match
      const [_, year, month, day, hour, minute] = fileNameMatch;
      
      // Create UTC date
      const utcDate = new Date(Date.UTC(
        parseInt(year),
        parseInt(month) - 1, // JS months are 0-indexed
        parseInt(day),
        parseInt(hour),
        parseInt(minute)
      ));
      
      // Apply timezone offset
      const offsetMilliseconds = CONFIG.TIME_OFFSET * 60 * 60 * 1000;
      
      // Apply minute increment if needed
      const incrementMilliseconds = CONFIG.TIME_INCREMENT * 60 * 1000;
      
      // Calculate adjusted date
      const localDate = new Date(utcDate.getTime() + offsetMilliseconds + incrementMilliseconds);
      
      // Format the date appropriately for display - YYYY/MM/DD HH:MM:SS
      const formattedDate = localDate.toISOString()
        .replace('T', ' ')
        .substring(0, 19)
        .replace(/-/g, '/');
      
      return formattedDate;
    }
    
    return null;
  },
  
  /**
   * Compute centroid of a polygon feature
   */
  computeCentroid: (feature) => {
    if (!feature.geometry || feature.geometry.type !== "Polygon") return null;
    const coords = feature.geometry.coordinates[0];
    let [sumX, sumY] = [0, 0];
    coords.forEach(c => { sumX += c[0]; sumY += c[1]; });
    return [sumY / coords.length, sumX / coords.length];
  }
};

// ============ MAP STATE PERSISTENCE ============
/**
 * Save the current map view state
 */
const saveMapViewState = () => {
  try {
    const mapCenter = elements.map.getCenter();
    const mapZoom = elements.map.getZoom();
    
    if (mapCenter && !isNaN(mapCenter.lat) && !isNaN(mapCenter.lng) && !isNaN(mapZoom)) {
      const viewState = {
        center: [mapCenter.lat, mapCenter.lng],
        zoom: mapZoom
      };
      
      localStorage.setItem('mapViewState', JSON.stringify(viewState));
    }
  } catch (e) {
    console.error("Error saving map state:", e);
  }
};

/**
 * Restore saved map view state
 */
const restoreMapViewState = () => {
  const savedView = localStorage.getItem('mapViewState');
  if (savedView) {
    try {
      const viewState = JSON.parse(savedView);
      if (viewState.center && 
          Array.isArray(viewState.center) && 
          viewState.center.length === 2 &&
          !isNaN(viewState.center[0]) && 
          !isNaN(viewState.center[1]) && 
          !isNaN(viewState.zoom)) {
        elements.map.setView(viewState.center, viewState.zoom);
      } else {
        console.warn("Invalid view data, using default values");
      }
    } catch (e) {
      console.error("Error restoring map state:", e);
    }
  }
};

// ============ API DATA LOADING ============
/**
 * Fetch boundary file list from local directory or GitHub API
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
 * Fetch trajectory file list from local directory or GitHub API
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
 * Check if a feature passes the current threshold filter
 */
const passesThreshold = feature =>
  feature.properties && feature.properties.threshold !== undefined ?
    parseFloat(feature.properties.threshold) === parseFloat(state.currentThresholdFilter) : false;

/**
 * Select a polygon by its UID
 */
const selectPolygonByUid = (uid) => {
  let found = false;
  
  if (state.currentBoundaryLayer) {
    state.currentBoundaryLayer.eachLayer(layer => {
      if (layer.feature && 
          layer.feature.properties && 
          layer.feature.properties.uid === uid &&
          passesThreshold(layer.feature)) {
        // Found the polygon with matching UID
        state.selection.feature = layer.feature;
        state.selection.layer = layer;
        // Apply selected style
        layer.setStyle(CONFIG.STYLES.SELECTED);
        found = true;
      }
    });
  }
  
  if (found) {
    // If found, keep the selected UID
    state.selection.uid = uid;
  } else {
    // If not found, clear selection but keep UID for persistence
    state.selection.feature = null;
    state.selection.layer = null;
  }
  
  return found;
};

/**
 * Updates the timeline slider progress bar
 */
const updateTimelineProgress = () => {
  const timeline = document.getElementById('timeline');
  if (timeline) {
    const value = timeline.value;
    const max = timeline.max || 100;
    const progress = (value / max) * 100;
    timeline.style.setProperty('--progress', `${progress}%`);
  }
};

// Export all functions and objects so they can be used by other modules
window.core = {
  CONFIG,
  state,
  elements,
  utils,
  initializeElements,
  saveMapViewState,
  restoreMapViewState,
  fetchBoundaryFileList,
  fetchTrajectoryFileList,
  passesThreshold,
  selectPolygonByUid,
  updateTimelineProgress
};
