"use client";

import { useState, useCallback, useRef } from "react";
import { processImage, DetectionResult, DetectionParams } from "@/lib/card-detector";

export default function Home() {
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [result, setResult] = useState<DetectionResult | null>(null);
  const [processing, setProcessing] = useState(false);
  const [showAnnotated, setShowAnnotated] = useState(true);
  const [params, setParams] = useState<DetectionParams>({
    minBlobSize: 20,
    maxBlobSize: 8000,
    processingWidth: 1200,
  });
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFile = useCallback(
    (file: File) => {
      const url = URL.createObjectURL(file);
      setImageUrl(url);
      setResult(null);
      setProcessing(true);

      const img = new Image();
      img.onload = () => {
        const startTime = performance.now();
        const detection = processImage(img, params);
        const elapsed = Math.round(performance.now() - startTime);
        console.log(`Detection took ${elapsed}ms`);
        setResult(detection);
        setProcessing(false);
      };
      img.src = url;
    },
    [params]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      const file = e.dataTransfer.files[0];
      if (file && file.type.startsWith("image/")) {
        handleFile(file);
      }
    },
    [handleFile]
  );

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
  };

  const reprocess = () => {
    if (!imageUrl) return;
    setProcessing(true);
    setResult(null);
    const img = new Image();
    img.onload = () => {
      const detection = processImage(img, params);
      setResult(detection);
      setProcessing(false);
    };
    img.src = imageUrl;
  };

  return (
    <div className="min-h-screen bg-gray-50 p-4 md:p-8">
      <div className="max-w-5xl mx-auto">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">
          Card Counter
        </h1>
        <p className="text-gray-600 mb-6">
          Upload a photo to count red and white cards held by audience members.
        </p>

        {/* Upload area */}
        {!imageUrl && (
          <div
            onDrop={handleDrop}
            onDragOver={(e) => e.preventDefault()}
            onClick={() => fileInputRef.current?.click()}
            className="border-2 border-dashed border-gray-300 rounded-xl p-16 text-center cursor-pointer hover:border-blue-400 hover:bg-blue-50 transition-colors"
          >
            <div className="text-gray-500 text-lg mb-2">
              Drop an image here or click to upload
            </div>
            <div className="text-gray-400 text-sm">
              Supports JPG, PNG, WebP
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleInputChange}
              className="hidden"
            />
          </div>
        )}

        {/* Results */}
        {imageUrl && (
          <div className="space-y-6">
            {/* Controls bar */}
            <div className="flex flex-wrap items-center gap-4 bg-white rounded-lg p-4 shadow-sm">
              <button
                onClick={() => {
                  setImageUrl(null);
                  setResult(null);
                }}
                className="px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg text-sm font-medium transition-colors"
              >
                New Image
              </button>

              {result && (
                <button
                  onClick={() => setShowAnnotated(!showAnnotated)}
                  className="px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg text-sm font-medium transition-colors"
                >
                  {showAnnotated ? "Show Original" : "Show Annotated"}
                </button>
              )}

              <div className="flex items-center gap-2 ml-auto">
                <label className="text-sm text-gray-600">Min blob:</label>
                <input
                  type="number"
                  value={params.minBlobSize}
                  onChange={(e) =>
                    setParams({ ...params, minBlobSize: +e.target.value })
                  }
                  className="w-20 px-2 py-1 border rounded text-sm"
                />
                <label className="text-sm text-gray-600">Max blob:</label>
                <input
                  type="number"
                  value={params.maxBlobSize}
                  onChange={(e) =>
                    setParams({ ...params, maxBlobSize: +e.target.value })
                  }
                  className="w-20 px-2 py-1 border rounded text-sm"
                />
                <label className="text-sm text-gray-600">Width:</label>
                <input
                  type="number"
                  value={params.processingWidth}
                  onChange={(e) =>
                    setParams({ ...params, processingWidth: +e.target.value })
                  }
                  className="w-20 px-2 py-1 border rounded text-sm"
                />
                <button
                  onClick={reprocess}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition-colors"
                >
                  Reprocess
                </button>
              </div>
            </div>

            {/* Count display */}
            {result && (
              <div className="grid grid-cols-3 gap-4">
                <div className="bg-white rounded-lg p-6 shadow-sm text-center">
                  <div className="text-4xl font-bold text-red-600">
                    {result.redCount}
                  </div>
                  <div className="text-sm text-gray-500 mt-1">Red Cards</div>
                </div>
                <div className="bg-white rounded-lg p-6 shadow-sm text-center">
                  <div className="text-4xl font-bold text-blue-600">
                    {result.whiteCount}
                  </div>
                  <div className="text-sm text-gray-500 mt-1">White Cards</div>
                </div>
                <div className="bg-white rounded-lg p-6 shadow-sm text-center">
                  <div className="text-4xl font-bold text-gray-800">
                    {result.totalCount}
                  </div>
                  <div className="text-sm text-gray-500 mt-1">Total Cards</div>
                </div>
              </div>
            )}

            {/* Processing indicator */}
            {processing && (
              <div className="bg-white rounded-lg p-8 shadow-sm text-center">
                <div className="text-gray-600 text-lg">Processing image...</div>
                <div className="mt-2 text-gray-400 text-sm">
                  Detecting cards via color analysis and blob detection
                </div>
              </div>
            )}

            {/* Image display */}
            <div className="bg-white rounded-lg p-2 shadow-sm">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={
                  showAnnotated && result?.annotatedImageDataUrl
                    ? result.annotatedImageDataUrl
                    : imageUrl
                }
                alt="Uploaded photo"
                className="w-full rounded"
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
