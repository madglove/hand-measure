// app/js/measurement.js

// Global variables to hold references to the display elements for current estimated hand measurements.
let currentPalmWidthDisplay;
let currentPalmLengthDisplay;

// Global variable for the container that will display the historical measurements.
let measurementHistoryContainer;
// Array to store historical measurement data, including pixel, mm, and estimated sizes.
let measurementHistory = [];

// Define the real-world dimensions of a standard credit card in millimeters.
// These values are used as a reference to convert pixel measurements to millimeters.
const ACTUAL_CARD_LONG_SIDE_MM = 85.60;
const ACTUAL_CARD_SHORT_SIDE_MM = 53.98;

// --- Adjustable Compensation Factors ---
// These factors are applied to the landmark-based millimeter measurements
// to better estimate the actual physiological hand dimensions.
// Adjust these values as needed for more accurate results.
const PALM_WIDTH_COMPENSATION_FACTOR = 1.30; // Adds 30% to the palm width (Landmark 5 to 17 distance)
const PALM_LENGTH_COMPENSATION_FACTOR = 1.00; // No compensation for palm length (Landmark 0 to 9 distance) by default

// This factor is applied to the detected card dimensions in pixels.
// Use a value less than 1.0 (e.g., 0.90 for a 10% reduction) if the detected bounding box
// is typically larger than the actual card due to borders or detection inaccuracies.
const CARD_DIMENSION_COMPENSATION_FACTOR = 0.90; // Reduces card dimensions by 10% by default

/**
 * Dynamically creates and appends the measurement display elements to the main content area.
 * This function should be called once when the DOM is fully loaded.
 */
function createMeasurementDisplayElements() {
    // Get the main content area where elements will be appended.
    const mainContent = document.getElementById("main-content");
    if (!mainContent) {
        // Log an error if the main content area is not found.
        console.error("Main content area not found to append measurement displays.");
        return;
    }

    // Create a container for the current estimated hand measurements.
    const measurementContainer = document.createElement("div");
    measurementContainer.className = "mt-4"; // Apply Bootstrap margin-top for spacing.

    // Add a prominent heading for the current estimated hand measurements.
    const heading = document.createElement("h2");
    heading.innerText = "Estimated Hand Measurements:";
    measurementContainer.appendChild(heading);

    // Create and append display elements for 'Estimated Palm Width'.
    currentPalmWidthDisplay = document.createElement("p");
    currentPalmWidthDisplay.id = "currentPalmWidthDisplay";
    currentPalmWidthDisplay.innerText = "Palm Width: Not detected"; // Initial state
    measurementContainer.appendChild(currentPalmWidthDisplay);

    // Create and append display elements for 'Estimated Palm Length'.
    currentPalmLengthDisplay = document.createElement("p");
    currentPalmLengthDisplay.id = "currentPalmLengthDisplay";
    currentPalmLengthDisplay.innerText = "Palm Length: Not detected"; // Initial state
    measurementContainer.appendChild(currentPalmLengthDisplay);

    // Append the current measurement container to the main content.
    mainContent.appendChild(measurementContainer);

    // Create and append the measurement history container.
    measurementHistoryContainer = document.createElement("div");
    measurementHistoryContainer.className = "mt-4"; // Apply Bootstrap margin-top for spacing.
    const historyHeading = document.createElement("h3");
    historyHeading.innerText = "Measurement History:";
    measurementHistoryContainer.appendChild(historyHeading);
    // Append the history container to the main content.
    mainContent.appendChild(measurementHistoryContainer);

    // Render the initial (empty) measurement history table.
    renderMeasurementHistory();
}

/**
 * Renders the measurement history in a table format within the dedicated history container.
 * This function is called whenever new measurements are added to `measurementHistory`.
 */
