// app/js/handDetection.js

import {
  HandLandmarker,
  FilesetResolver,
  ObjectDetector
} from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest";

// Import the measurement update function from the new file
import { updateMeasurementDisplays } from "./measurement.js";

// Hand connections for drawing landmarks on the canvas.
const HAND_CONNECTIONS = [
  [0, 1], [1, 2], [2, 3], [3, 4], // Thumb
  [0, 5], [5, 6], [6, 7], [7, 8], // Index finger
  [5, 9], [9, 10], [10, 11], [11, 12], // Middle finger
  [9, 13], [13, 14], [14, 15], [15, 16], // Ring finger
  [13, 17], [17, 18], [18, 19], [19, 20], // Pinky finger
  [0, 17] // Palm base connection
];

// Global variables for MediaPipe models and application state.
let handLandmarker;
let objectDetector;
let runningMode = "VIDEO"; // Set MediaPipe running mode to video for continuous detection.
let enableCamButton; // Reference to the main "Enable/Disable Camera" button.
let cameraSelect; // Reference to the camera selection dropdown.
let webcamRunning = false; // Boolean to track if the webcam is active.
let video; // Reference to the video HTML element.
let canvasElement; // Reference to the canvas HTML element.
let canvasCtx; // 2D rendering context of the canvas.
let lastVideoTime = -1; // Stores the last video timestamp to prevent redundant processing.
let handResults = undefined; // Stores the latest hand detection results.
let objectResults = undefined; // Stores the latest object detection results.
let currentStream; // Stores the current MediaStream from the webcam.
let selectedDeviceId; // Stores the device ID of the currently selected camera.

// Variables to track last detected states for console output, preventing spam.
let lastHandDetectedState = false;
let lastCellPhoneDetectedState = false;

// Global variable for frame skipping to optimize performance.
let frameCount = 0;
const frameSkipInterval = 2; // Process every 2nd frame (adjust for more/less smooth detection).

/**
 * Initializes the MediaPipe HandLandmarker and ObjectDetector models.
 * This function is asynchronous as model loading can take time.
 */
async function initModels() {
  // Resolve the necessary WASM files for MediaPipe tasks.
  const vision = await FilesetResolver.forVisionTasks(
    "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm"
  );

  // Initialize HandLandmarker with specified options.
  handLandmarker = await HandLandmarker.createFromOptions(vision, {
    baseOptions: {
      modelAssetPath: "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task",
      delegate: "GPU" // Use GPU for faster inference if available.
    },
    runningMode: runningMode, // Set to "VIDEO" for live stream processing.
    numHands: 1, // Detects a maximum of 1 hand.
    minDetectionConfidence: 0.7, // Minimum confidence score for a hand detection to be considered valid.
    minTrackingConfidence: 0.7   // Minimum confidence score for hand tracking to be considered valid.
  });

  // Initialize ObjectDetector with specified options.
  objectDetector = await ObjectDetector.createFromOptions(vision, {
    baseOptions: {
      modelAssetPath: `https://storage.googleapis.com/mediapipe-tasks/object_detector/efficientdet_lite0_uint8.tflite` // Model for object detection.
    },
    runningMode: runningMode, // Set to "VIDEO" for live stream processing.
    scoreThreshold: 0.5, // Minimum confidence score for an object detection to be considered valid.
    categoryAllowlist: ["cell phone"] // Only detect "cell phone" category.
  });
}

/**
 * Populates the cameraSelect dropdown with available video input devices.
 */
