// app/js/handDetection.js

import {
  HandLandmarker,
  FilesetResolver,
  ObjectDetector
} from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest";

// Hand connections
const HAND_CONNECTIONS = [
  [0, 1], [1, 2], [2, 3], [3, 4],
  [0, 5], [5, 6], [6, 7], [7, 8],
  [5, 9], [9, 10], [10, 11], [11, 12],
  [9, 13], [13, 14], [14, 15], [15, 16],
  [13, 17], [17, 18], [18, 19], [19, 20],
  [0, 17]
];

let handLandmarker;
let objectDetector;
let runningMode = "VIDEO";
let enableCamButton;
let cameraSelect;
let webcamRunning = false;
let video;
let canvasElement;
let canvasCtx;
let lastVideoTime = -1;
let handResults = undefined;
let objectResults = undefined;
let currentStream;
let selectedDeviceId;

// Variables to track last detected states for console output
let lastHandDetectedState = false;
let lastCellPhoneDetectedState = false;

// Global variable for frame skipping to optimize performance
let frameCount = 0;
const frameSkipInterval = 2; // Process every 2nd frame (adjust for more/less speed)

async function initModels() {
  const vision = await FilesetResolver.forVisionTasks(
    "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm"
  );

  // Initialize HandLandmarker with GPU delegate and confidence thresholds
  handLandmarker = await HandLandmarker.createFromOptions(vision, {
    baseOptions: {
      modelAssetPath: "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task",
      delegate: "GPU"
    },
    runningMode: runningMode,
    numHands: 1,
    minDetectionConfidence: 0.7, // Increased confidence for hand detection
    minTrackingConfidence: 0.7   // Increased confidence for hand tracking
  });

  // Initialize ObjectDetector with the uint8 model and scoreThreshold 0.5
  objectDetector = await ObjectDetector.createFromOptions(vision, {
    baseOptions: {
      modelAssetPath: `https://storage.googleapis.com/mediapipe-tasks/object_detector/efficientdet_lite0_uint8.tflite` // Reverted to uint8 model
    },
    runningMode: runningMode,
    scoreThreshold: 0.5, // Retained 0.5 for better "cell phone" detection
    categoryAllowlist: ["cell phone"]
  });
}

async function populateCameraList() {
  const devices = await navigator.mediaDevices.enumerateDevices();
  const videoDevices = devices.filter(device => device.kind === "videoinput");

  cameraSelect.innerHTML = "";
  videoDevices.forEach((device, index) => {
    const option = document.createElement("option");
    option.value = device.deviceId;
    option.text = device.label || `Camera ${index + 1}`;
    cameraSelect.appendChild(option);
  });

  if (videoDevices.length > 0) {
    selectedDeviceId = videoDevices[0].deviceId;
  }
}

async function setupCamera() {
  if (currentStream) {
    currentStream.getTracks().forEach(track => track.stop());
  }

  video = document.getElementById("webcam");
  canvasElement = document.getElementById("output_canvas");
  canvasCtx = canvasElement.getContext("2d");

  const constraints = {
    video: {
      deviceId: selectedDeviceId ? { exact: selectedDeviceId } : undefined,
      width: { ideal: 640 }, // Explicitly request 640p width for performance
      height: { ideal: 480 }  // Explicitly request 480p height for performance
    }
  };

  try {
    currentStream = await navigator.mediaDevices.getUserMedia(constraints);
    video.srcObject = currentStream;

    video.addEventListener("loadeddata", predictWebcam);
  } catch (error) {
    console.error("Error accessing camera:", error);
    // Use a custom message box instead of alert()
    const errorMessage = "Could not access the camera. Please ensure it's connected and permissions are granted.";
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
    messageBox.textContent = errorMessage;
    document.body.appendChild(messageBox);
    setTimeout(() => {
      document.body.removeChild(messageBox);
    }, 5000); // Remove message after 5 seconds

    webcamRunning = false;
    enableCamButton.innerText = "Enable Camera";
    video.style.display = "none";
    canvasElement.style.display = "none";
  }
}

