/**
 * mapUtils.js - Map utilities and layer management functions
 * 
 * Contains:
 * - Map layer management
 * - GeoJSON processing
 * - Layer styling
 * - Map state persistence
 * - Map interaction handlers
 */

// ============ MAP UTILITIES MODULE ============
const mapUtils = (() => {
  // Private variables
  let markerGroup = null;
  let _map = null;
  let initializeAttempts = 0;
  const MAX_ATTEMPTS = 10;
  
  /**
   * Initialize map utilities
   * @param {L.LayerGroup} markersLayerGroup - Marker layer group for the map
   * @returns {Promise} Promise that resolves when initialization is complete
   */
  const initialize = (markersLayerGroup) => {
    console.log("MapUtils: Starting initialization...");
    
    // Return a promise for initialization
    return new Promise((resolve, reject) => {
      // Set a maximum timeout to prevent infinite loops
      const timeoutId = setTimeout(() => {
        reject(new Error("Map initialization timed out after 10 seconds"));
      }, 10000);
      
      // Wait for the core element to be fully ready
      if (!window.core || !window.core.elements) {
        clearTimeout(timeoutId);
        return reject(new Error("Core module not available"));
      }
      
      // Perform an initial check and wait if needed
      const waitForMap = () => {
        initializeAttempts++;
        
        try {
          if (!window.core.elements.map) {
            console.log(`MapUtils: Map element not initialized yet, retrying... (Attempt ${initializeAttempts}/${MAX_ATTEMPTS})`);
            if (initializeAttempts >= MAX_ATTEMPTS) {
              clearTimeout(timeoutId);
              return reject(new Error(`Failed to initialize map after ${MAX_ATTEMPTS} attempts`));
            }
            setTimeout(waitForMap, 300);
            return;
          }
          
          _map = window.core.elements.map;
          
          // Test if the map actually works by checking various methods
          if (!_map.getContainer || !_map.setView || !_map.addLayer) {
            console.log(`MapUtils: Map not fully initialized yet, retrying... (Attempt ${initializeAttempts}/${MAX_ATTEMPTS})`);
            if (initializeAttempts >= MAX_ATTEMPTS) {
              clearTimeout(timeoutId);
              return reject(new Error(`Map functions not available after ${MAX_ATTEMPTS} attempts`));
            }
            setTimeout(waitForMap, 300);
            return;
          }
          
          // Success - complete initialization
          clearTimeout(timeoutId);
          
          console.log("MapUtils: Core map element verified and ready");
          markerGroup = markersLayerGroup;
          
          // Set up map event listeners
          setupEventListeners();
          
          // Initialize map layers
          initializeMapLayers();
          
          console.log("MapUtils: Module initialized successfully");
          resolve(true);
        } catch (error) {
          console.error("MapUtils: Error during initialization check:", error);
          clearTimeout(timeoutId);
          reject(error);
        }
      };
      
      // Start waiting for the map
      waitForMap();
    });
  };
  
  /**
   * Force initialize map utilities without waiting (used for direct initialization)
   * @param {L.LayerGroup} markersLayerGroup - Marker layer group for the map
   * @param {L.Map} mapInstance - The map instance
   */
  const forceInitialize = (markersLayerGroup, mapInstance) => {
    try {
      console.log("MapUtils: Force initializing...");
      
      // Store references
      markerGroup = markersLayerGroup;
      _map = mapInstance;
      
      // Set up map event listeners
      setupEventListeners();
      
      // Initialize map layers
      initializeMapLayers();
      
      console.log("MapUtils: Force initialization successful");
      return true;
    } catch (error) {
      console.error("MapUtils: Force initialization failed:", error);
      throw error;
    }
  };
  
  /**
   * Set up map event listeners
   */
  const setupEventListeners = () => {
    console.log("MapUtils: Setting up map event listeners");
    
    // Make sure the map exists before adding listeners
    if (!_map) {
      console.error("MapUtils: Map element not available for event setup");
      return;
    }
    
    // Click anywhere on the map to clear selection
    _map.on('click', clearSelection);
    
    // Events to save map state
    _map.on('moveend', core.saveMapViewState);
    _map.on('zoomend', core.saveMapViewState);
    
    // Save map state when user leaves the page
    window.addEventListener('beforeunload', core.saveMapViewState);
    
    console.log("MapUtils: Event listeners set up successfully");
  };
  
  /**
   * Initialize base map layers and controls
   */
  const initializeMapLayers = () => {
    // Create tile layers
    const baseLayers = {};
    let currentBaseLayer = null;
    
    // Create layers and add them to the map
    Object.keys(core.CONFIG.MAP.LAYERS).forEach((layerKey, index) => {
      const layerConfig = core.CONFIG.MAP.LAYERS[layerKey];
      
      // Create tile layer
      const tileLayer = L.tileLayer(layerConfig.url, { 
        attribution: layerConfig.attribution 
      });
      
      baseLayers[layerKey] = tileLayer;
      
      // If this is the first layer, add it to the map
      if (index === 0) {
        currentBaseLayer = tileLayer;
        tileLayer.addTo(_map);
      }
    });
    
    // Create map layer control interface
    createLayersControl(baseLayers, currentBaseLayer);
  };
  
  /**
   * Create UI for switching between map layers
   * @param {Object} baseLayers - Object containing reference to all base layers
   * @param {L.Layer} initialLayer - The initially selected layer
   */
  const createLayersControl = (baseLayers, initialLayer) => {
    // Create toggle button
    const toggleButton = document.createElement('button');
    toggleButton.id = 'toggle-map-layers';
    toggleButton.innerHTML = '<i class="fa fa-layers"></i> Map';
    document.body.appendChild(toggleButton);
    
    // Create layers control panel
    const layersControl = document.createElement('div');
    layersControl.id = 'map-layers-control';
    
    // Create header with controls
    const headerContainer = document.createElement('div');
    headerContainer.className = 'header-with-controls';
    
    const controlTitle = document.createElement('h4');
    controlTitle.textContent = 'Map Types';
    
    // Minimize button
    const minimizeButton = document.createElement('button');
    minimizeButton.className = 'minimize-button';
    minimizeButton.innerHTML = '−';
    minimizeButton.title = 'Minimize panel';
    
    // Add elements to header
    headerContainer.appendChild(controlTitle);
    headerContainer.appendChild(minimizeButton);
    
    // Add header to control panel
    layersControl.appendChild(headerContainer);
    
    // Create body for layer options
    const layersControlBody = document.createElement('div');
    layersControlBody.id = 'map-layers-control-body';
    
    // Create radio options for each map layer
    Object.keys(core.CONFIG.MAP.LAYERS).forEach((layerKey, index) => {
      const layerConfig = core.CONFIG.MAP.LAYERS[layerKey];
      const layerOption = document.createElement('label');
      const radio = document.createElement('input');
      
      radio.type = 'radio';
      radio.name = 'mapLayer';
      radio.value = layerKey;
      radio.checked = index === 0;
      
      radio.addEventListener('change', () => {
        // Remove current layer
        if (initialLayer) {
          _map.removeLayer(initialLayer);
        }
        
        // Add selected layer
        initialLayer = baseLayers[layerKey];
        initialLayer.addTo(_map);
        
        // Save preference
        localStorage.setItem('preferredMapLayer', layerKey);
      });
      
      layerOption.appendChild(radio);
      layerOption.appendChild(document.createTextNode(layerConfig.name));
      layersControlBody.appendChild(layerOption);
    });
    
    // Add body to control panel
    layersControl.appendChild(layersControlBody);
    document.body.appendChild(layersControl);
    
    // Set up minimize/expand functionality
    minimizeButton.addEventListener('click', () => {
      if (layersControlBody.style.display === 'none') {
        layersControlBody.style.display = 'block';
        minimizeButton.innerHTML = '−';
        minimizeButton.title = 'Minimize panel';
      } else {
        layersControlBody.style.display = 'none';
        minimizeButton.innerHTML = '+';
        minimizeButton.title = 'Expand panel';
      }
    });
    
    // Toggle show/hide for entire panel
    toggleButton.addEventListener('click', () => {
      layersControl.style.display = 
        layersControl.style.display === 'block' ? 'none' : 'block';
    });
    
    // Restore user preference if available
    const preferredLayer = localStorage.getItem('preferredMapLayer');
    if (preferredLayer && baseLayers[preferredLayer]) {
      const radioToSelect = document.querySelector(`input[name="mapLayer"][value="${preferredLayer}"]`);
      if (radioToSelect) {
        radioToSelect.checked = true;
        // Manually trigger change event
        const event = new Event('change');
        radioToSelect.dispatchEvent(event);
      }
    }
  };
  
  /**
   * Clear polygon selection
   */
  const clearSelection = () => {
    if (core.state.selection.uid) {
      // Reset all polygon styles
      if (core.state.currentBoundaryLayer) {
        core.state.currentBoundaryLayer.eachLayer(layer => {
          core.state.currentBoundaryLayer.resetStyle(layer);
        });
      }
      
      // Clear selection state
      core.state.selection.uid = null;
      core.state.selection.feature = null;
      core.state.selection.layer = null;
      
      // Hide the chart
      window.chartModule.hideChart();
      
      // Update markers to show all based on config
      window.viewOptions.updateMarkers();
    }
  };
  
  /**
   * Create trajectory layer from GeoJSON data
   * @param {Object} geojson - GeoJSON data for trajectories
   * @returns {L.GeoJSON} Leaflet GeoJSON layer
   */
  const createTrajectoryLayer = geojson => {
    return L.geoJSON(geojson, {
      filter: feature => {
        // Filter only trajectories matching UIDs of visible polygons
        // and passing the current threshold filter
        if (!feature.properties || !feature.properties.uid || !feature.properties.threshold) {
          return false;
        }
      
        // Check if threshold matches the current filter
        const matchesThreshold = parseFloat(feature.properties.threshold) === 
          parseFloat(core.state.currentThresholdFilter);
        if (!matchesThreshold) return false;
        
        // If a specific polygon is selected, only show its trajectory
        if (core.state.selection.uid) {
          return feature.properties.uid === core.state.selection.uid;
        }
        
        // Otherwise show trajectories of all visible polygons in the current layer
        const currentBoundaryFeatures = 
          core.state.geojsonLayers[core.state.currentIndex].geojson.features;
        
        return currentBoundaryFeatures.some(boundaryFeature => 
          boundaryFeature.properties && 
          boundaryFeature.properties.uid === feature.properties.uid &&
          core.passesThreshold(boundaryFeature)
        );
      },
      style: core.CONFIG.STYLES.TRAJECTORY
    });
  };
  
  /**
   * Update timestamp information in the UI
   * @param {Object} layer - Current layer object with file information
   */
  const updateTimestampInfo = layer => {
    // Make sure layer and fileName exist
    if (!layer || !layer.fileName) {
      console.warn("MapUtils: Cannot update timestamp - invalid layer or missing filename");
      return;
    }
    
    // Extract timestamp from the filename using the utility function
    const timestamp = core.utils.extractTimestampFromFileName(layer.fileName);
    
    // Get the timestamp info element
    const timestampElement = document.getElementById("timestamp-info") || core.elements.trackInfo;
    
    // Update UI with timestamp info if available
    if (timestamp && timestampElement) {
      // Include timezone offset in display
      timestampElement.textContent = `Track: ${timestamp} (UTC${core.CONFIG.TIME_OFFSET})`;
      console.log(`MapUtils: Updated timestamp to ${timestamp} (UTC${core.CONFIG.TIME_OFFSET})`);
    } else if (timestampElement) {
      // No timestamp info available
      timestampElement.textContent = "Track: No timestamp data";
      
      // Log details for debugging
      console.warn(`MapUtils: Failed to extract timestamp from filename: ${layer.fileName}`);
    } else {
      console.error("MapUtils: Timestamp element not found in the DOM");
    }
  };
  
  /**
   * Remove current boundary layer and markers
   */
  const removeCurrentLayer = () => {
    if (core.state.currentBoundaryLayer) { 
      _map.removeLayer(core.state.currentBoundaryLayer); 
      core.state.currentBoundaryLayer = null; 
    }
    
    if (markerGroup) {
      markerGroup.clearLayers();
    }
    
    removeTrajectoryLayer();
  };
  
  /**
   * Remove the current trajectory layer
   */
  const removeTrajectoryLayer = () => {
    if (core.state.currentTrajectoryLayer) {
      _map.removeLayer(core.state.currentTrajectoryLayer);
      core.state.currentTrajectoryLayer = null;
    }
  };
  
  /**
   * Update the displayed boundary layer
   */
  const updateBoundaryLayer = () => {
    if (core.state.currentBoundaryLayer) {
      _map.removeLayer(core.state.currentBoundaryLayer);
    }
    
    // Reset only the layer and feature references, keeping the UID
    core.state.selection.feature = null;
    core.state.selection.layer = null;
    
    const currentLayer = core.state.geojsonLayers[core.state.currentIndex];
    if (!currentLayer || !currentLayer.geojson) return;
    
    // Create style function to efficiently handle selected polygons
    const getFeatureStyle = feature => {
      return core.state.selection.uid && feature.properties.uid === core.state.selection.uid 
        ? core.CONFIG.STYLES.SELECTED 
        : core.CONFIG.STYLES.BOUNDARY;
    };
    
    core.state.currentBoundaryLayer = L.geoJSON(currentLayer.geojson, {
      filter: core.passesThreshold,
      style: getFeatureStyle,
      onEachFeature: (feature, layer) => {
        // Add click event to show polygon information
        layer.on('click', (e) => {
          L.DomEvent.stopPropagation(e); // Prevent event propagating to map
          
          // If clicking the same polygon, deselect it
          if (core.state.selection.uid === feature.properties.uid) {
            // Complete deselection
            core.state.selection.uid = null;
            core.state.selection.feature = null;
            core.state.selection.layer = null;
            
            // Reset to default style
            layer.setStyle(core.CONFIG.STYLES.BOUNDARY);
            
            // Hide chart
            window.chartModule.hideChart();
            
            // Update markers to show all
            window.viewOptions.updateMarkers();
            return;
          }
          
          // Clear previous selection
          if (core.state.selection.uid) {
            // Reset style of all polygons to ensure none stay highlighted
            core.state.currentBoundaryLayer.eachLayer(l => {
              l.setStyle(core.CONFIG.STYLES.BOUNDARY);
            });
          }
          
          // Set this as the newly selected polygon
          core.state.selection.uid = feature.properties.uid;
          core.state.selection.feature = feature;
          core.state.selection.layer = layer;
          
          // Apply highlight style to selected polygon
          layer.setStyle(core.CONFIG.STYLES.SELECTED);
          
          // Verify that chartModule is available
          if (window.chartModule && window.chartModule.updateChart) {
            console.log("Updating chart with feature:", feature.properties.uid);
            window.chartModule.updateChart(feature);
          } else {
            console.error("Chart module not available to update chart");
          }
          
          // Check if there are active display options
          const hasActiveOptions = Object.values(core.state.displayOptions).some(val => val);
          
          // If no active options, automatically enable UID display
          if (!hasActiveOptions && core.CONFIG.DISPLAY_KEYS.includes('uid')) {
            core.state.displayOptions.uid = true;
            const uidCheckbox = document.querySelector(`input[name="uid"]`);
            if (uidCheckbox) uidCheckbox.checked = true;
          }
          
          // Update markers to show only this polygon
          window.viewOptions.updateMarkers();
        });
      }
    });
    
    core.state.currentBoundaryLayer.addTo(_map);
    
    // Remove trajectory layer when boundary layer is updated
    removeTrajectoryLayer();
  };
  
  /**
   * Update timeline progress bar
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
  
  /**
   * Show map layer at the specified index
   * @param {number} index - Index of the layer to display
   */
  const showLayerAtIndex = index => {
    if (index < 0 || index >= core.state.geojsonLayers.length) return;
    
    // Save current UID before removing layer
    const currentSelectedUid = core.state.selection.uid;
    
    // Save current trajectory state
    const showTrajectoryCheckbox = core.elements && core.elements.showTrajectoryCheckbox;
    const showTrajectory = showTrajectoryCheckbox ? showTrajectoryCheckbox.checked : false;
    
    // Only remove the boundary layer, keeping trajectory if enabled
    if (core.state.currentBoundaryLayer) { 
      _map.removeLayer(core.state.currentBoundaryLayer); 
      core.state.currentBoundaryLayer = null;
    }
    
    if (markerGroup) {
      markerGroup.clearLayers();
    }
    
    core.state.currentIndex = index;
    updateBoundaryLayer();
    
    // If there was a selected polygon, try to select it again in the new layer
    if (currentSelectedUid) {
      // Restore UID selection in the new layer
      core.state.selection.uid = currentSelectedUid;
      
      // Try to find polygon in the new layer and apply style
      let found = false;
      core.state.currentBoundaryLayer.eachLayer(layer => {
        if (layer.feature && 
            layer.feature.properties && 
            layer.feature.properties.uid === currentSelectedUid &&
            core.passesThreshold(layer.feature)) {
          
          // Found polygon with the same UID
          core.state.selection.feature = layer.feature;
          core.state.selection.layer = layer;
          layer.setStyle(core.CONFIG.STYLES.SELECTED);
          
          // Update chart with the polygon data
          window.chartModule.updateChart(layer.feature);
          found = true;
        }
      });
      
      // If polygon not found in this layer but we want to keep the selection
      if (!found) {
        // Polygon not present in this layer,
        // but keep the UID for when we return to a layer that has it
        core.state.selection.feature = null;
        core.state.selection.layer = null;
        
        // Hide chart since polygon is not present in this layer
        window.chartModule.hideChart();
      }
    }
    
    window.viewOptions.updateMarkers();
    updateTimestampInfo(core.state.geojsonLayers[core.state.currentIndex]);
    
    // If trajectory was showing, update it for the new layer
    if (showTrajectory) {
      loadTrajectoryForCurrentLayer();
    }
    
    // Update timeline slider
    if (core.elements.timelineSlider) {
      core.elements.timelineSlider.value = core.state.currentIndex;
      updateTimelineProgress();
    }
  };
  
  /**
   * Load trajectory data for current layer
   */
  const loadTrajectoryForCurrentLayer = () => {
    const currentLayer = core.state.geojsonLayers[core.state.currentIndex];
    if (!currentLayer) return;
    
    const baseName = core.utils.getBaseName(currentLayer.fileName);
    
    // Find the exact matching trajectory file by basic filename match
    let trajectoryUrl = null;
    
    // First try exact match - key equals basename
    if (core.state.trajectoryFiles[baseName]) {
      trajectoryUrl = core.state.trajectoryFiles[baseName];
    } else {
      // Then try to find a case-insensitive match
      const matchingKey = Object.keys(core.state.trajectoryFiles).find(k => 
        k.toLowerCase() === baseName.toLowerCase()
      );
      if (matchingKey) {
        trajectoryUrl = core.state.trajectoryFiles[matchingKey];
      }
    }
    
    // If not found yet, construct the likely URL based on naming convention
    if (!trajectoryUrl) {
      trajectoryUrl = core.CONFIG.DIRECTORIES.TRAJECTORY + baseName;
      console.info(`No trajectory found in loaded files. Fallback to constructed URL: ${trajectoryUrl}`);
    }
    
    // Remove any existing trajectory layer
    removeTrajectoryLayer();
    
    // If we already have trajectory data for this layer, just display it
    if (currentLayer.trajectoryGeojson) {
      console.log(`Using cached trajectory data for ${baseName}`);
      core.state.currentTrajectoryLayer = createTrajectoryLayer(currentLayer.trajectoryGeojson);
      core.state.currentTrajectoryLayer.addTo(_map);
      currentLayer.trajectoryLayer = core.state.currentTrajectoryLayer;
      return;
    }
    
    console.log(`Fetching trajectory data from ${trajectoryUrl}`);
    
    // Otherwise, load the data
    fetch(trajectoryUrl)
      .then(r => { 
        if (!r.ok) {
          console.warn(`HTTP error ${r.status} loading trajectory from ${trajectoryUrl}`);
          throw new Error(`Failed to load trajectory from ${trajectoryUrl} (${r.status})`); 
        }
        return r.json(); 
      })
      .then(geojson => {
        // Store trajectory data with the layer for future use
        currentLayer.trajectoryGeojson = geojson;
        
        // Create and add the trajectory layer
        core.state.currentTrajectoryLayer = createTrajectoryLayer(geojson);
        core.state.currentTrajectoryLayer.addTo(_map);
        currentLayer.trajectoryLayer = core.state.currentTrajectoryLayer;
        
        console.log(`Successfully loaded and displayed trajectory for ${baseName}`);
      })
      .catch(err => { 
        console.error(`Error loading trajectory for ${baseName}:`, err);
        
        // Uncheck the trajectory checkbox on error
        if (core.elements.showTrajectoryCheckbox) {
          core.elements.showTrajectoryCheckbox.checked = false;
        }
      });
  };
  
  /**
   * Load boundary layers from files - with error handling
   */
  const loadBoundaryLayers = () => {
    return core.fetchBoundaryFileList().then(files => {
      if (!files.length) {
        throw new Error("No .geojson files found for boundary");
      }

      // Check for new files
      const storedFiles = JSON.parse(localStorage.getItem('boundaryFiles') || '[]');
      const newFiles = files.filter(file => 
        !storedFiles.some(storedFile => storedFile.name === file.name)
      );

      if (newFiles.length > 0) {
        // Update stored file list and reload
        localStorage.setItem('boundaryFiles', JSON.stringify(files));
        location.reload();
        return Promise.resolve(); // Return a resolved promise to chain
      }

      // Use Promise.all to wait for all files to load
      const filePromises = files.map(file => 
        fetch(file.download_url)
          .then(r => { 
            if (!r.ok) throw new Error(`Failed to load ${file.download_url}`); 
            return r.json(); 
          })
          .then(geojson => ({
            fileName: file.name,
            geojson,
            trajectoryLayer: null,
            trajectoryGeojson: null
          }))
          .catch(err => {
            console.error(`Error loading file ${file.name}:`, err);
            return null; // Return null for failed loads
          })
      );

      return Promise.all(filePromises).then(results => {
        // Filter out null results (failed loads)
        const validLayers = results.filter(result => result !== null);
        
        if (validLayers.length === 0) {
          throw new Error("No valid GeoJSON files were loaded");
        }
        
        // Add layers to state
        core.state.geojsonLayers = validLayers;
        
        // Sort layers by filename
        core.state.geojsonLayers.sort((a, b) => 
          a.fileName.toLowerCase().localeCompare(b.fileName.toLowerCase())
        );
        
        // Configure UI if timeline slider exists
        if (core.elements && core.elements.timelineSlider) {
          core.elements.timelineSlider.disabled = false;
          core.elements.timelineSlider.min = 0;
          core.elements.timelineSlider.max = core.state.geojsonLayers.length - 1;
          core.elements.timelineSlider.value = core.state.geojsonLayers.length - 1; // Last index
        }
        
        // Show last layer
        showLayerAtIndex(core.state.geojsonLayers.length - 1);
        core.state.playing = false;
        if (core.elements && core.elements.playPauseBtn) {
          core.elements.playPauseBtn.textContent = "Play";
        }
        
        // Check if a system was selected before reload
        const previouslySelectedUid = localStorage.getItem('selectedSystemUid');
        if (previouslySelectedUid) {
          // Try to select the same system after reload
          setTimeout(() => {
            core.selectPolygonByUid(previouslySelectedUid);
            // Clear stored UID after restoring selection
            localStorage.removeItem('selectedSystemUid');
          }, 500); // Small delay to ensure layer is fully loaded
        }
        
        // Restore map view state after everything is ready
        setTimeout(() => {
          core.restoreMapViewState();
          // Force display update to ensure everything is correctly positioned
          updateBoundaryLayer();
          if (window.viewOptions) {
            window.viewOptions.updateMarkers();
          }
          
          // Fixed: Add safety check for showTrajectoryCheckbox
          const showTrajectoryCheckbox = core.elements && core.elements.showTrajectoryCheckbox;
          const showTrajectory = showTrajectoryCheckbox ? showTrajectoryCheckbox.checked : false;
          
          if (showTrajectory) {
            loadTrajectoryForCurrentLayer();
          }
        }, 1000);
        
        return validLayers;
      });
    });
  };
  
  /**
   * Periodically check for new boundary files
   */
  const checkForNewBoundaryFiles = () => {
    core.fetchBoundaryFileList().then(files => {
      const storedFiles = JSON.parse(localStorage.getItem('boundaryFiles')) || [];
      const newFiles = files.filter(file => 
        !storedFiles.some(storedFile => storedFile.name === file.name)
      );
      
      if (newFiles.length > 0) {
        console.log("New files found, reloading...");
        
        // Use the stateManager to save state with auto-reload flag
        if (window.stateManager) {
          window.stateManager.handleAutoReload();
        } else {
          // Fallback for backward compatibility
          if (core.state.selection.uid) {
            localStorage.setItem('selectedSystemUid', core.state.selection.uid);
          }
          core.saveMapViewState();
        }
        
        // Update stored file list and reload
        localStorage.setItem('boundaryFiles', JSON.stringify(files));
        location.reload();
      }
    }).catch(err => {
      console.error("Error checking for new files:", err);
    });
  };

  /**
   * Load trajectory files
   */
  const loadTrajectoryFiles = () => {
    console.log("Loading trajectory files...");
    
    core.fetchTrajectoryFileList()
      .then(filesMap => {
        core.state.trajectoryFiles = filesMap;
        console.log(`Successfully loaded ${Object.keys(filesMap).length} trajectory files`);
        console.log("Trajectory files:", Object.keys(filesMap));
        
        // Pre-associate trajectories with their boundary layers if already loaded
        if (core.state.geojsonLayers && core.state.geojsonLayers.length > 0) {
          console.log("Pre-caching trajectories for existing boundary layers...");
          
          // Start loading trajectories for each layer to populate cache
          core.state.geojsonLayers.forEach(layer => {
            // Don't wait for completion - this is background loading
            preloadTrajectoryForLayer(layer);
          });
        }
      })
      .catch(err => {
        console.error("Error loading trajectory files:", err);
      });
  };

  /**
   * Preload trajectory for a boundary layer to populate cache
   * @param {Object} layer - Layer object with fileName property
   */
  const preloadTrajectoryForLayer = (layer) => {
    if (!layer || !layer.fileName) return;
    
    const baseName = core.utils.getBaseName(layer.fileName);
    
    // Skip if already cached
    if (layer.trajectoryGeojson) return;
    
    // Find matching trajectory file
    let trajectoryUrl = null;
    
    // Try exact match
    if (core.state.trajectoryFiles[baseName]) {
      trajectoryUrl = core.state.trajectoryFiles[baseName];
    } else {
      // Try case-insensitive match
      const matchingKey = Object.keys(core.state.trajectoryFiles).find(k => 
        k.toLowerCase() === baseName.toLowerCase()
      );
      if (matchingKey) {
        trajectoryUrl = core.state.trajectoryFiles[matchingKey];
      }
    }
    
    // If not found, construct the likely URL (this is for backup only)
    if (!trajectoryUrl) {
      trajectoryUrl = core.CONFIG.DIRECTORIES.TRAJECTORY + baseName;
    }
    
    // Fetch and cache trajectory data in background
    fetch(trajectoryUrl)
      .then(r => r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`)))
      .then(geojson => {
        layer.trajectoryGeojson = geojson;
        console.log(`Pre-cached trajectory for ${baseName}`);
      })
      .catch(err => {
        // Just log error - this is background loading
        console.warn(`Could not pre-cache trajectory for ${baseName}:`, err);
      });
  };
  
  // Public API
  return {
    initialize,
    forceInitialize,
    updateBoundaryLayer,
    createTrajectoryLayer,
    removeTrajectoryLayer,
    loadTrajectoryForCurrentLayer,
    loadBoundaryLayers,
    loadTrajectoryFiles,
    showLayerAtIndex,
    removeCurrentLayer,
    checkForNewBoundaryFiles,
    updateTimelineProgress
  };
})();

// Export mapUtils to the global scope
window.mapUtils = mapUtils;
