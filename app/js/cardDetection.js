// cardDetection.js

console.log("🧩 Card Detection Script Loaded!");

let video = document.getElementById('webcam');
let canvas = document.createElement('canvas');
let ctx = canvas.getContext('2d');

let processingCard = false;

function detectCard() {
    if (!cv || !cv.Mat) {
        console.error("❌ OpenCV.js not loaded yet!");
        return;
    }
    if (!video.videoWidth || !video.videoHeight) {
        console.warn("⚠️ Video not ready yet...");
        return;
    }

    if (processingCard) return;
    processingCard = true;

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    let src = cv.imread(canvas);
    let dst = new cv.Mat();
    let gray = new cv.Mat();
    let blur = new cv.Mat();
    let edges = new cv.Mat();
    let contours = new cv.MatVector();
    let hierarchy = new cv.Mat();

    try {
        cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY, 0);
        cv.GaussianBlur(gray, blur, new cv.Size(5, 5), 0, 0, cv.BORDER_DEFAULT);
        cv.Canny(blur, edges, 75, 200);

        cv.findContours(edges, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);

        let maxArea = 0;
        let bestContour = null;

        for (let i = 0; i < contours.size(); ++i) {
            let cnt = contours.get(i);
            let peri = cv.arcLength(cnt, true);
            let approx = new cv.Mat();
            cv.approxPolyDP(cnt, approx, 0.02 * peri, true);

            if (approx.rows === 4) { // Looks like a rectangle
                let area = cv.contourArea(cnt);
                if (area > maxArea) {
                    maxArea = area;
                    bestContour = approx;
                }
            }
        }

        if (bestContour) {
            console.log("✅ Card detected!");
            drawCardOutline(bestContour);
        } else {
            console.log("❌ No card found.");
        }

    } catch (err) {
        console.error("🔥 OpenCV Error:", err);
    } finally {
        src.delete(); dst.delete(); gray.delete(); blur.delete(); edges.delete();
        contours.delete(); hierarchy.delete();
        processingCard = false;
    }
}

function drawCardOutline(approx) {
    let overlay = document.getElementById('card-overlay');
    if (!overlay) {
        overlay = document.createElement('canvas');
        overlay.id = 'card-overlay';
        overlay.style.position = 'absolute';
        overlay.style.top = '0';
        overlay.style.left = '0';
        overlay.style.width = '100%';
        overlay.style.height = '100%';
        overlay.style.pointerEvents = 'none';
        document.getElementById('main-content').appendChild(overlay);
    }

    overlay.width = video.videoWidth;
    overlay.height = video.videoHeight;
    let ctxOverlay = overlay.getContext('2d');

    ctxOverlay.clearRect(0, 0, overlay.width, overlay.height);
    ctxOverlay.strokeStyle = 'lime';
    ctxOverlay.lineWidth = 4;

    ctxOverlay.beginPath();
    for (let i = 0; i < 4; i++) {
        let start = approx.data32S[i * 2];
        let startY = approx.data32S[i * 2 + 1];
        let end = approx.data32S[((i + 1) % 4) * 2];
        let endY = approx.data32S[((i + 1) % 4) * 2 + 1];
        ctxOverlay.moveTo(start, startY);
        ctxOverlay.lineTo(end, endY);
    }
    ctxOverlay.closePath();
    ctxOverlay.stroke();
}

// 🔥 Start automatic card detection every 1000ms
let cardDetectionInterval = setInterval(detectCard, 1000);