async function predictWebcam() {
  canvasElement.style.width = `${video.videoWidth}px`;
  canvasElement.style.height = `${video.videoHeight}px`;
  canvasElement.width = video.videoWidth;
  canvasElement.height = video.videoHeight;

  if (lastVideoTime !== video.currentTime) {
    lastVideoTime = video.currentTime;

    frameCount++;
    // Only run detection models on a subset of frames for performance
    if (frameCount % frameSkipInterval === 0) {
        handResults = handLandmarker.detectForVideo(video, performance.now());
        objectResults = objectDetector.detectForVideo(video, performance.now()); // Perform object detection

        // --- Console Output Logic ---
        const handCurrentlyDetected = handResults && handResults.landmarks && handResults.landmarks.length > 0;
        const cellPhoneCurrentlyDetected = objectResults && objectResults.detections && objectResults.detections.length > 0;

        // Log "Hand detected" only when a hand first appears
        if (handCurrentlyDetected && !lastHandDetectedState) {
            console.log("Hand detected");
        } else if (!handCurrentlyDetected && lastHandDetectedState) {
            console.log("Hand not detected");
        }
        lastHandDetectedState = handCurrentlyDetected; // Update state for next frame

        // Log "Cell phone detected" only when a cell phone first appears
        if (cellPhoneCurrentlyDetected && !lastCellPhoneDetectedState) {
            console.log("Cell phone detected");
        } else if (!cellPhoneCurrentlyDetected && lastCellPhoneDetectedState) {
            console.log("Cell phone not detected");
        }
        lastCellPhoneDetectedState = cellPhoneCurrentlyDetected; // Update state for next frame
        // --- End Console Output Logic ---

        // --- Conditional Measurement Logging (only when BOTH hand and cell phone are detected) ---
        if (handCurrentlyDetected && cellPhoneCurrentlyDetected) {
            const landmarks = handResults.landmarks[0]; // Assuming only one hand is detected (numHands: 1)
            const bbox = objectResults.detections[0].boundingBox; // Assuming only one cell phone is detected

            // Check if enough hand landmarks are available for calculations (at least landmark 17)
            if (landmarks && landmarks.length >= 18) {

                // Distance between Landmark 5 (base of index finger) and Landmark 17 (base of pinky finger)
                const landmark5 = landmarks[5];
                const landmark17 = landmarks[17];

                // Convert normalized coordinates to pixel coordinates
                const landmark5X_px = landmark5.x * canvasElement.width;
                const landmark5Y_px = landmark5.y * canvasElement.height;
                const landmark17X_px = landmark17.x * canvasElement.width;
                const landmark17Y_px = landmark17.y * canvasElement.height;

                const distance5To17 = Math.sqrt(
                    Math.pow(landmark17X_px - landmark5X_px, 2) +
                    Math.pow(landmark17Y_px - landmark5Y_px, 2)
                );
                console.log(`MEASUREMENT: Hand (5 to 17): ${distance5To17.toFixed(2)} pixels`);


                // Distance between Landmark 0 (wrist) and Landmark 9 (base of middle finger)
                const landmark0 = landmarks[0]; // Wrist
                const landmark9 = landmarks[9]; // Base of middle finger

                const landmark0X_px = landmark0.x * canvasElement.width;
                const landmark0Y_px = landmark0.y * canvasElement.height;
                const landmark9X_px = landmark9.x * canvasElement.width;
                const landmark9Y_px = landmark9.y * canvasElement.height;

                const distance0To9 = Math.sqrt(
                    Math.pow(landmark9X_px - landmark0X_px, 2) +
                    Math.pow(landmark9Y_px - landmark0Y_px, 2)
                );
                console.log(`MEASUREMENT: Hand (0 to 9): ${distance0To9.toFixed(2)} pixels`);

            } else {
                console.log("MEASUREMENT: Not enough hand landmarks for calculations.");
            }

            // Cell phone (card) bounding box dimensions
            const width_px = bbox.width;
            const height_px = bbox.height;

            const longerSide = Math.max(width_px, height_px);
            const shorterSide = Math.min(width_px, height_px);

            console.log(`MEASUREMENT: Cell Phone Longer Side: ${longerSide.toFixed(2)} pixels`);
            console.log(`MEASUREMENT: Cell Phone Shorter Side: ${shorterSide.toFixed(2)} pixels`);
        }
        // --- End Conditional Measurement Logging ---
    }
  }

  canvasCtx.save();
  canvasCtx.clearRect(0, 0, canvasElement.width, canvasElement.height);

  // Draw hand landmarks
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

  // Draw object detection results (only "cell phone" will be drawn due to categoryAllowlist)
  if (objectResults && objectResults.detections && objectResults.detections.length > 0) {
    for (const detection of objectResults.detections) {
      const bbox = detection.boundingBox;
      const categories = detection.categories;

      // Draw bounding box
      canvasCtx.strokeStyle = "blue";
      canvasCtx.lineWidth = 2;
      canvasCtx.strokeRect(bbox.originX, bbox.originY, bbox.width, bbox.height);

      // Draw label
      if (categories && categories.length > 0) {
        const category = categories[0];
        const label = `${category.categoryName} (${(category.score * 100).toFixed(1)}%)`;
        canvasCtx.fillStyle = "blue";
        canvasCtx.font = "16px Arial";
        canvasCtx.fillText(label, bbox.originX, bbox.originY > 10 ? bbox.originY - 5 : 10);
      }
    }
  }

  canvasCtx.restore();

  if (webcamRunning) {
    window.requestAnimationFrame(predictWebcam);
  }
}

document.addEventListener("DOMContentLoaded", async () => {
  enableCamButton = document.getElementById("enableCam");
  cameraSelect = document.getElementById("cameraSelect");

  await initModels(); // Initialize both models
  await populateCameraList();

  cameraSelect.addEventListener("change", async () => {
    selectedDeviceId = cameraSelect.value;
    if (webcamRunning) {
      await setupCamera();
    }
  });

  enableCamButton.addEventListener("click", async () => {
    if (!webcamRunning) {
      webcamRunning = true;
      enableCamButton.innerText = "Disable Camera";
      await setupCamera();
      video.style.display = "block";
      canvasElement.style.display = "block";
    } else {
      webcamRunning = false;
      enableCamButton.innerText = "Enable Camera";
      if (video.srcObject) {
        video.srcObject.getTracks().forEach(track => track.stop());
      }
      video.style.display = "none";
      canvasElement.style.display = "none";

      // Reset detection states when camera is disabled
      lastHandDetectedState = false;
      lastCellPhoneDetectedState = false;
      frameCount = 0; // Reset frame counter
    }
  });
});

// === DRAW FUNCTIONS ===
function drawLandmarks(ctx, landmarks, options = {}) {
  const { color = 'red', lineWidth = 3 } = options;
  ctx.fillStyle = color;
  for (const landmark of landmarks) {
    ctx.beginPath();
    ctx.arc(landmark.x * canvasElement.width, landmark.y * canvasElement.height, lineWidth, 0, 2 * Math.PI);
    ctx.fill();
  }
}

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
