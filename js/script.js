/**
 * script.js - Main application file
 * 
 * Contains:
 * - Application initialization
 * - Module coordination
 * - Timeline controls and player functionality
 */

document.addEventListener("DOMContentLoaded", () => {
  /**
   * Initialize the application
   */
  const initializeApp = () => {
    try {
      console.log("Starting application initialization...");
      
      // First make sure Leaflet is loaded
      if (!window.L) {
        throw new Error("Leaflet library not loaded. Please check your internet connection.");
      }
      
      console.log("Leaflet library detected");
      
      // Initialize state manager first
      let shouldRestoreState = false;
      if (window.stateManager) {
        console.log("Initializing state manager...");
        shouldRestoreState = window.stateManager.initialize();
      }
      
      // Initialize core elements
      let elements;
      try {
        console.log("Initializing core elements...");
        elements = core.initializeElements();
        
        // Validate map element creation
        if (!elements || !elements.map) {
          throw new Error("Failed to initialize map element");
        }
        console.log("Core elements initialized successfully");
      } catch (coreError) {
        console.error("Error initializing core elements:", coreError);
        throw new Error("Core initialization failed: " + coreError.message);
      }
      
      // Make sure the map container is visible and properly sized
      const mapContainer = document.getElementById('map');
      if (mapContainer) {
        // Force map container to have dimensions
        if (getComputedStyle(mapContainer).height === '0px') {
          console.warn("Map container has zero height, fixing...");
          mapContainer.style.height = '100%';
        }
      }
      
      // Force map to initialize properly
      setTimeout(() => {
        try {
          // Invalidate size to force redraw
          elements.map.invalidateSize(true);
          
          // Set a default view to ensure the map is properly initialized
          elements.map.setView(
            [(core.CONFIG.MAP.BOUNDS[0][0] + core.CONFIG.MAP.BOUNDS[1][0]) / 2,
             (core.CONFIG.MAP.BOUNDS[0][1] + core.CONFIG.MAP.BOUNDS[1][1]) / 2],
            core.CONFIG.MAP.DEFAULT_ZOOM
          );
          
          // Force map to render a tile layer
          const baseLayer = L.tileLayer(core.CONFIG.MAP.TILE_LAYER, {
            attribution: core.CONFIG.MAP.TILE_ATTRIBUTION
          }).addTo(elements.map);
          
          console.log("Map rendering operations completed");
          
          // Wait a bit longer for map to fully render before continuing
          setTimeout(() => {
            try {
              // Create marker layer group
              console.log("Creating marker layer group...");
              const markerGroup = L.layerGroup().addTo(elements.map);
              
              // Initialize mapUtils directly without using Promise
              console.log("Initializing mapUtils module...");
              if (!window.mapUtils) {
                throw new Error("mapUtils module not available");
              }
              window.mapUtils.forceInitialize(markerGroup, elements.map);
              
              console.log("Initializing viewOptions module...");
              if (!window.viewOptions) {
                throw new Error("viewOptions module not available");
              }
              window.viewOptions.initialize(markerGroup);
              
              // Add safety check for chartModule
              console.log("Initializing chartModule...");
              if (!window.chartModule) {
                console.error("chartModule not available - check script loading order");
                throw new Error("chartModule module not available - check script loading order");
              }
              window.chartModule.initialize();
              
              // Set up player controls
              console.log("Setting up player controls...");
              setupPlayerControls();
              
              // Load data
              console.log("Loading data...");
              window.mapUtils.loadTrajectoryFiles();
              window.mapUtils.loadBoundaryLayers()
                .then(() => {
                  console.log("Boundary layers loaded successfully");
                  
                  // If state should be restored, restore display options and other UI state
                  if (shouldRestoreState) {
                    restoreUIState();
                  }
                  
                  // Check for new files periodically
                  setInterval(window.mapUtils.checkForNewBoundaryFiles, core.CONFIG.AUTO_CHECK_INTERVAL);
                })
                .catch(dataError => {
                  console.error("Error loading boundary data:", dataError);
                  document.body.innerHTML += `<div class="error-message">Error loading data: ${dataError.message}</div>`;
                });
                
              console.log("Application initialization completed successfully");
            } catch (initError) {
              console.error("Error during module initialization:", initError);
              document.body.innerHTML += `
                <div class="error-message">
                  <h3>Module Initialization Error</h3>
                  <p>${initError.message}</p>
                  <p>Please try refreshing the page.</p>
                </div>
              `;
            }
          }, 1000);
          
        } catch (mapError) {
          console.error("Error during map initialization:", mapError);
          document.body.innerHTML += `
            <div class="error-message">
              <h3>Map Rendering Error</h3>
              <p>${mapError.message}</p>
              <p>Please try refreshing the page.</p>
            </div>
          `;
        }
      }, 500);
      
      // Add event listener to help recover off-screen chart
      document.addEventListener('keydown', (e) => {
        // Use Alt+C as a keyboard shortcut to bring chart back into view
        if (e.altKey && e.key === 'c') {
          if (window.chartModule && window.chartModule.bringChartIntoView) {
            const chartMoved = window.chartModule.bringChartIntoView();
            if (chartMoved) {
              console.log("Chart was off-screen and has been repositioned");
            }
          }
        }
      });
      
    } catch (error) {
      console.error("Critical initialization error:", error);
      document.body.innerHTML += `
        <div class="error-message">
          <h3>Critical Error</h3>
          <p>${error.message}</p>
          <p>Please try refreshing the page or contact support.</p>
        </div>
      `;
    }
  };

  /**
   * Restore UI state from localStorage
   */
  const restoreUIState = () => {
    try {
      // Restore display options
      const displayOptionsStr = localStorage.getItem('displayOptions');
      if (displayOptionsStr) {
        const displayOptions = JSON.parse(displayOptionsStr);
        if (displayOptions && typeof displayOptions === 'object') {
          // Update state
          Object.keys(displayOptions).forEach(key => {
            if (core.state.displayOptions.hasOwnProperty(key)) {
              core.state.displayOptions[key] = displayOptions[key];
            }
          });
          
          // Update UI checkboxes
          Object.keys(core.state.displayOptions).forEach(field => {
            const checkbox = document.querySelector(`input[name="${field}"]`);
            if (checkbox) {
              checkbox.checked = core.state.displayOptions[field];
            }
          });
        }
      }
      
      // Restore threshold filter
      const threshold = localStorage.getItem('thresholdFilter');
      if (threshold) {
        core.state.currentThresholdFilter = threshold;
        
        // Update radio buttons
        const thresholdRadios = document.getElementsByName("thresholdFilter");
        if (thresholdRadios) {
          for (const radio of thresholdRadios) {
            if (radio.value === threshold) {
              radio.checked = true;
              break;
            }
          }
        }
        
        // Update boundary layer with the new threshold
        if (window.mapUtils) {
          window.mapUtils.updateBoundaryLayer();
        }
      }
      
      // Restore trajectory visibility
      const showTrajectory = localStorage.getItem('showTrajectory');
      if (showTrajectory && core.elements.showTrajectoryCheckbox) {
        core.elements.showTrajectoryCheckbox.checked = showTrajectory === 'true';
        
        // Update trajectory visibility
        if (window.viewOptions) {
          window.viewOptions.updateTrajectoryDisplay();
        }
      }
      
      // Restore layer index
      const layerIndexStr = localStorage.getItem('currentLayerIndex');
      if (layerIndexStr) {
        const layerIndex = parseInt(layerIndexStr);
        if (!isNaN(layerIndex) && 
            layerIndex >= 0 && 
            layerIndex < core.state.geojsonLayers.length) {
          window.mapUtils.showLayerAtIndex(layerIndex);
        }
      }
      
      // Update markers with restored state
      if (window.viewOptions) {
        window.viewOptions.updateMarkers();
      }
      
    } catch (error) {
      console.error("Failed to restore UI state:", error);
    }
  };

  /**
   * Set up player controls
   */
  const setupPlayerControls = () => {
    console.log("Setting up player controls...");
    
    // Force DOM element lookup to be sure we have the latest references
    const timelineSlider = document.getElementById("timeline");
    const prevBtn = document.getElementById("prevLayer");
    const playPauseBtn = document.getElementById("playPause");
    const nextBtn = document.getElementById("nextLayer");
    const speedInput = document.getElementById("speed");
    const speedValueSpan = document.getElementById("speedValue");
    
    // Debug each element
    console.log("Direct DOM lookup results:");
    console.log("- timelineSlider:", timelineSlider ? "Found" : "Not found");
    console.log("- prevBtn:", prevBtn ? "Found" : "Not found");
    console.log("- playPauseBtn:", playPauseBtn ? "Found" : "Not found");
    console.log("- nextBtn:", nextBtn ? "Found" : "Not found");
    console.log("- speedInput:", speedInput ? "Found" : "Not found");
    console.log("- speedValueSpan:", speedValueSpan ? "Found" : "Not found");
    
    // Force the core.elements to be updated with direct lookups
    if (!core.elements) {
      console.error("core.elements is undefined, initializing...");
      core.elements = {};
    }
    
    core.elements.timelineSlider = timelineSlider;
    core.elements.prevBtn = prevBtn;
    core.elements.playPauseBtn = playPauseBtn;
    core.elements.nextBtn = nextBtn;
    core.elements.speedInput = speedInput;
    core.elements.speedValueSpan = speedValueSpan;
    
    // Timeline slider
    if (timelineSlider) {
      timelineSlider.addEventListener("input", e => {
        const idx = parseInt(e.target.value);
        if (!isNaN(idx)) window.mapUtils.showLayerAtIndex(idx);
        window.updatePlayerProgress();
      });
    } else {
      console.warn("Timeline slider element not found");
    }
    
    // Previous button
    if (prevBtn) {
      prevBtn.addEventListener("click", () => {
        const newIndex = (core.state.currentIndex - 1 + core.state.geojsonLayers.length) % 
                       core.state.geojsonLayers.length;
        window.mapUtils.showLayerAtIndex(newIndex);
      });
    } else {
      console.warn("Previous button element not found");
    }
    
    // Next button
    if (nextBtn) {
      nextBtn.addEventListener("click", () => {
        const newIndex = (core.state.currentIndex + 1) % core.state.geojsonLayers.length;
        window.mapUtils.showLayerAtIndex(newIndex);
      });
    } else {
      console.warn("Next button element not found");
    }
    
    // Play/Pause button
    if (playPauseBtn) {
      playPauseBtn.addEventListener("click", togglePlayPause);
    } else {
      console.warn("Play/Pause button element not found");
    }
    
    // Speed input
    if (speedInput && speedValueSpan) {
      speedInput.addEventListener("input", () => {
        speedValueSpan.textContent = speedInput.value;
        updatePlayInterval();
        window.updateSpeedProgress();
      });
    } else {
      console.warn("Speed input or value span element not found");
    }
    
    // Initialize timeline progress display
    if (window.updatePlayerProgress) {
      window.updatePlayerProgress();
    } else {
      console.warn("updatePlayerProgress function not found");
    }
    
    console.log("Player controls setup completed");
  };
  
  /**
   * Toggle play/pause state
   */
  const togglePlayPause = () => {
    if (!core.state.geojsonLayers.length) return;
    
    core.state.playing = !core.state.playing;
    
    if (core.elements.playPauseBtn) {
      core.elements.playPauseBtn.textContent = core.state.playing ? "Pause" : "Play";
    }
    
    if (core.state.playing) {
      updatePlayInterval();
    } else {
      clearInterval(core.state.playInterval);
    }
  };
  
  /**
   * Update the play interval based on current speed
   */
  const updatePlayInterval = () => {
    if (core.state.playInterval) clearInterval(core.state.playInterval);
    
    if (core.state.playing) {
      const speed = core.elements.speedInput ? 
        parseFloat(core.elements.speedInput.value) : 2;
      
      core.state.playInterval = setInterval(() => {
        // Remember if trajectory checkbox is checked before changing layers
        const showTrajectoryCheckbox = document.getElementById("showTrajectory");
        const shouldShowTrajectory = showTrajectoryCheckbox ? showTrajectoryCheckbox.checked : false;
        
        // Advance to next frame
        let next = core.state.currentIndex + 1;
        if (next >= core.state.geojsonLayers.length) next = 0;
        
        // Update the displayed layer
        window.mapUtils.showLayerAtIndex(next);
        
        // Ensure trajectory is maintained during playback
        if (shouldShowTrajectory) {
          // Ensure trajectory is loaded for the new layer
          window.mapUtils.loadTrajectoryForCurrentLayer();
        }
      }, speed * 1000);
    }
  };

  // Make functions available globally for the player.js
  window.updatePlayInterval = updatePlayInterval;
  window.togglePlayPause = togglePlayPause;
  
  // Initialize the application
  initializeApp();
});
