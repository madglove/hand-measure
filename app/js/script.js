import {
    HandLandmarker,
    FilesetResolver
} from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.0";
import {
    DrawingUtils
} from "https://cdn.jsdelivr.net/npm/@mediapipe/drawing_utils/drawing_utils.js";

// Access HAND_CONNECTIONS globally available from the <script> tag in HTML
// import { HAND_CONNECTIONS } from "https://cdn.jsdelivr.net/npm/@mediapipe/hands";

const imageContainers = document.querySelectorAll("#image-demos .position-relative img");
const webcamButton = document.getElementById("webcamButton");
const video = document.getElementById("webcam");
const canvasElementWebcam = document.getElementById("output_canvas_webcam");
const canvasCtxWebcam = canvasElementWebcam.getContext("2d");

let handLandmarker = undefined;
let runningMode = "IMAGE";
let webcamRunning = false;

// Initialize the DrawingUtils for drawing the landmarks.
const drawingUtils = new DrawingUtils(canvasCtxWebcam);

const createHandLandmarker = async () => {
    const vision = await FilesetResolver.forVisionTasks(
        "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.0/wasm"
    );
    handLandmarker = await HandLandmarker.createFromOptions(vision, {
        baseOptions: {
            modelAssetPath: `https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task`,
            delegate: "GPU"
        },
        runningMode: runningMode,
        numHands: 2
    });
    console.log("Hand Landmarker loaded!");
};
createHandLandmarker();

async function detectHands(event) {
    if (!handLandmarker) {
        console.log("Wait for handLandmarker to load before clicking!");
        return;
    }

    const image = event.target;
    const canvasId = image.nextElementSibling.id;
    const canvas = document.getElementById(canvasId);
    const canvasCtx = canvas.getContext("2d");

    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    canvas.style.width = image.width + "px";
    canvas.style.height = image.height + "px";

    const handLandmarkerResult = handLandmarker.detect(image);

    canvasCtx.clearRect(0, 0, canvas.width, canvas.height);
    if (handLandmarkerResult.landmarks) {
        for (const landmarks of handLandmarkerResult.landmarks) {
            drawingUtils.drawConnectors(canvasCtx, landmarks, HAND_CONNECTIONS, {
                color: "#00FF00",
                lineWidth: 5
            });
            drawingUtils.drawLandmarks(canvasCtx, landmarks, {
                color: "#FF0000",
                lineWidth: 2
            });
        }
    }
}

const hasGetUserMedia = () => !!navigator.mediaDevices?.getUserMedia;

if (hasGetUserMedia()) {
    webcamButton.addEventListener("click", enableCam);
} else {
    console.warn("getUserMedia() is not supported by your browser");
}

function enableCam() {
    if (!handLandmarker) {
        console.log("Wait! Hand Landmarker not loaded yet.");
        return;
    }

    if (runningMode === "IMAGE") {
        runningMode = "VIDEO";
        handLandmarker.setOptions({ runningMode: "VIDEO" });
    }

    if (webcamRunning) {
        webcamRunning = false;
        webcamButton.innerText = "Enable Webcam";
        const stream = video.srcObject as MediaStream;
        if (stream) {
            stream.getTracks().forEach(track => track.stop());
        }
        video.srcObject = null;
    } else {
        webcamRunning = true;
        webcamButton.innerText = "Disable Webcam";
        navigator.mediaDevices.getUserMedia({ video: true })
            .then((stream) => {
                video.srcObject = stream;
                video.addEventListener("loadeddata", predictWebcam);
            })
            .catch((error) => {
                console.error("Error accessing webcam:", error);
            });
    }
}

let lastVideoTime = -1;
async function predictWebcam() {
    if (!webcamRunning) return; // Stop if webcam is not running

    canvasElementWebcam.width = video.videoWidth;
    canvasElementWebcam.height = video.videoHeight;
    canvasCtxWebcam.clearRect(0, 0, canvasElementWebcam.width, canvasElementWebcam.height);

    if (handLandmarker && video.readyState >= 2) {
        const nowInMs = Date.now();
        const results = handLandmarker.detectForVideo(video, nowInMs);

        if (results.landmarks) {
            for (const landmarks of results.landmarks) {
                drawingUtils.drawConnectors(canvasCtxWebcam, landmarks, HAND_CONNECTIONS, {
                    color: "#00FF00",
                    lineWidth: 5
                });
                drawingUtils.drawLandmarks(canvasCtxWebcam, landmarks, {
                    color: "#FF0000",
                    lineWidth: 2
                });
            }
        }
    }

    window.requestAnimationFrame(predictWebcam);
}