async function populateCameraList() {
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    const videoDevices = devices.filter(device => device.kind === "videoinput");

    cameraSelect.innerHTML = ""; // Clear existing options.
    if (videoDevices.length === 0) {
        const option = document.createElement("option");
        option.value = "";
        option.text = "No cameras found";
        cameraSelect.appendChild(option);
        cameraSelect.disabled = true; // Disable dropdown if no cameras.
        enableCamButton.disabled = true; // Disable enable button.
        displayMessageBox("No camera devices found. Please connect a camera.");
        return;
    }

    cameraSelect.disabled = false; // Enable dropdown.
    enableCamButton.disabled = false; // Enable enable button.

    videoDevices.forEach((device, index) => {
      const option = document.createElement("option");
      option.value = device.deviceId;
      option.text = device.label || `Camera ${index + 1}`;
      cameraSelect.appendChild(option);
    });

    // Set the initial selected device to the first one found.
    if (videoDevices.length > 0) {
      selectedDeviceId = videoDevices[0].deviceId;
      cameraSelect.value = selectedDeviceId; // Ensure the dropdown reflects the selection.
    }
  } catch (error) {
    console.error("Error enumerating media devices:", error);
    displayMessageBox("Error accessing camera devices. Please check permissions.");
    cameraSelect.innerHTML = "<option value=''>Error loading cameras</option>";
    cameraSelect.disabled = true;
    enableCamButton.disabled = true;
  }
}

/**
 * Sets up the camera stream using `getUserMedia` and starts the prediction loop.
 * It uses the device ID from `selectedDeviceId`.
 */
async function setupCamera() {
  // Stop any existing camera stream.
  if (currentStream) {
    currentStream.getTracks().forEach(track => track.stop());
  }

  // Get references to video and canvas elements.
  video = document.getElementById("webcam");
  canvasElement = document.getElementById("output_canvas");
  canvasCtx = canvasElement.getContext("2d");

  // If no device is selected, display an error and exit.
  if (!selectedDeviceId) {
    console.error("No camera selected.");
    displayMessageBox("Please select a camera from the dropdown.");
    webcamRunning = false;
    enableCamButton.innerText = "Enable Camera";
    video.style.display = "none";
    canvasElement.style.display = "none";
    return;
  }

  // Define video constraints for `getUserMedia`.
  const constraints = {
    video: {
      deviceId: { exact: selectedDeviceId }, // Use the exact device ID for the selected camera.
      width: { ideal: 640 }, // Request ideal width for performance.
      height: { ideal: 480 } // Request ideal height for performance.
    }
  };

  try {
    // Request access to the user's media devices.
    currentStream = await navigator.mediaDevices.getUserMedia(constraints);
    video.srcObject = currentStream; // Set the video source to the obtained stream.

    // Add an event listener to start prediction once video metadata is loaded.
    // `once: true` ensures the listener is called only once.
    video.addEventListener("loadeddata", predictWebcam, { once: true });

    // Show video and canvas elements.
    video.style.display = "block";
    canvasElement.style.display = "block";

    webcamRunning = true; // Update webcam running state.
    enableCamButton.innerText = "Disable Camera"; // Update the main button text.
  } catch (error) {
    // Handle errors during camera access.
    console.error("Error accessing camera:", error);
    const errorMessage = "Could not access the camera. Please ensure it's connected and permissions are granted.";
    displayMessageBox(errorMessage); // Display a user-friendly error message.

    // Reset application state if camera access fails.
    webcamRunning = false;
    enableCamButton.innerText = "Enable Camera";
    video.style.display = "none";
    canvasElement.style.display = "none";
  }
}

/**
 * Performs hand and object detection on the video feed and updates the canvas.
 * This function is called repeatedly via `requestAnimationFrame`.
 */
