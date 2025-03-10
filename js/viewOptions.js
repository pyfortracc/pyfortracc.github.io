/**
 * viewOptions.js - View options panel functionality
 * 
 * Contains:
 * - View options panel management
 * - Field options generation
 * - Display options management
 * - Threshold filter functionality
 */

// ============ VIEW OPTIONS MODULE ============
const viewOptions = (() => {
  // Private variables
  let markerGroup;
  let dynamicOptionsContainer;
  let showTrajectoryCheckbox;
  let thresholdRadios;
  
  /**
   * Initialize the view options module
   * @param {L.LayerGroup} markerLayerGroup - The marker layer group
   */
  const initialize = (markerLayerGroup) => {
    console.log("ViewOptions: Starting initialization...");
    
    // Make sure core elements are available
    if (!core.elements) {
      console.error("ViewOptions: Core elements not available. Cannot initialize view options.");
      return;
    }
    
    // Store marker group reference
    markerGroup = markerLayerGroup;
    
    // Get DOM elements with safety checks
    // Either use the element from core or try to find it directly in the DOM
    dynamicOptionsContainer = core.elements.dynamicOptionsContainer || document.getElementById("dynamic-options");
    if (!dynamicOptionsContainer) {
      console.error("ViewOptions: Dynamic options container not found");
      // Create the container if it doesn't exist
      dynamicOptionsContainer = document.createElement('div');
      dynamicOptionsContainer.id = 'dynamic-options';
      
      // Try to append it to the info panel
      const infoPanel = document.getElementById('info-panel');
      if (infoPanel) {
        // Insert after the heading
        const heading = infoPanel.querySelector('h3');
        if (heading) {
          heading.insertAdjacentElement('afterend', dynamicOptionsContainer);
        } else {
          infoPanel.insertAdjacentElement('afterbegin', dynamicOptionsContainer);
        }
      } else {
        // Fallback - append to body
        document.body.appendChild(dynamicOptionsContainer);
      }
      
      console.log("ViewOptions: Created missing dynamic options container");
    }
    
    showTrajectoryCheckbox = core.elements.showTrajectoryCheckbox || document.getElementById("showTrajectory");
    if (!showTrajectoryCheckbox) {
      console.error("ViewOptions: Trajectory checkbox not found");
    }
    
    thresholdRadios = core.elements.thresholdRadios || document.getElementsByName("thresholdFilter");
    if (!thresholdRadios || thresholdRadios.length === 0) {
      console.error("ViewOptions: Threshold radios not found");
    }
    
    console.log("ViewOptions: DOM elements accessed");
    
    // Only generate field options if the container exists
    if (dynamicOptionsContainer) {
      generateFieldOptions();
    }
    
    // Add event listeners
    setupEventListeners();
    
    console.log("ViewOptions: Module initialization completed");
  };

  /**
   * Generate checkboxes for each display field
   */
  const generateFieldOptions = () => {
    console.log("ViewOptions: Generating field options...");
    
    // Verify that dynamicOptionsContainer is available
    if (!dynamicOptionsContainer) {
      console.error("ViewOptions: Cannot generate field options - container not available");
      return;
    }
    
    try {
      // Clear existing options
      dynamicOptionsContainer.innerHTML = "";
      
      // Create a checkbox for each display key
      core.CONFIG.DISPLAY_KEYS.forEach(field => {
        const container = document.createElement("div");
        const label = document.createElement("label");
        const checkbox = document.createElement("input");
        
        container.className = "field-option";
        checkbox.type = "checkbox"; 
        checkbox.name = field; 
        checkbox.checked = core.state.displayOptions[field] || false;
        checkbox.addEventListener("change", updateDisplayOptions);
        
        label.appendChild(checkbox);
        label.appendChild(document.createTextNode("" + field));
        container.appendChild(label);
        dynamicOptionsContainer.appendChild(container);
      });
      
      console.log("ViewOptions: Field options generated successfully");
    } catch (error) {
      console.error("ViewOptions: Error generating field options:", error);
    }
  };

  /**
   * Update display options based on checkbox states
   */
  const updateDisplayOptions = () => {
    // Update state based on checkbox values
    core.CONFIG.DISPLAY_KEYS.forEach(field => {
      const checkbox = document.querySelector(`input[name="${field}"]`);
      if (checkbox) {
        core.state.displayOptions[field] = checkbox.checked;
      }
    });
    
    // Update markers with new display options
    updateMarkers();
  };

  /**
   * Update markers on the map to display selected fields
   */
  const updateMarkers = () => {
    try {
      // Clear existing markers if marker group exists
      if (markerGroup) {
        markerGroup.clearLayers();
      } else {
        console.error("ViewOptions: Marker group not initialized");
        return;
      }
      
      // If no current layer, exit
      if (!core.state.geojsonLayers[core.state.currentIndex]) return;
      
      // Filter features based on threshold and selection
      const filteredFeatures = core.state.geojsonLayers[core.state.currentIndex].geojson.features
        .filter(feature => {
          // If a feature is selected, only show that one
          if (core.state.selection.feature) {
            return feature.properties && 
                   feature.properties.uid === core.state.selection.feature.properties.uid && 
                   core.passesThreshold(feature);
          }
          // Otherwise show all features that pass the threshold filter
          return core.passesThreshold(feature);
        });
      
      // Create a marker for each filtered feature
      filteredFeatures.forEach(feature => {
        // Calculate centroid position
        const centroid = core.utils.computeCentroid(feature);
        if (!centroid) return;
        
        // Determine which fields to display
        let infoText = "";
        core.CONFIG.DISPLAY_KEYS.forEach(field => {
          if (core.state.displayOptions[field] && 
              feature.properties && 
              feature.properties[field] !== undefined) {
            infoText += `${field}: ${feature.properties[field]}<br>`;
          }
        });
        
        // If there's info to display, create a marker with tooltip
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
    } catch (error) {
      console.error("ViewOptions: Error updating markers:", error);
    }
  };

  /**
   * Update threshold filter based on radio button selection
   */
  const updateThresholdFilter = () => {
    if (!thresholdRadios) {
      console.error("ViewOptions: Cannot update threshold filter - radio buttons not available");
      return;
    }
    
    // Get the selected threshold value
    for (const radio of thresholdRadios) {
      if (radio.checked) {
        core.state.currentThresholdFilter = radio.value;
        break;
      }
    }
    
    // Trigger updates to affected components
    if (window.mapUtils && window.mapUtils.updateBoundaryLayer) {
      window.mapUtils.updateBoundaryLayer();
    }
    
    updateMarkers();
    
    // Update trajectory display if enabled
    if (showTrajectoryCheckbox && showTrajectoryCheckbox.checked) {
      if (window.mapUtils && window.mapUtils.loadTrajectoryForCurrentLayer) {
        window.mapUtils.loadTrajectoryForCurrentLayer();
      }
    }
  };

  /**
   * Toggle trajectory display based on checkbox
   */
  const updateTrajectoryDisplay = () => {
    // Get the show trajectory checkbox
    const showTrajectoryCheckbox = document.getElementById("showTrajectory");
    if (!showTrajectoryCheckbox) {
      console.error("ViewOptions: Show trajectory checkbox not found");
      return;
    }
    
    // Store checkbox reference in core elements for access by other modules
    if (core.elements) {
      core.elements.showTrajectoryCheckbox = showTrajectoryCheckbox;
    }
    
    // Check if trajectory should be shown
    const showTrajectory = showTrajectoryCheckbox.checked;
    
    // Update trajectory display based on checkbox state
    if (showTrajectory) {
      // Check if we have map utilities loaded
      if (window.mapUtils && window.mapUtils.loadTrajectoryForCurrentLayer) {
        window.mapUtils.loadTrajectoryForCurrentLayer();
      } else {
        console.error("ViewOptions: Map utilities not available for trajectory loading");
      }
    } else {
      // Remove trajectory layer if unchecked
      if (window.mapUtils && window.mapUtils.removeTrajectoryLayer) {
        window.mapUtils.removeTrajectoryLayer();
      }
    }
    
    // Save preference to localStorage
    localStorage.setItem('showTrajectory', showTrajectory);
  };

  /**
   * Set up event listeners for view options controls
   */
  const setupEventListeners = () => {
    // Trajectory checkbox
    if (showTrajectoryCheckbox) {
      showTrajectoryCheckbox.addEventListener("change", updateTrajectoryDisplay);
    }
    
    // Threshold filter radios
    if (thresholdRadios) {
      Array.from(thresholdRadios).forEach(radio => 
        radio.addEventListener("change", updateThresholdFilter)
      );
    }
  };

  // Public API
  return {
    initialize,
    updateMarkers,
    updateDisplayOptions,
    updateThresholdFilter,
    updateTrajectoryDisplay
  };
})();

// Export viewOptions to the global scope
window.viewOptions = viewOptions;
