/**
 * Card detection algorithm for counting red and white cards in audience photos.
 *
 * Approach:
 * 1. Downscale image for performance
 * 2. Convert to HSV and classify each pixel as "red card", "white card", or "background"
 * 3. Run connected-component labeling on card pixels
 * 4. Filter blobs by size (too small = noise, too large = wall/ceiling)
 * 5. Classify each blob as red or white by majority pixel vote
 * 6. Return counts and annotated image
 */

export interface DetectionResult {
  redCount: number;
  whiteCount: number;
  totalCount: number;
  annotatedImageDataUrl: string;
  blobs: BlobInfo[];
}

export interface BlobInfo {
  id: number;
  color: "red" | "white";
  cx: number;
  cy: number;
  size: number;
  bbox: { x: number; y: number; w: number; h: number };
}

interface HSV {
  h: number; // 0-360
  s: number; // 0-1
  v: number; // 0-1
}

function rgbToHsv(r: number, g: number, b: number): HSV {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  let h = 0;
  const s = max === 0 ? 0 : d / max;
  const v = max;

  if (d !== 0) {
    if (max === r) {
      h = ((g - b) / d + (g < b ? 6 : 0)) * 60;
    } else if (max === g) {
      h = ((b - r) / d + 2) * 60;
    } else {
      h = ((r - g) / d + 4) * 60;
    }
  }

  return { h, s, v };
}

type PixelClass = 0 | 1 | 2; // 0=background, 1=white, 2=red

function classifyPixel(r: number, g: number, b: number): PixelClass {
  const hsv = rgbToHsv(r, g, b);

  // Red detection: red hue wraps around 0/360
  // Red cards: hue near 0 or near 360, moderate+ saturation, moderate+ brightness
  const isRedHue =
    (hsv.h <= 25 || hsv.h >= 335) ||
    // Also catch pinkish-reds and orangish-reds under theater lighting
    (hsv.h >= 335 && hsv.h <= 360) ||
    (hsv.h >= 0 && hsv.h <= 25);

  if (isRedHue && hsv.s >= 0.25 && hsv.v >= 0.25) {
    // Ensure it's actually reddish - check raw RGB dominance
    if (r > g * 1.2 && r > b * 1.1 && r >= 80) {
      return 2; // red
    }
  }

  // Reject light sources: extremely bright and desaturated pixels are lights, not cards
  if (hsv.v > 0.95 && hsv.s < 0.08) {
    return 0; // light source, not a card
  }
  // Also reject if all channels are very close to max (glowing light)
  if (r > 240 && g > 240 && b > 240) {
    return 0; // light source
  }

  // White detection: low saturation, high brightness
  // White cards under various lighting appear as bright, desaturated pixels
  if (hsv.s <= 0.20 && hsv.v >= 0.70 && hsv.v <= 0.95) {
    // Additional check: all channels should be relatively high and similar
    const avg = (r + g + b) / 3;
    if (avg >= 170 && avg <= 235 && Math.max(r, g, b) - Math.min(r, g, b) < 60) {
      return 1; // white
    }
  }

  // Slightly warm whites (theater lighting makes white cards yellowish)
  if (hsv.s <= 0.30 && hsv.v >= 0.75 && hsv.v <= 0.95 && hsv.h >= 20 && hsv.h <= 60) {
    const avg = (r + g + b) / 3;
    if (avg >= 180 && avg <= 235 && r >= 180 && g >= 170) {
      return 1; // white (warm-tinted)
    }
  }

  return 0; // background
}

/**
 * Union-Find for connected component labeling
 */
class UnionFind {
  parent: Int32Array;
  rank: Int32Array;

  constructor(size: number) {
    this.parent = new Int32Array(size);
    this.rank = new Int32Array(size);
    for (let i = 0; i < size; i++) {
      this.parent[i] = i;
    }
  }