async function predictWebcam() {
  // Set canvas dimensions to match the video feed.
  canvasElement.style.width = `${video.videoWidth}px`;
  canvasElement.style.height = `${video.videoHeight}px`;
  canvasElement.width = video.videoWidth;
  canvasElement.height = video.videoHeight;

  // Only process a new frame if the video time has changed.
  if (lastVideoTime !== video.currentTime) {
    lastVideoTime = video.currentTime;

    frameCount++;
    // Only run detection models on a subset of frames for performance optimization.
    if (frameCount % frameSkipInterval === 0) {
        // Perform hand and object detection.
        handResults = handLandmarker.detectForVideo(video, performance.now());
        objectResults = objectDetector.detectForVideo(video, performance.now());

        // --- Console Output Logic ---
        const handCurrentlyDetected = handResults && handResults.landmarks && handResults.landmarks.length > 0;
        const cellPhoneCurrentlyDetected = objectResults && objectResults.detections && objectResults.detections.length > 0;

        // Log "Hand detected" only when a hand first appears or disappears.
        if (handCurrentlyDetected && !lastHandDetectedState) {
            console.log("Hand detected");
        } else if (!handCurrentlyDetected && lastHandDetectedState) {
            console.log("Hand not detected");
        }
        lastHandDetectedState = handCurrentlyDetected; // Update state for next frame.

        // Log "Cell phone detected" only when a cell phone first appears or disappears.
        if (cellPhoneCurrentlyDetected && !lastCellPhoneDetectedState) {
            console.log("Cell phone detected");
        } else if (!cellPhoneCurrentlyDetected && lastCellPhoneDetectedState) {
            console.log("Cell phone not detected");
        }
        lastCellPhoneDetectedState = cellPhoneCurrentlyDetected; // Update state for next frame.
        // --- End Console Output Logic ---

        // Call the measurement update function from `measurement.js` to display results.
        updateMeasurementDisplays(handResults, objectResults, canvasElement.width, canvasElement.height);
    }
  }

  // Clear the canvas before drawing new results.
  canvasCtx.save();
  canvasCtx.clearRect(0, 0, canvasElement.width, canvasElement.height);

  // Draw hand landmarks on the canvas.
  if (handResults && handResults.landmarks && handResults.landmarks.length > 0) {
    for (const landmarks of handResults.landmarks) {
      drawConnectors(canvasCtx, landmarks, HAND_CONNECTIONS, {
        color: "lime",
        lineWidth: 2,
      });

      drawLandmarks(canvasCtx, landmarks, {
        color: "red",
        lineWidth: 3,
      });
    }
  }

  // Draw object detection results (bounding boxes and labels for "cell phone")
  if (objectResults && objectResults.detections && objectResults.detections.length > 0) {
    for (const detection of objectResults.detections) {
      const bbox = detection.boundingBox;
      const categories = detection.categories;

      // Draw bounding box.
      canvasCtx.strokeStyle = "blue";
      canvasCtx.lineWidth = 2;
      canvasCtx.strokeRect(bbox.originX, bbox.originY, bbox.width, bbox.height);

      // Draw label (category name and confidence score).
      if (categories && categories.length > 0) {
        const category = categories[0];
        // Changed the label text from category.categoryName to "Card"
        const label = `Card (${(category.score * 100).toFixed(1)}%)`;
        canvasCtx.fillStyle = "blue";
        canvasCtx.font = "16px Arial";
        // Position the text slightly above the bounding box.
        canvasCtx.fillText(label, bbox.originX, bbox.originY > 10 ? bbox.originY - 5 : 10);
      }
    }
  }

  canvasCtx.restore(); // Restore canvas state.

  // Continue the prediction loop if webcam is still running.
  if (webcamRunning) {
    window.requestAnimationFrame(predictWebcam);
  }
}

/**
 * Displays a custom message box to the user.
 * @param {string} message - The message to display.
 */
function displayMessageBox(message) {
    const messageBox = document.createElement('div');
    messageBox.style.cssText = `
        position: fixed;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        background-color: #f8d7da;
        color: #721c24;
        border: 1px solid #f5c6cb;
        padding: 15px;
        border-radius: 5px;
        z-index: 1000;
        font-family: sans-serif;
        box-shadow: 0 4px 8px rgba(0,0,0,0.2);
    `;
    messageBox.textContent = message;
    document.body.appendChild(messageBox);
    // Remove the message box after 5 seconds.
    setTimeout(() => {
        if (document.body.contains(messageBox)) { // Check if element still exists before attempting to remove
            document.body.removeChild(messageBox);
        }
    }, 5000);
}

