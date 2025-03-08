/**
 * stateManager.js - Application state persistence management
 * 
 * Handles:
 * - Saving application state to localStorage
 * - Loading application state from localStorage
 * - Differentiating between auto-refresh and manual refreshes
 */

// =========== STATE MANAGER MODULE ===========
const stateManager = (() => {
  // Constants for state storage
  const KEYS = {
    AUTO_RELOAD_FLAG: 'autoReloadInProgress',
    MAP_VIEW: 'mapViewState',
    SELECTED_UID: 'selectedSystemUid',
    DISPLAY_OPTIONS: 'displayOptions',
    THRESHOLD: 'thresholdFilter',
    LAYER_INDEX: 'currentLayerIndex',
    SHOW_TRAJECTORY: 'showTrajectory',
    CHART_POSITION: 'chartPosition',
    LAST_INTERACTION: 'lastUserInteraction',
    MANUAL_RESET: 'manualResetRequested',
    MAP_LAYER: 'preferredMapLayer',
  };
  
  // How long to consider a reload automatic vs. manual (5 min in ms)
  const AUTO_RELOAD_TIMEOUT = 5 * 60 * 1000;
  
  /**
   * Save the current application state to localStorage
   * @param {boolean} isAutoReload - Whether this is an automatic reload
   */
  const saveState = (isAutoReload = false) => {
    try {
      const now = Date.now();
      
      // Don't preserve state if a manual reset was requested,
      // unless this is an auto reload
      const manualResetRequested = localStorage.getItem(KEYS.MANUAL_RESET) === 'true';
      if (manualResetRequested && !isAutoReload) {
        console.log("Manual reset requested, clearing state...");
        clearAllState();
        return;
      }
      
      // Set auto reload flag with timestamp
      if (isAutoReload) {
        localStorage.setItem(KEYS.AUTO_RELOAD_FLAG, now.toString());
      }
      
      // Save current map position and zoom
      if (core.elements && core.elements.map) {
        const mapCenter = core.elements.map.getCenter();
        const mapZoom = core.elements.map.getZoom();
        
        if (mapCenter && !isNaN(mapCenter.lat) && !isNaN(mapCenter.lng) && !isNaN(mapZoom)) {
          const viewState = {
            center: [mapCenter.lat, mapCenter.lng],
            zoom: mapZoom
          };
          localStorage.setItem(KEYS.MAP_VIEW, JSON.stringify(viewState));
        }
      }
      
      // Save selection state
      if (core.state.selection && core.state.selection.uid) {
        localStorage.setItem(KEYS.SELECTED_UID, core.state.selection.uid);
      } else {
        localStorage.removeItem(KEYS.SELECTED_UID);
      }
      
      // Save display options
      if (core.state.displayOptions) {
        localStorage.setItem(KEYS.DISPLAY_OPTIONS, JSON.stringify(core.state.displayOptions));
      }
      
      // Save threshold filter
      if (core.state.currentThresholdFilter) {
        localStorage.setItem(KEYS.THRESHOLD, core.state.currentThresholdFilter);
      }
      
      // Save current layer index
      if (core.state.currentIndex !== undefined) {
        localStorage.setItem(KEYS.LAYER_INDEX, core.state.currentIndex.toString());
      }
      
      // Save show trajectory state
      if (core.elements && core.elements.showTrajectoryCheckbox) {
        localStorage.setItem(
          KEYS.SHOW_TRAJECTORY, 
          core.elements.showTrajectoryCheckbox.checked ? 'true' : 'false'
        );
      }
      
      // Record last interaction time
      if (!isAutoReload) {
        localStorage.setItem(KEYS.LAST_INTERACTION, now.toString());
      }
      
      console.log(`State saved successfully (${isAutoReload ? 'auto reload' : 'manual save'})`);
    } catch (error) {
      console.error("Failed to save application state:", error);
    }
  };
  
  /**
   * Restore application state from localStorage
   */
  const loadState = () => {
    try {
      // Check if this is likely a manual refresh or auto reload
      const isAutoReload = checkIfAutoReload();
      
      // If manual refresh and no auto reload in progress, clear states
      if (!isAutoReload) {
        const manualResetRequested = localStorage.getItem(KEYS.MANUAL_RESET) === 'true';
        
        if (manualResetRequested) {
          console.log("Manual page refresh detected with reset flag - starting with clean state");
          clearAllState();
          return false;
        }
        
        console.log("Manual page refresh detected - starting with clean state");
        // Keep map view state and selected layer, but clear selections and UI state
        clearUIState();
        return false;
      }
      
      console.log("Auto reload detected - restoring previous state");
      
      // We'll restore the state throughout the app initialization process
      // by having other modules check localStorage directly
      // This function just returns whether state should be restored
      
      return true;
    } catch (error) {
      console.error("Failed to load application state:", error);
      return false;
    } finally {
      // Always clear the auto reload flag when done
      localStorage.removeItem(KEYS.AUTO_RELOAD_FLAG);
      localStorage.removeItem(KEYS.MANUAL_RESET);
    }
  };
  
  /**
   * Check if the current page load is likely an automatic reload
   * @returns {boolean} True if this appears to be an automatic reload
   */
  const checkIfAutoReload = () => {
    const autoReloadTimeStr = localStorage.getItem(KEYS.AUTO_RELOAD_FLAG);
    if (!autoReloadTimeStr) return false;
    
    const autoReloadTime = parseInt(autoReloadTimeStr);
    if (isNaN(autoReloadTime)) return false;
    
    const now = Date.now();
    const timeSinceAutoReload = now - autoReloadTime;
    
    // If the auto reload flag was set within the timeout period,
    // consider this an automatic reload
    return timeSinceAutoReload < AUTO_RELOAD_TIMEOUT;
  };
  
  /**
   * Clear all application state, including view preferences
   */
  const clearAllState = () => {
    localStorage.removeItem(KEYS.SELECTED_UID);
    localStorage.removeItem(KEYS.DISPLAY_OPTIONS);
    localStorage.removeItem(KEYS.THRESHOLD);
    localStorage.removeItem(KEYS.LAYER_INDEX);
    localStorage.removeItem(KEYS.SHOW_TRAJECTORY);
    localStorage.removeItem(KEYS.MAP_VIEW);
    localStorage.removeItem(KEYS.CHART_POSITION);
    localStorage.removeItem(KEYS.AUTO_RELOAD_FLAG);
    localStorage.removeItem(KEYS.LAST_INTERACTION);
    localStorage.removeItem(KEYS.MANUAL_RESET);
    // We keep the preferred map layer since it's a user preference
  };
  
  /**
   * Clear UI state while preserving map view and preferences
   */
  const clearUIState = () => {
    localStorage.removeItem(KEYS.SELECTED_UID);
    localStorage.removeItem(KEYS.DISPLAY_OPTIONS);
    localStorage.removeItem(KEYS.SHOW_TRAJECTORY);
    localStorage.removeItem(KEYS.AUTO_RELOAD_FLAG);
    // We keep map view, threshold, and layer index
  };
  
  /**
   * Set a flag to request a full reset on next manual page refresh
   */
  const requestManualReset = () => {
    localStorage.setItem(KEYS.MANUAL_RESET, 'true');
    
    // Show notification to the user
    const notification = document.createElement('div');
    notification.className = 'state-reset-notification';
    notification.textContent = 'Settings will be reset on next page refresh.';
    document.body.appendChild(notification);
    
    // Remove after 3 seconds
    setTimeout(() => {
      if (notification.parentNode) {
        notification.parentNode.removeChild(notification);
      }
    }, 3000);
  };
  
  /**
   * Handle automatic reload before page unload
   */
  const handleAutoReload = () => {
    saveState(true);
  };
  
  /**
   * Set up event listeners
   */
  const initialize = () => {
    // Update last interaction time on certain user actions
    const updateInteractionTime = () => {
      localStorage.setItem(KEYS.LAST_INTERACTION, Date.now().toString());
    };
    
    // Key user interactions that should update the timestamp
    document.addEventListener('mousedown', updateInteractionTime);
    document.addEventListener('touchstart', updateInteractionTime);
    document.addEventListener('keydown', updateInteractionTime);
    
    // Handle beforeunload to save state if it's not a user-initiated reload
    window.addEventListener('beforeunload', e => {
      // Save state automatically before unload
      saveState(false);
    });
    
    // Add a reset button to the UI
    addResetButton();
    
    // Check if state should be restored
    return loadState();
  };
  
  /**
   * Add a reset button to the UI
   */
  const addResetButton = () => {
    // Create the reset button
    const resetButton = document.createElement('button');
    resetButton.id = 'reset-app-state';
    resetButton.title = 'Reset all settings';
    resetButton.innerHTML = '<i class="fas fa-redo-alt"></i>';
    resetButton.className = 'control-button';
    
    // Add click event
    resetButton.addEventListener('click', () => {
      if (confirm('Reset all settings to default? This will take effect on the next page refresh.')) {
        requestManualReset();
      }
    });
    
    // Add to the page
    document.body.appendChild(resetButton);
  };
  
  // Public API
  return {
    initialize,
    saveState,
    loadState,
    requestManualReset,
    handleAutoReload
  };
})();

// Expose to the global scope
window.stateManager = stateManager;
