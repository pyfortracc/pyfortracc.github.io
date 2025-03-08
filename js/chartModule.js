/**
 * chartModule.js - Chart functionality for system evolution visualization
 * 
 * Contains:
 * - Chart initialization and configuration
 * - Time series data collection
 * - Chart update functions
 * - Chart UI controls
 */

// ============ CHART MODULE ============
const chartModule = (() => {
  // Private variables
  let chartInstance = null;
  let chartContainer = null;
  let chartCanvas = null;
  let variableSelector = null;
  
  /**
   * Initialize the chart module
   */
  const initialize = () => {
    console.log("Chart module: Starting initialization...");
    
    // Get references to DOM elements - use existing container instead of creating
    chartContainer = document.getElementById(core.CONFIG.DOM_IDS.POLYGON_CHART_CONTAINER);
    
    if (!chartContainer) {
      console.error("Chart module: Chart container not found. Creating one...");
      createChartContainer();
      chartContainer = document.getElementById(core.CONFIG.DOM_IDS.POLYGON_CHART_CONTAINER);
    }
    
    chartCanvas = document.getElementById(core.CONFIG.DOM_IDS.POLYGON_CHART);
    variableSelector = document.getElementById(core.CONFIG.DOM_IDS.VARIABLE_SELECTOR);
    
    // Check if elements were found
    if (!chartCanvas) {
      console.error("Chart module: Chart canvas not found");
    }
    
    if (!variableSelector) {
      console.error("Chart module: Variable selector not found");
      createVariableSelector();
    } else {
      // Update the selector options if it already exists
      populateVariableSelector();
    }
    
    // Set up event listeners
    setupEventListeners();
    
    // Load Chart.js if not already loaded
    loadChartJsIfNeeded();
    
    // Make chart container draggable
    makeDraggable(chartContainer);
    
    // Restore saved position if available
    restoreChartPosition();
    
    console.log("Chart module initialized");
  };
  
  /**
   * Create chart container and UI if not already in the DOM
   */
  const createChartContainer = () => {
    // Skip if container already exists
    if (document.getElementById(core.CONFIG.DOM_IDS.POLYGON_CHART_CONTAINER)) {
      return;
    }
    
    console.log("Chart module: Creating chart container elements");
    
    // Create container
    const container = document.createElement("div");
    container.id = core.CONFIG.DOM_IDS.POLYGON_CHART_CONTAINER;
    
    // Create header with title and controls
    const headerContainer = document.createElement("div");
    headerContainer.className = "header-with-controls";
    
    const chartTitle = document.createElement("h4");
    chartTitle.textContent = "System Evolution";
    
    // Container for header buttons
    const headerButtons = document.createElement("div");
    headerButtons.className = "chart-header-buttons";
    
    // Close button
    const closeButton = document.createElement("button");
    closeButton.textContent = "×";
    closeButton.className = "close-button";
    headerButtons.appendChild(closeButton);
    
    // Assemble header
    headerContainer.appendChild(chartTitle);
    headerContainer.appendChild(headerButtons);
    
    // Create variable selector dropdown
    const selector = document.createElement("select");
    selector.id = core.CONFIG.DOM_IDS.VARIABLE_SELECTOR;
    
    // Add options for each available variable
    core.CONFIG.CHART.EVOLUTION_VARIABLES.forEach(variable => {
      const option = document.createElement("option");
      option.value = variable;
      option.text = variable.charAt(0).toUpperCase() + variable.slice(1);
      if (variable === core.CONFIG.CHART.DEFAULT_VARIABLE) {
        option.selected = true;
      }
      selector.appendChild(option);
    });
    
    // Create chart body
    const chartBody = document.createElement("div");
    chartBody.id = "chart-body";
    
    // Create canvas for the chart
    const canvas = document.createElement("canvas");
    canvas.id = core.CONFIG.DOM_IDS.POLYGON_CHART;
    
    // Assemble chart components
    chartBody.appendChild(selector);
    chartBody.appendChild(canvas);
    
    // Add all elements to container
    container.appendChild(headerContainer);
    container.appendChild(chartBody);
    
    // Add container to document body
    document.body.appendChild(container);
    
    // Hide container initially
    container.style.display = "none";
  };
  
  /**
   * Create the variable selector dropdown
   */
  const createVariableSelector = () => {
    if (chartContainer) {
      const chartBody = chartContainer.querySelector("#chart-body");
      if (chartBody) {
        variableSelector = document.createElement("select");
        variableSelector.id = core.CONFIG.DOM_IDS.VARIABLE_SELECTOR;
        chartBody.insertBefore(variableSelector, chartBody.firstChild);
        
        // Populate the selector
        populateVariableSelector();
      }
    }
  };
  
  /**
   * Populate the variable selector with options from config
   */
  const populateVariableSelector = () => {
    if (!variableSelector) return;
    
    // Clear existing options
    variableSelector.innerHTML = '';
    
    // Add options for each chart variable
    core.CONFIG.CHART_DISPLAY_KEYS.forEach(variable => {
      const option = document.createElement("option");
      option.value = variable;
      
      // Use label from config if available, otherwise capitalize the variable name
      const label = core.CONFIG.CHART.LABELS?.[variable] || 
                   variable.charAt(0).toUpperCase() + variable.slice(1);
      option.text = label;
      
      // Set default selected variable
      if (variable === core.CONFIG.DEFAULT_CHART_VARIABLE) {
        option.selected = true;
      }
      
      variableSelector.appendChild(option);
    });
    
    // Set up change event handler
    variableSelector.onchange = () => {
      if (core.state.selection.feature) {
        updateChart(core.state.selection.feature);
      }
    };
  };
  
  /**
   * Set up event listeners for chart controls
   */
  const setupEventListeners = () => {
    // Close button event
    const closeButton = chartContainer.querySelector(".close-button");
    if (closeButton) {
      closeButton.addEventListener("click", (e) => {
        e.stopPropagation(); // Prevent event from propagating to the map
        
        // Hide chart
        chartContainer.style.display = "none";
        
        // Clear selection if chart panel is closed
        if (core.state.selection.uid) {
          if (core.state.currentBoundaryLayer) {
            core.state.currentBoundaryLayer.eachLayer(layer => {
              core.state.currentBoundaryLayer.resetStyle(layer);
            });
          }
          
          core.state.selection.uid = null;
          core.state.selection.feature = null;
          core.state.selection.layer = null;
          
          // Update markers to show all based on global config
          window.viewOptions.updateMarkers();
        }
      });
    }
    
    // Variable selector change event
    if (variableSelector) {
      variableSelector.addEventListener("change", () => {
        if (core.state.selection.feature) {
          updateChart(core.state.selection.feature);
        }
      });
    }
    
    // Add resize event listener to maintain chart position
    window.addEventListener('resize', () => {
      if (chartContainer && chartContainer.style.transform) {
        // Extract current position
        const match = chartContainer.style.transform.match(/translate\((\d+)px, (\d+)px\)/);
        if (match) {
          const x = parseInt(match[1]);
          const y = parseInt(match[2]);
          
          // Keep chart within viewport when window is resized
          const boundX = Math.max(0, Math.min(x, window.innerWidth - chartContainer.offsetWidth));
          const boundY = Math.max(0, Math.min(y, window.innerHeight - chartContainer.offsetHeight));
          
          chartContainer.style.transform = `translate(${boundX}px, ${boundY}px)`;
          saveChartPosition(boundX, boundY);
        }
      }
    });
    
    // Add a reset position button
    const headerButtons = chartContainer.querySelector('.chart-header-buttons');
    if (headerButtons) {
      const resetButton = document.createElement('button');
      resetButton.className = 'reset-position-button';
      resetButton.title = 'Reset Chart Position';
      resetButton.innerHTML = '<i class="fas fa-compress-arrows-alt"></i>'; // Font Awesome icon
      resetButton.addEventListener('click', (e) => {
        e.stopPropagation();
        chartContainer.style.transform = '';
        localStorage.removeItem('chartPosition');
      });
      headerButtons.insertBefore(resetButton, headerButtons.firstChild);
    }
  };
  
  /**
   * Load Chart.js library if not already loaded
   */
  const loadChartJsIfNeeded = () => {
    if (typeof Chart !== 'undefined') {
      console.log("Chart.js already loaded");
      return;
    }
    
    console.log("Loading Chart.js");
    const chartScript = document.createElement("script");
    chartScript.src = "https://cdn.jsdelivr.net/npm/chart.js@3.9.1/dist/chart.min.js";
    chartScript.onload = () => {
      console.log("Chart.js loaded successfully");
    };
    document.head.appendChild(chartScript);
  };
  
  /**
   * Collect time-series data for a specific system across all layers
   * @param {string} uid - Unique identifier of the system to track
   * @returns {object} Object containing timestamps and variable values
   */
  const collectTimeSeriesData = (uid) => {
    // Check if data is already cached
    if (core.state.dataCache && core.state.dataCache[uid]) {
      return core.state.dataCache[uid];
    }
    
    // Array to store time-ordered data points
    const dataPoints = [];
    
    // Iterate through all layers to find the system with matching UID
    core.state.geojsonLayers.forEach(layer => {
      if (!layer.geojson || !layer.geojson.features) return;
      
      // Find feature with matching UID
      const feature = layer.geojson.features.find(f => 
        f.properties && f.properties.uid === uid);
      
      if (!feature || !feature.properties) return;
      
      // Extract timestamp from filename
      const timestamp = core.utils.extractTimestampFromFileName(layer.fileName);
      if (!timestamp) return;
      
      // Create base object with timestamp and date for sorting
      const dataPoint = {
        timestamp: timestamp,
        originalDate: new Date(timestamp)
      };
      
      // Add all configured variables dynamically
      core.CONFIG.CHART.EVOLUTION_VARIABLES.forEach(variable => {
        dataPoint[variable] = parseFloat(feature.properties[variable] || 0);
      });
      
      // Store data point
      dataPoints.push(dataPoint);
    });
    
    // Sort by timestamp
    dataPoints.sort((a, b) => a.originalDate - b.originalDate);
    
    // Prepare base structure for result
    const timeSeriesData = {
      timestamps: dataPoints.map(p => p.timestamp)
    };
    
    // Populate arrays for each variable dynamically
    core.CONFIG.CHART.EVOLUTION_VARIABLES.forEach(variable => {
      timeSeriesData[variable] = dataPoints.map(p => p[variable]);
    });
    
    // Cache data for future use
    if (!core.state.dataCache) core.state.dataCache = {};
    core.state.dataCache[uid] = timeSeriesData;
    
    return timeSeriesData;
  };
  
  /**
   * Update chart with data from selected feature
   * @param {object} feature - GeoJSON feature with system data
   */
  const updateChart = (feature) => {
    if (!feature || !feature.properties) {
      console.warn("Chart module: No valid feature provided for chart update");
      return;
    }
    
    const props = feature.properties;
    const uid = props.uid || "N/A";
    
    console.log("Chart module: Updating chart for UID:", uid);
    
    // Update chart title
    const chartTitle = chartContainer.querySelector("h4");
    if (chartTitle) {
      chartTitle.textContent = `System Evolution - UID: ${uid}`;
    }
    
    // Ensure Chart.js is available
    if (typeof Chart === "undefined") {
      console.error("Chart module: Chart.js is not loaded yet");
      loadChartJsIfNeeded();
      setTimeout(() => updateChart(feature), 500);
      return;
    }
    
    // Collect time series data for this feature
    const timeSeriesData = collectTimeSeriesData(uid);
    if (!timeSeriesData || !timeSeriesData.timestamps || timeSeriesData.timestamps.length === 0) {
      console.warn("Chart module: No time series data available for this feature");
      chartContainer.style.display = "none";
      return;
    }
    
    // Get current timestamp for filtering
    const currentFileName = core.state.geojsonLayers[core.state.currentIndex].fileName;
    const currentTimestamp = core.utils.extractTimestampFromFileName(currentFileName);
    
    // Find data up to current timestamp to create the timeseries
    let currentIndex = timeSeriesData.timestamps.findIndex(ts => 
      new Date(ts) > new Date(currentTimestamp)
    );
    
    // If not found, use all data
    if (currentIndex === -1) currentIndex = timeSeriesData.timestamps.length;
    
    // Get selected variable from dropdown
    const selectedVariable = variableSelector ? variableSelector.value : core.CONFIG.DEFAULT_CHART_VARIABLE;
    
    // Format timestamps and prepare data
    const formattedLabels = timeSeriesData.timestamps.slice(0, currentIndex).map(ts => {
      return ts.split(' ')[1]; // Extract only HH:MM:SS
    });
    
    // Verify we have data for the selected variable
    if (!timeSeriesData[selectedVariable] || timeSeriesData[selectedVariable].length === 0) {
      console.warn(`Chart module: No data available for variable ${selectedVariable}`);
      chartContainer.style.display = "none";
      return;
    }
    
    // Get color for selected variable
    const variableColor = core.CONFIG.CHART.COLORS?.[selectedVariable] || 'rgb(75, 192, 192)';
    
    // Get display name for selected variable
    const variableLabel = core.CONFIG.CHART.LABELS?.[selectedVariable] || 
                         selectedVariable.charAt(0).toUpperCase() + selectedVariable.slice(1);
    
    // Destroy previous chart if it exists
    if (chartInstance) {
      chartInstance.destroy();
    }
    
    // Create the chart
    chartInstance = new Chart(chartCanvas, {
      type: 'line',
      data: {
        labels: formattedLabels,
        datasets: [{
          label: variableLabel,
          data: timeSeriesData[selectedVariable].slice(0, currentIndex),
          borderColor: variableColor,
          backgroundColor: variableColor.replace('rgb', 'rgba').replace(')', ', 0.2)'),
          tension: 0.1,
          pointRadius: 4,
          pointHoverRadius: 6,
          // Highlight the last point
          pointBackgroundColor: (context) => {
            return context.dataIndex === (currentIndex - 1) ? 
              'rgb(255, 0, 0)' : variableColor;
          },
          pointBorderColor: (context) => {
            return context.dataIndex === (currentIndex - 1) ? 
              'rgb(255, 0, 0)' : variableColor;
          },
          pointRadius: (context) => {
            return context.dataIndex === (currentIndex - 1) ? 
              6 : 4;
          }
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false, // Crucial for correct dimension control
        plugins: {
          legend: {
            display: true,
            position: 'top',
            labels: {
              color: '#f0f0f0' // Light color for legends
            }
          },
          tooltip: {
            callbacks: {
              title: (items) => {
                // Show full timestamp only in tooltip
                const idx = items[0].dataIndex;
                return `Timestamp: ${timeSeriesData.timestamps[idx]}`;
              },
              afterLabel: (context) => {
                return context.dataIndex === (currentIndex - 1) ? 
                  'Current' : '';
              }
            },
            backgroundColor: 'rgba(50, 50, 50, 0.9)', // Dark background for tooltip
            titleColor: '#f0f0f0', // Light text for tooltip title
            bodyColor: '#f0f0f0', // Light text for tooltip body
            borderColor: '#555', // Gray border for tooltip
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
              color: '#f0f0f0' // Light color for X axis title
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
              color: '#e0e0e0' // Light color for X axis labels
            },
            grid: {
              color: 'rgba(160, 160, 160, 0.3)' // Lighter and subtle grid lines
            }
          },
          y: {
            title: {
              display: true,
              text: variableLabel,
              color: '#f0f0f0' // Light color for Y axis title
            },
            ticks: {
              callback: function(value) {
                return Number.isInteger(value) ? value : value.toFixed(2);
              },
              color: '#e0e0e0', // Light color for Y axis labels
              maxTicksLimit: 8 // Limit number of ticks on Y axis
            },
            grid: {
              color: 'rgba(160, 160, 160, 0.3)' // Lighter and subtle grid lines
            },
            beginAtZero: true,
            grace: '10%', // Small space above maximum value
          }
        }
      }
    });
    
    // Store chart reference
    core.state.chart.instance = chartInstance;
    
    // Show the chart
    chartContainer.style.display = "block";
    console.log(`Chart module: Chart updated successfully for variable "${selectedVariable}"`);
  };
  
  /**
   * Hide the chart and clear selection
   */
  const hideChart = () => {
    if (chartContainer) {
      chartContainer.style.display = "none";
    }
  };
  
  /**
   * Make an element draggable
   * @param {HTMLElement} element - Element to make draggable
   */
  const makeDraggable = (element) => {
    if (!element) return;
    
    console.log("Chart module: Making chart container draggable");
    
    let offsetX = 0;
    let offsetY = 0;
    let isDragging = false;
    
    // Find or create drag handle (using the header)
    const dragHandle = element.querySelector('.header-with-controls');
    if (!dragHandle) return;
    
    // Set cursor style for header only
    dragHandle.style.cursor = "move";
    
    // Mouse events for desktop
    dragHandle.addEventListener('mousedown', startDrag);
    document.addEventListener('mousemove', drag);
    document.addEventListener('mouseup', stopDrag);
    
    // Touch events for mobile
    dragHandle.addEventListener('touchstart', startDragTouch);
    document.addEventListener('touchmove', dragTouch);
    document.addEventListener('touchend', stopDrag);
    
    function startDrag(e) {
      e.preventDefault();
      isDragging = true;
      
      // Get current transformation or default to 0,0
      let transform = element.style.transform || "";
      let translateX = 0;
      let translateY = 0;
      
      const match = transform.match(/translate\((-?\d+(?:\.\d+)?)px,\s*(-?\d+(?:\.\d+)?)px\)/);
      if (match) {
        translateX = parseFloat(match[1]);
        translateY = parseFloat(match[2]);
      }
      
      // Calculate offset based on current mouse position and element position
      offsetX = e.clientX - (element.getBoundingClientRect().left - translateX);
      offsetY = e.clientY - (element.getBoundingClientRect().top - translateY);
      
      // Add dragging class to show visual feedback
      element.classList.add('dragging');
    }
    
    function startDragTouch(e) {
      if (e.touches.length === 1) {
        const touch = e.touches[0];
        
        let transform = element.style.transform || "";
        let translateX = 0;
        let translateY = 0;
        
        const match = transform.match(/translate\((-?\d+(?:\.\d+)?)px,\s*(-?\d+(?:\.\d+)?)px\)/);
        if (match) {
          translateX = parseFloat(match[1]);
          translateY = parseFloat(match[2]);
        }
        
        // Calculate offset for touch
        offsetX = touch.clientX - (element.getBoundingClientRect().left - translateX);
        offsetY = touch.clientY - (element.getBoundingClientRect().top - translateY);
        
        isDragging = true;
        element.classList.add('dragging');
      }
    }
    
    function drag(e) {
      if (!isDragging) return;
      e.preventDefault();
      
      const x = e.clientX - offsetX;
      const y = e.clientY - offsetY;
      
      // Keep chart within viewport bounds, but ensure at least 30% of the element remains visible
      const elementWidth = element.offsetWidth;
      const elementHeight = element.offsetHeight;
      
      // Calculate min bounds to keep at least 20% of the element visible on all sides
      const minVisibleX = -elementWidth * 0.8;
      const maxVisibleX = window.innerWidth - elementWidth * 0.2;
      const minVisibleY = -elementHeight * 0.3; // Allow more to go off the top (only header visible)
      const maxVisibleY = window.innerHeight - elementHeight * 0.2;
      
      // Bound the position
      const boundX = Math.max(minVisibleX, Math.min(x, maxVisibleX));
      const boundY = Math.max(minVisibleY, Math.min(y, maxVisibleY));
      
      element.style.transform = `translate(${boundX}px, ${boundY}px)`;
      
      // Save position while dragging for smooth experience
      saveChartPosition(boundX, boundY);
    }
    
    function dragTouch(e) {
      if (!isDragging || e.touches.length !== 1) return;
      e.preventDefault();
      
      const touch = e.touches[0];
      const x = touch.clientX - offsetX;
      const y = touch.clientY - offsetY;
      
      // Keep chart within viewport bounds, but ensure at least 30% of the element remains visible
      const elementWidth = element.offsetWidth;
      const elementHeight = element.offsetHeight;
      
      // Calculate min bounds to keep at least 20% of the element visible on all sides
      const minVisibleX = -elementWidth * 0.8;
      const maxVisibleX = window.innerWidth - elementWidth * 0.2;
      const minVisibleY = -elementHeight * 0.3; // Allow more to go off the top (only header visible)
      const maxVisibleY = window.innerHeight - elementHeight * 0.2;
      
      // Bound the position
      const boundX = Math.max(minVisibleX, Math.min(x, maxVisibleX));
      const boundY = Math.max(minVisibleY, Math.min(y, maxVisibleY));
      
      element.style.transform = `translate(${boundX}px, ${boundY}px)`;
      
      // Save position while dragging for smooth experience
      saveChartPosition(boundX, boundY);
    }
    
    function stopDrag() {
      if (!isDragging) return;
      isDragging = false;
      element.classList.remove('dragging');
      
      // Get the final position after dragging stops
      const transform = element.style.transform || "";
      const match = transform.match(/translate\((-?\d+(?:\.\d+)?)px,\s*(-?\d+(?:\.\d+)?)px\)/);
      
      if (match) {
        const finalX = parseFloat(match[1]);
        const finalY = parseFloat(match[2]);
        
        // If too much of the element is off-screen, snap it back into view
        const elementWidth = element.offsetWidth;
        const elementHeight = element.offsetHeight;
        
        let adjustedX = finalX;
        let adjustedY = finalY;
        
        // If less than 100px is visible from the right edge, snap to show all but 20px from the right
        if (finalX + elementWidth < 100) {
          adjustedX = -elementWidth + 100;
        }
        
        // If less than 40px is visible from the bottom edge, snap to show at least that much
        if (finalY + elementHeight < 40) {
          adjustedY = -elementHeight + 40;
        }
        
        // If header is not visible from the top, snap it down
        if (finalY < -30) {
          adjustedY = -30; // Keep just the header visible
        }
        
        // If something was adjusted, update position
        if (adjustedX !== finalX || adjustedY !== finalY) {
          element.style.transform = `translate(${adjustedX}px, ${adjustedY}px)`;
          saveChartPosition(adjustedX, adjustedY);
        }
      }
    }
  };
  
  /**
   * Save chart position to localStorage
   * @param {number} x - X position
   * @param {number} y - Y position
   */
  const saveChartPosition = (x, y) => {
    const position = { x, y };
    localStorage.setItem('chartPosition', JSON.stringify(position));
  };
  
  /**
   * Restore chart position from localStorage
   */
  const restoreChartPosition = () => {
    try {
      const savedPositionStr = localStorage.getItem('chartPosition');
      if (!savedPositionStr) return;
      
      const position = JSON.parse(savedPositionStr);
      if (!position || typeof position.x !== 'number' || typeof position.y !== 'number') return;
      
      // Apply saved position
      if (chartContainer) {
        const elementWidth = chartContainer.offsetWidth;
        const elementHeight = chartContainer.offsetHeight;
        
        // Calculate min bounds to ensure at least 20% of the element is visible
        const minVisibleX = -elementWidth * 0.8;
        const maxVisibleX = window.innerWidth - elementWidth * 0.2;
        const minVisibleY = -elementHeight * 0.3; // Allow more to go off the top
        const maxVisibleY = window.innerHeight - elementHeight * 0.2;
        
        // Ensure position is valid within current viewport
        const boundX = Math.max(minVisibleX, Math.min(position.x, maxVisibleX));
        const boundY = Math.max(minVisibleY, Math.min(position.y, maxVisibleY));
        
        chartContainer.style.transform = `translate(${boundX}px, ${boundY}px)`;
      }
    } catch (err) {
      console.error("Chart module: Error restoring chart position", err);
    }
  };
  
  /**
   * Add a function to bring chart back into view if it's off-screen
   */
  const bringChartIntoView = () => {
    if (!chartContainer || chartContainer.style.display === 'none') return;
    
    const transform = chartContainer.style.transform || "";
    const match = transform.match(/translate\((-?\d+(?:\.\d+)?)px,\s*(-?\d+(?:\.\d+)?)px\)/);
    
    if (match) {
      const currentX = parseFloat(match[1]);
      const currentY = parseFloat(match[2]);
      
      // Get element dimensions
      const elementWidth = chartContainer.offsetWidth;
      const elementHeight = chartContainer.offsetHeight;
      
      // Check if the chart is too far off-screen
      const isOffscreenX = currentX + elementWidth < 50 || currentX > window.innerWidth - 50;
      const isOffscreenY = currentY + elementHeight < 50 || currentY > window.innerHeight - 50;
      
      // If off-screen, reset to default position
      if (isOffscreenX || isOffscreenY) {
        chartContainer.style.transform = `translate(${window.innerWidth - elementWidth - 20}px, 20px)`;
        saveChartPosition(window.innerWidth - elementWidth - 20, 20);
        return true;
      }
    }
    
    return false;
  };
  
  // Public API
  return {
    initialize,
    updateChart,
    hideChart,
    collectTimeSeriesData,
    resetChartPosition: () => {
      if (chartContainer) {
        chartContainer.style.transform = '';
        localStorage.removeItem('chartPosition');
      }
    },
    bringChartIntoView
  };
})();

// Export chartModule to the global scope
window.chartModule = chartModule;