function renderMeasurementHistory() {
    // Clear any previously rendered history to avoid duplicates.
    measurementHistoryContainer.innerHTML = '<h3>Measurement History:</h3>';

    // If no measurements have been captured yet, display a message.
    if (measurementHistory.length === 0) {
        const noData = document.createElement("p");
        noData.innerText = "No measurements captured yet when both hand and card were detected.";
        measurementHistoryContainer.appendChild(noData);
        return;
    }

    // Create a new table element for the history.
    const table = document.createElement("table");
    // Apply Bootstrap classes for styling the table.
    table.className = "table table-striped table-bordered";

    // Create the table header with card dimensions first, then hand dimensions.
    const thead = document.createElement("thead");
    thead.innerHTML = `
        <tr>
            <th>Timestamp</th>
            <th>Card Longer Side (px)</th>
            <th>Card Shorter Side (px)</th>
            <th>Dist 5 to 17 (px)</th>
            <th>Dist 5 to 17 (mm)</th>
            <th>Estimated Palm Width</th>
            <th>Dist 0 to 9 (px)</th>
            <th>Dist 0 to 9 (mm)</th>
            <th>Estimated Palm Length</th>
        </tr>
    `;
    table.appendChild(thead);

    // Create the table body.
    const tbody = document.createElement("tbody");
    // Iterate over a reversed copy of the history array to show newest first.
    [...measurementHistory].reverse().forEach(measurement => {
        const row = document.createElement("tr"); // Create a new table row for each measurement.
        row.innerHTML = `
            <td>${measurement.timestamp}</td>
            <td>${measurement.cardLongSide.toFixed(2)}</td>
            <td>${measurement.cardShortSide.toFixed(2)}</td>
            <td>${measurement.dist5to17.toFixed(2)}</td>
            <td>${measurement.dist5to17_mm ? measurement.dist5to17_mm.toFixed(2) : 'N/A'}</td>
            <td>${measurement.estimatedPalmWidth || 'N/A'}</td>
            <td>${measurement.dist0to9.toFixed(2)}</td>
            <td>${measurement.dist0to9_mm ? measurement.dist0to9_mm.toFixed(2) : 'N/A'}</td>
            <td>${measurement.estimatedPalmLength || 'N/A'}</td>
        `;
        tbody.appendChild(row); // Append the row to the table body.
    });
    table.appendChild(tbody); // Append the table body to the table.
    measurementHistoryContainer.appendChild(table); // Append the completed table to the history container.
}


/**
 * Updates the displayed current measurement values and captures historical data
 * based on hand and object detection results for each frame.
 * This function is called by the `handDetection.js` script.
 * @param {Object} handResults - The results object from the HandLandmarker model.
 * @param {Object} objectResults - The results object from the ObjectDetector model.
 * @param {number} canvasWidth - The current width of the canvas in pixels.
 * @param {number} canvasHeight - The current height of the canvas in pixels.
 */