  find(x: number): number {
    while (this.parent[x] !== x) {
      this.parent[x] = this.parent[this.parent[x]];
      x = this.parent[x];
    }
    return x;
  }

  union(a: number, b: number): void {
    const ra = this.find(a);
    const rb = this.find(b);
    if (ra === rb) return;
    if (this.rank[ra] < this.rank[rb]) {
      this.parent[ra] = rb;
    } else if (this.rank[ra] > this.rank[rb]) {
      this.parent[rb] = ra;
    } else {
      this.parent[rb] = ra;
      this.rank[ra]++;
    }
  }
}

export interface DetectionParams {
  /** Minimum blob size in pixels (at processing resolution) */
  minBlobSize: number;
  /** Maximum blob size in pixels (at processing resolution) */
  maxBlobSize: number;
  /** Processing width - image is scaled to this width */
  processingWidth: number;
}

const DEFAULT_PARAMS: DetectionParams = {
  minBlobSize: 20,
  maxBlobSize: 8000,
  processingWidth: 1200,
};

export function detectCards(
  imageData: ImageData,
  originalWidth: number,
  originalHeight: number,
  params: Partial<DetectionParams> = {}
): DetectionResult {
  const p = { ...DEFAULT_PARAMS, ...params };
  const { width, height, data } = imageData;

  // Step 1: Classify every pixel
  const classified = new Uint8Array(width * height);
  for (let i = 0; i < width * height; i++) {
    const idx = i * 4;
    classified[i] = classifyPixel(data[idx], data[idx + 1], data[idx + 2]);
  }

  // Step 2: Morphological closing (dilate then erode) to fill small gaps in cards
  const dilated = morphDilate(classified, width, height, 1);
  const closed = morphErode(dilated, width, height, 1);

  // Step 3: Connected component labeling (4-connectivity)
  const uf = new UnionFind(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = y * width + x;
      if (closed[idx] === 0) continue;

      // Check left neighbor
      if (x > 0) {
        const left = y * width + (x - 1);
        if (closed[left] !== 0) {
          uf.union(idx, left);
        }
      }
      // Check top neighbor
      if (y > 0) {
        const top = (y - 1) * width + x;
        if (closed[top] !== 0) {
          uf.union(idx, top);
        }
      }
      // Also check diagonal neighbors for better connectivity
      if (x > 0 && y > 0) {
        const topLeft = (y - 1) * width + (x - 1);
        if (closed[topLeft] !== 0) {
          uf.union(idx, topLeft);
        }
      }
      if (x < width - 1 && y > 0) {
        const topRight = (y - 1) * width + (x + 1);
        if (closed[topRight] !== 0) {
          uf.union(idx, topRight);
        }
      }
    }
  }

  // Step 4: Gather blob statistics
  const blobStats = new Map<
    number,
    {
      size: number;
      redPixels: number;
      whitePixels: number;
      sumX: number;
      sumY: number;
      minX: number;
      minY: number;
      maxX: number;
      maxY: number;
    }
  >();

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = y * width + x;
      if (closed[idx] === 0) continue;
      const root = uf.find(idx);
      let stats = blobStats.get(root);
      if (!stats) {
        stats = {
          size: 0,
          redPixels: 0,
          whitePixels: 0,
          sumX: 0,
          sumY: 0,
          minX: x,
          minY: y,
          maxX: x,
          maxY: y,
        };
        blobStats.set(root, stats);
      }
      stats.size++;
      // Use original (pre-morphology) classification for color voting
      if (classified[idx] === 2) stats.redPixels++;
      else if (classified[idx] === 1) stats.whitePixels++;
      stats.sumX += x;
      stats.sumY += y;
      stats.minX = Math.min(stats.minX, x);
      stats.minY = Math.min(stats.minY, y);
      stats.maxX = Math.max(stats.maxX, x);
      stats.maxY = Math.max(stats.maxY, y);
    }
  }

  // Step 5: Filter and classify blobs
  const blobs: BlobInfo[] = [];
  let redCount = 0;
  let whiteCount = 0;
  let blobId = 0;

  const scaleX = originalWidth / width;
  const scaleY = originalHeight / height;

  for (const [, stats] of blobStats) {
    if (stats.size < p.minBlobSize || stats.size > p.maxBlobSize) continue;

    // Position check - ignore blobs in the top 15% of the image (ceiling/lights area)
    const centerY = stats.sumY / stats.size;
    if (centerY < height * 0.15) continue;

    // Aspect ratio check - cards are roughly rectangular, not super elongated
    const bw = stats.maxX - stats.minX + 1;
    const bh = stats.maxY - stats.minY + 1;
    const aspect = Math.max(bw, bh) / (Math.min(bw, bh) || 1);
    if (aspect > 4.5) continue; // too elongated, probably not a card

    // Density check - cards should fill their bounding box reasonably well
    const bboxArea = bw * bh;
    const density = stats.size / bboxArea;
    if (density < 0.20) continue; // too sparse, likely not a solid card

    // Compactness check - reject very circular blobs (lights tend to be round)
    // Cards are rectangular so perimeter-to-area ratio differs from circles
    // A circle has the highest compactness (area/perimeter^2 ≈ 0.0796)
    // We approximate perimeter as bounding box perimeter
    const perimeter = 2 * (bw + bh);
    const compactness = stats.size / (perimeter * perimeter);
    // Very compact + very small blobs near the top half are likely lights
    if (compactness > 0.07 && centerY < height * 0.35 && stats.size < p.minBlobSize * 10) continue;

    const color: "red" | "white" =
      stats.redPixels > stats.whitePixels ? "red" : "white";

    if (color === "red") redCount++;
    else whiteCount++;

    blobs.push({
      id: blobId++,
      color,
      cx: Math.round((stats.sumX / stats.size) * scaleX),
      cy: Math.round((stats.sumY / stats.size) * scaleY),
      size: stats.size,
      bbox: {
        x: Math.round(stats.minX * scaleX),
        y: Math.round(stats.minY * scaleY),
        w: Math.round(bw * scaleX),
        h: Math.round(bh * scaleY),
      },
    });
  }

  // Step 6: Create annotated image
  const annotatedDataUrl = createAnnotatedImage(
    data,
    width,
    height,
    blobs,
    scaleX,
    scaleY
  );

  return {
    redCount,
    whiteCount,
    totalCount: redCount + whiteCount,
    annotatedImageDataUrl: annotatedDataUrl,
    blobs,
  };
}

