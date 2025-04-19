// app/js/handDetection.js

import {
  HandLandmarker,
  FilesetResolver,
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
let runningMode = "VIDEO";
let enableCamButton;
let cameraSelect;
let webcamRunning = false;
let video;
let canvasElement;
let canvasCtx;
let lastVideoTime = -1;
let results = undefined;
let currentStream;
let selectedDeviceId;

async function initHandLandmarker() {
  const vision = await FilesetResolver.forVisionTasks(
      "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm"
  );
  handLandmarker = await HandLandmarker.createFromOptions(vision, {
      baseOptions: {
          modelAssetPath: "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task",
          delegate: "GPU"
      },
      runningMode: runningMode,
      numHands: 1
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
          deviceId: selectedDeviceId ? { exact: selectedDeviceId } : undefined
      }
  };

  currentStream = await navigator.mediaDevices.getUserMedia(constraints);
  video.srcObject = currentStream;

  video.addEventListener("loadeddata", predictWebcam);
}

async function predictWebcam() {
  canvasElement.style.width = `${video.videoWidth}px`;
  canvasElement.style.height = `${video.videoHeight}px`;
  canvasElement.width = video.videoWidth;
  canvasElement.height = video.videoHeight;

  if (lastVideoTime !== video.currentTime) {
      lastVideoTime = video.currentTime;
      results = handLandmarker.detectForVideo(video, performance.now());
  }

  canvasCtx.save();
  canvasCtx.clearRect(0, 0, canvasElement.width, canvasElement.height);

  if (results && results.landmarks && results.landmarks.length > 0) {
      for (const landmarks of results.landmarks) {
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
  canvasCtx.restore();

  if (webcamRunning) {
      window.requestAnimationFrame(predictWebcam);
  }
}

document.addEventListener("DOMContentLoaded", async () => {
  enableCamButton = document.getElementById("enableCam");
  cameraSelect = document.getElementById("cameraSelect");

  await initHandLandmarker();
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