// Event listener for when the DOM is fully loaded.
document.addEventListener("DOMContentLoaded", async () => {
  // Get references to the main UI elements.
  enableCamButton = document.getElementById("enableCam");
  cameraSelect = document.getElementById("cameraSelect"); // Get reference to camera select dropdown.

  // Initialize MediaPipe models.
  await initModels();
  // Populate the list of available camera devices.
  await populateCameraList();

  // Set up event listener for camera selection changes.
  cameraSelect.addEventListener("change", async () => {
    selectedDeviceId = cameraSelect.value; // Update selected device ID.
    if (webcamRunning) {
      // If camera is already running, switch to the newly selected camera.
      await setupCamera();
    }
  });

  // Automatically enable the camera on page load if devices are found.
  // This will use the default selected camera from populateCameraList.
  if (cameraSelect.options.length > 0 && cameraSelect.value !== "") {
    await setupCamera();
  } else {
    // If no cameras are found on load, update button state and display an error message.
    webcamRunning = false;
    enableCamButton.innerText = "Enable Camera";
  }

  // Event listener for the main "Enable/Disable Camera" button.
  enableCamButton.addEventListener("click", async () => {
    if (!webcamRunning) {
      // If camera is currently off, try to enable it.
      if (!selectedDeviceId) {
        // If no camera is selected, try to repopulate the list in case devices were connected.
        await populateCameraList();
        if (!selectedDeviceId) {
          displayMessageBox("No camera selected or found. Cannot enable camera.");
          return;
        }
      }
      await setupCamera(); // Setup and start the camera.
    } else {
      // If camera is currently on, disable it.
      webcamRunning = false;
      enableCamButton.innerText = "Enable Camera";
      if (currentStream) {
        currentStream.getTracks().forEach(track => track.stop()); // Stop all tracks in the stream.
      }
      video.style.display = "none"; // Hide video element.
      canvasElement.style.display = "none"; // Hide canvas element.

      // Reset detection states and frame counter when camera is disabled.
      lastHandDetectedState = false;
      lastCellPhoneDetectedState = false;
      frameCount = 0;
    }
  });
});

// === DRAW FUNCTIONS ===
/**
 * Draws landmarks (points) on the canvas.
 * @param {CanvasRenderingContext2D} ctx - The 2D rendering context of the canvas.
 * @param {Array<Object>} landmarks - An array of landmark objects, each with x, y coordinates.
 * @param {Object} options - Drawing options (color, lineWidth).
 */
function drawLandmarks(ctx, landmarks, options = {}) {
  const { color = 'red', lineWidth = 3 } = options;
  ctx.fillStyle = color;
  for (const landmark of landmarks) {
    ctx.beginPath();
    // Draw a circle for each landmark.
    ctx.arc(landmark.x * canvasElement.width, landmark.y * canvasElement.height, lineWidth, 0, 2 * Math.PI);
    ctx.fill();
  }
}

/**
 * Draws connectors (lines) between specified landmarks on the canvas.
 * @param {CanvasRenderingContext2D} ctx - The 2D rendering context of the canvas.
 * @param {Array<Object>} landmarks - An array of landmark objects.
 * @param {Array<Array<number>>} connections - An array of [startIdx, endIdx] pairs defining connections.
 * @param {Object} options - Drawing options (color, lineWidth).
 */
function drawConnectors(ctx, landmarks, connections, options = {}) {
  const { color = 'lime', lineWidth = 2 } = options;
  ctx.strokeStyle = color;
  ctx.lineWidth = lineWidth;
  for (const [startIdx, endIdx] of connections) {
    const start = landmarks[startIdx];
    const end = landmarks[endIdx];
    ctx.beginPath();
    ctx.moveTo(start.x * canvasElement.width, start.y * canvasElement.height);
    ctx.lineTo(end.x * canvasElement.width, end.y * canvasElement.height);
    ctx.stroke();
  }
}