function morphDilate(
  grid: Uint8Array,
  width: number,
  height: number,
  radius: number
): Uint8Array {
  const out = new Uint8Array(grid);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (grid[y * width + x] !== 0) continue;
      outer: for (let dy = -radius; dy <= radius; dy++) {
        for (let dx = -radius; dx <= radius; dx++) {
          const ny = y + dy;
          const nx = x + dx;
          if (ny >= 0 && ny < height && nx >= 0 && nx < width) {
            if (grid[ny * width + nx] !== 0) {
              out[y * width + x] = grid[ny * width + nx];
              break outer;
            }
          }
        }
      }
    }
  }
  return out;
}

function morphErode(
  grid: Uint8Array,
  width: number,
  height: number,
  radius: number
): Uint8Array {
  const out = new Uint8Array(grid);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (grid[y * width + x] === 0) continue;
      for (let dy = -radius; dy <= radius; dy++) {
        for (let dx = -radius; dx <= radius; dx++) {
          const ny = y + dy;
          const nx = x + dx;
          if (
            ny < 0 ||
            ny >= height ||
            nx < 0 ||
            nx >= width ||
            grid[ny * width + nx] === 0
          ) {
            out[y * width + x] = 0;
            break;
          }
        }
        if (out[y * width + x] === 0) break;
      }
    }
  }
  return out;
}

