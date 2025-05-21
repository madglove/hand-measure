// app/js/measurement.js

let dist5to17Display;
let dist0to9Display;
let cardLongSideDisplay;
let cardShortSideDisplay;

/**
 * Dynamically creates and appends the measurement display elements to the main content area.
 * This function should be called once when the DOM is loaded.
 */
function createMeasurementDisplayElements() {
    const mainContent = document.getElementById("main-content");
    if (!mainContent) {
        console.error("Main content area not found to append measurement displays.");
        return;
    }

    const measurementContainer = document.createElement("div");
    measurementContainer.className = "mt-4"; // Apply Bootstrap margin-top

    const heading = document.createElement("h3");
    heading.innerText = "Measurements:";
    measurementContainer.appendChild(heading);

    dist5to17Display = document.createElement("p");
    dist5to17Display.id = "dist5to17Display";
    dist5to17Display.innerText = "Distance (Landmark 5 to 17): Not detected";
    measurementContainer.appendChild(dist5to17Display);

    dist0to9Display = document.createElement("p");
    dist0to9Display.id = "dist0to9Display";
    dist0to9Display.innerText = "Distance (Landmark 0 to 9): Not detected";
    measurementContainer.appendChild(dist0to9Display);

    cardLongSideDisplay = document.createElement("p");
    cardLongSideDisplay.id = "cardLongSideDisplay";
    cardLongSideDisplay.innerText = "Card Longer Side: Not detected";
    measurementContainer.appendChild(cardLongSideDisplay);

    cardShortSideDisplay = document.createElement("p");
    cardShortSideDisplay.id = "cardShortSideDisplay";
    cardShortSideDisplay.innerText = "Card Shorter Side: Not detected";
    measurementContainer.appendChild(cardShortSideDisplay);

    mainContent.appendChild(measurementContainer);
}

/**
 * Updates the displayed measurement values based on hand and object detection results.
 * This function will be called by handDetection.js on each frame.
 * @param {Object} handResults - The results from HandLandmarker.
 * @param {Object} objectResults - The results from ObjectDetector.
 * @param {number} canvasWidth - The current width of the canvas in pixels.
 * @param {number} canvasHeight - The current height of the canvas in pixels.
 */
export function updateMeasurementDisplays(handResults, objectResults, canvasWidth, canvasHeight) {
    // Hand Measurements
    const handCurrentlyDetected = handResults && handResults.landmarks && handResults.landmarks.length > 0;
    if (handCurrentlyDetected) {
        const landmarks = handResults.landmarks[0];

        if (landmarks && landmarks.length >= 18) { // Ensure landmark 17 exists
            // Distance between Landmark 5 (base of index finger) and Landmark 17 (base of pinky finger)
            const landmark5 = landmarks[5];
            const landmark17 = landmarks[17];

            const landmark5X_px = landmark5.x * canvasWidth;
            const landmark5Y_px = landmark5.y * canvasWidth; // Note: if Y is scaled by width too? Should be canvasHeight
            const landmark17X_px = landmark17.x * canvasWidth;
            const landmark17Y_px = landmark17.y * canvasHeight; // Corrected to use canvasHeight

            const distance5To17 = Math.sqrt(
                Math.pow(landmark17X_px - landmark5X_px, 2) +
                Math.pow(landmark17Y_px - landmark5Y_px, 2)
            );
            dist5to17Display.innerText = `Distance (Landmark 5 to 17): ${distance5To17.toFixed(2)} pixels`;

            // Distance between Landmark 0 (wrist) and Landmark 9 (base of middle finger)
            const landmark0 = landmarks[0];
            const landmark9 = landmarks[9];

            const landmark0X_px = landmark0.x * canvasWidth;
            const landmark0Y_px = landmark0.y * canvasHeight;
            const landmark9X_px = landmark9.x * canvasWidth;
            const landmark9Y_px = landmark9.y * canvasHeight;

            const distance0To9 = Math.sqrt(
                Math.pow(landmark9X_px - landmark0X_px, 2) +
                Math.pow(landmark9Y_px - landmark0Y_px, 2)
            );
            dist0to9Display.innerText = `Distance (Landmark 0 to 9): ${distance0To9.toFixed(2)} pixels`;

        } else {
            dist5to17Display.innerText = "Distance (Landmark 5 to 17): Not enough landmarks";
            dist0to9Display.innerText = "Distance (Landmark 0 to 9): Not enough landmarks";
        }
    } else {
        dist5to17Display.innerText = "Distance (Landmark 5 to 17): Not detected";
        dist0to9Display.innerText = "Distance (Landmark 0 to 9): Not detected";
    }

    // Card (Cell Phone) Measurements
    const cellPhoneCurrentlyDetected = objectResults && objectResults.detections && objectResults.detections.length > 0;
    if (cellPhoneCurrentlyDetected) {
        const bbox = objectResults.detections[0].boundingBox; // Assuming only one card

        const width_px = bbox.width;
        const height_px = bbox.height;

        const longerSide = Math.max(width_px, height_px);
        const shorterSide = Math.min(width_px, height_px);

        cardLongSideDisplay.innerText = `Card Longer Side: ${longerSide.toFixed(2)} pixels`;
        cardShortSideDisplay.innerText = `Card Shorter Side: ${shorterSide.toFixed(2)} pixels`;
    } else {
        cardLongSideDisplay.innerText = "Card Longer Side: Not detected";
        cardShortSideDisplay.innerText = "Card Shorter Side: Not detected";
    }
}

// Automatically create elements when this script is loaded
document.addEventListener("DOMContentLoaded", createMeasurementDisplayElements);