export function updateMeasurementDisplays(handResults, objectResults, canvasWidth, canvasHeight) {
    let currentHandMeasurements = null; // Stores pixel measurements for the hand in the current frame.
    let currentCardMeasurements = null; // Stores pixel measurements for the card in the current frame.
    let pixelPerMm = null; // Stores the calculated ratio of pixels per millimeter.

    // --- Hand Measurements ---
    // Check if hand landmarks are currently detected.
    const handCurrentlyDetected = handResults && handResults.landmarks && handResults.landmarks.length > 0;
    if (handCurrentlyDetected) {
        // Get the first detected hand's landmarks.
        const landmarks = handResults.landmarks[0];

        // Ensure enough landmarks are available for the calculations (at least up to landmark 17).
        if (landmarks && landmarks.length >= 18) {
            // Get the coordinates for Landmark 5 (base of index finger) and Landmark 17 (base of pinky finger).
            const landmark5 = landmarks[5];
            const landmark17 = landmarks[17];

            // Convert normalized landmark coordinates (0-1) to pixel coordinates.
            const landmark5X_px = landmark5.x * canvasWidth;
            const landmark5Y_px = landmark5.y * canvasHeight;
            const landmark17X_px = landmark17.x * canvasWidth;
            const landmark17Y_px = landmark17.y * canvasHeight;

            // Calculate the Euclidean distance between Landmark 5 and 17 in pixels.
            const distance5To17 = Math.sqrt(
                Math.pow(landmark17X_px - landmark5X_px, 2) +
                Math.pow(landmark17Y_px - landmark5Y_px, 2)
            );

            // Get the coordinates for Landmark 0 (wrist) and Landmark 9 (base of middle finger).
            const landmark0 = landmarks[0];
            const landmark9 = landmarks[9];

            // Convert normalized landmark coordinates to pixel coordinates.
            const landmark0X_px = landmark0.x * canvasWidth;
            const landmark0Y_px = landmark0.y * canvasHeight;
            const landmark9X_px = landmark9.x * canvasWidth;
            const landmark9Y_px = landmark9.y * canvasHeight;

            // Calculate the Euclidean distance between Landmark 0 and 9 in pixels.
            const distance0To9 = Math.sqrt(
                Math.pow(landmark9X_px - landmark0X_px, 2) +
                Math.pow(landmark9Y_px - landmark0Y_px, 2)
            );

            // Store the current hand measurements in pixels.
            currentHandMeasurements = {
                dist5to17: distance5To17,
                dist0to9: distance0To9
            };
        }
    }

    // --- Card (Cell Phone) Measurements ---
    // Check if any objects (assumed to be cards/cell phones) are detected.
    const cellPhoneCurrentlyDetected = objectResults && objectResults.detections && objectResults.detections.length > 0;
    if (cellPhoneCurrentlyDetected) {
        // Get the bounding box of the first detected object (assuming only one card).
        const bbox = objectResults.detections[0].boundingBox;

        // Extract width and height of the bounding box in pixels.
        let width_px = bbox.width;
        let height_px = bbox.height;

        // Apply the card dimension compensation factor to adjust for borders/detection inaccuracies.
        width_px *= CARD_DIMENSION_COMPENSATION_FACTOR;
        height_px *= CARD_DIMENSION_COMPENSATION_FACTOR;

        // Determine the longer and shorter sides of the detected card after compensation.
        const longerSide = Math.max(width_px, height_px);
        const shorterSide = Math.min(width_px, height_px);

        // Store the current card measurements in pixels.
        currentCardMeasurements = {
            cardLongSide: longerSide,
            cardShortSide: shorterSide
        };

        // Calculate the pixel per millimeter ratio using the detected longer side of the card
        // and its known actual length. This ratio is crucial for converting other pixel measurements to mm.
        if (longerSide > 0) { // Avoid division by zero.
            pixelPerMm = longerSide / ACTUAL_CARD_LONG_SIDE_MM;
        }
    }

    // --- Capture and Save Measurements to History ---
    // Only capture and save data if both hand and card are detected in the current frame.
    if (currentHandMeasurements && currentCardMeasurements) {
        let dist5to17_mm = null;
        let dist0to9_mm = null;
        let estimatedPalmWidth = 'N/A'; // Initialize to 'N/A'
        let estimatedPalmLength = 'N/A'; // Initialize to 'N/A'

        // Perform conversions to millimeters and estimate hand sizes only if a valid pixelPerMm ratio is available.
        if (pixelPerMm !== null && pixelPerMm > 0) {
            // Convert hand distances from pixels to raw millimeters.
            const rawDist5to17_mm = currentHandMeasurements.dist5to17 / pixelPerMm;
            const rawDist0to9_mm = currentHandMeasurements.dist0to9 / pixelPerMm;

            // Apply compensation factors to the raw millimeter measurements.
            dist5to17_mm = rawDist5to17_mm * PALM_WIDTH_COMPENSATION_FACTOR;
            dist0to9_mm = rawDist0to9_mm * PALM_LENGTH_COMPENSATION_FACTOR;

            // --- Estimate Palm Width ---
            // Classify palm width based on the compensated (Landmark 5 to 17) distance in millimeters.
            if (dist5to17_mm < 80) {
                estimatedPalmWidth = "Small";
            } else if (dist5to17_mm >= 80 && dist5to17_mm < 90) {
                estimatedPalmWidth = "Medium";
            } else { // dist5to17_mm >= 90
                estimatedPalmWidth = "Large";
            }

            // --- Estimate Palm Length ---
            // Classify palm length based on the compensated (Landmark 0 to 9) distance in millimeters.
            if (dist0to9_mm < 80) {
                estimatedPalmLength = "Small";
            } else if (dist0to9_mm >= 80 && dist0to9_mm < 100) {
                estimatedPalmLength = "Medium";
            } else { // dist0to9_mm >= 100
                estimatedPalmLength = "Large";
            }
        }

        // Get the current timestamp for the historical record.
        const timestamp = new Date().toLocaleTimeString(); // You could use toLocaleString() for date and time.

        // Push the complete set of measurements (pixel, mm, and estimated sizes) to the history array.
        measurementHistory.push({
            timestamp: timestamp,
            dist5to17: currentHandMeasurements.dist5to17,
            dist5to17_mm: dist5to17_mm,
            estimatedPalmWidth: estimatedPalmWidth,
            dist0to9: currentHandMeasurements.dist0to9,
            dist0to9_mm: dist0to9_mm,
            estimatedPalmLength: estimatedPalmLength,
            cardLongSide: currentCardMeasurements.cardLongSide,
            cardShortSide: currentCardMeasurements.cardShortSide
        });
    }

    // --- Always Update Top Display based on History ---
    // This ensures the top display persists with the last calculated average,
    // even if no new hand/card is detected in the current frame.
    if (measurementHistory.length > 0) {
        const validPalmWidths = measurementHistory.filter(m => m.dist5to17_mm !== null).map(m => m.dist5to17_mm);
        const validPalmLengths = measurementHistory.filter(m => m.dist0to9_mm !== null).map(m => m.dist0to9_mm);

        let avgPalmWidth_mm = null;
        let avgPalmLength_mm = null;
        let avgEstimatedPalmWidth = 'N/A';
        let avgEstimatedPalmLength = 'N/A';

        if (validPalmWidths.length > 0) {
            avgPalmWidth_mm = validPalmWidths.reduce((sum, val) => sum + val, 0) / validPalmWidths.length;
            if (avgPalmWidth_mm < 80) {
                avgEstimatedPalmWidth = "Small";
            } else if (avgPalmWidth_mm >= 80 && avgPalmWidth_mm < 90) {
                avgEstimatedPalmWidth = "Medium";
            } else {
                avgEstimatedPalmWidth = "Large";
            }
            currentPalmWidthDisplay.innerText = `Palm Width: ${avgPalmWidth_mm.toFixed(2)} mm (${avgEstimatedPalmWidth})`;
        } else {
            currentPalmWidthDisplay.innerText = "Palm Width: N/A (No valid measurements)";
        }

        if (validPalmLengths.length > 0) {
            avgPalmLength_mm = validPalmLengths.reduce((sum, val) => sum + val, 0) / validPalmLengths.length;
            if (avgPalmLength_mm < 80) {
                avgEstimatedPalmLength = "Small";
            } else if (avgPalmLength_mm >= 80 && avgPalmLength_mm < 100) {
                avgEstimatedPalmLength = "Medium";
            } else {
                avgEstimatedPalmLength = "Large";
            }
            currentPalmLengthDisplay.innerText = `Palm Length: ${avgPalmLength_mm.toFixed(2)} mm (${avgEstimatedPalmLength})`;
        } else {
            currentPalmLengthDisplay.innerText = "Palm Length: N/A (No valid measurements)";
        }
    } else {
        // If measurement history is empty, reset the top display to "Not detected".
        currentPalmWidthDisplay.innerText = "Palm Width: Not detected";
        currentPalmLengthDisplay.innerText = "Palm Length: Not detected";
    }

    // Re-render the history table to display the newly added entry (if any).
    renderMeasurementHistory();
}

// Automatically create the measurement display elements when the DOM is fully loaded.
document.addEventListener("DOMContentLoaded", createMeasurementDisplayElements);