function createAnnotatedImage(
  originalData: Uint8ClampedArray,
  width: number,
  height: number,
  blobs: BlobInfo[],
  scaleX: number,
  scaleY: number
): string {
  const canvas = new OffscreenCanvas(width, height);
  const ctx = canvas.getContext("2d")!;

  // Draw original image
  const imgData = new ImageData(new Uint8ClampedArray(originalData), width, height);
  ctx.putImageData(imgData, 0, 0);

  // Draw blob markers
  for (const blob of blobs) {
    const bx = blob.bbox.x / scaleX;
    const by = blob.bbox.y / scaleY;
    const bw = blob.bbox.w / scaleX;
    const bh = blob.bbox.h / scaleY;

    ctx.strokeStyle = blob.color === "red" ? "#ff0000" : "#0066ff";
    ctx.lineWidth = 2;
    ctx.strokeRect(bx, by, bw, bh);

    // Label
    const cx = blob.cx / scaleX;
    const cy = blob.cy / scaleY;
    ctx.fillStyle = blob.color === "red" ? "#ff0000" : "#0066ff";
    ctx.font = "bold 10px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(blob.color === "red" ? "R" : "W", cx, cy + 3);
  }

  // Convert to data URL via blob
  // OffscreenCanvas doesn't have toDataURL, we need to use convertToBlob
  // But since this runs synchronously in our flow, we'll return a placeholder
  // and handle the async conversion in the component
  return ""; // Will be handled by the component
}

/**
 * Main entry: processes an HTMLImageElement and returns detection results.
 * This should be called from the component.
 */
export function processImage(
  img: HTMLImageElement,
  params: Partial<DetectionParams> = {}
): DetectionResult {
  const p = { ...DEFAULT_PARAMS, ...params };

  // Calculate processing dimensions
  const scale = p.processingWidth / img.naturalWidth;
  const procWidth = p.processingWidth;
  const procHeight = Math.round(img.naturalHeight * scale);

  // Draw image to canvas at processing resolution
  const canvas = document.createElement("canvas");
  canvas.width = procWidth;
  canvas.height = procHeight;
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(img, 0, 0, procWidth, procHeight);
  const imageData = ctx.getImageData(0, 0, procWidth, procHeight);

  // Run detection
  const result = detectCards(
    imageData,
    img.naturalWidth,
    img.naturalHeight,
    params
  );

  // Create annotated image at full processing resolution
  const annotCanvas = document.createElement("canvas");
  annotCanvas.width = procWidth;
  annotCanvas.height = procHeight;
  const actx = annotCanvas.getContext("2d")!;
  actx.drawImage(img, 0, 0, procWidth, procHeight);

  const scaleX = img.naturalWidth / procWidth;
  const scaleY = img.naturalHeight / procHeight;

  for (const blob of result.blobs) {
    const bx = blob.bbox.x / scaleX;
    const by = blob.bbox.y / scaleY;
    const bw = blob.bbox.w / scaleX;
    const bh = blob.bbox.h / scaleY;

    actx.strokeStyle = blob.color === "red" ? "#ff0000" : "#0066ff";
    actx.lineWidth = 2;
    actx.strokeRect(bx, by, bw, bh);

    const cx = blob.cx / scaleX;
    const cy = blob.cy / scaleY;

    // Draw circle marker
    actx.beginPath();
    actx.arc(cx, cy, 6, 0, Math.PI * 2);
    actx.fillStyle =
      blob.color === "red"
        ? "rgba(255, 0, 0, 0.7)"
        : "rgba(0, 100, 255, 0.7)";
    actx.fill();
    actx.strokeStyle = "#ffffff";
    actx.lineWidth = 1;
    actx.stroke();
  }

  result.annotatedImageDataUrl = annotCanvas.toDataURL("image/jpeg", 0.9);

  return result;
}
