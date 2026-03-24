"use client";

import { useState, useCallback, useRef } from "react";
import { processImage, DetectionResult, DetectionParams } from "@/lib/card-detector";

export default function Home() {
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [result, setResult] = useState<DetectionResult | null>(null);
  const [processing, setProcessing] = useState(false);
  const [showAnnotated, setShowAnnotated] = useState(true);
  const [showSettings, setShowSettings] = useState(false);
  const [params, setParams] = useState<DetectionParams>({
    minBlobSize: 20,
    maxBlobSize: 8000,
    processingWidth: 1200,
  });
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

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
    <div className="min-h-screen bg-gray-50 p-3 sm:p-4 md:p-8">
      <div className="max-w-5xl mx-auto">
        <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-1">
          Card Counter
        </h1>
        <p className="text-gray-600 text-sm sm:text-base mb-4 sm:mb-6">
          Take a photo or upload one to count red and white cards.
        </p>

        {/* Upload area */}
        {!imageUrl && (
          <div className="space-y-3">
            {/* Camera button - prominent on mobile */}
            <button
              onClick={() => cameraInputRef.current?.click()}
              className="w-full py-6 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white rounded-xl text-lg font-medium transition-colors flex items-center justify-center gap-3"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z"/>
                <circle cx="12" cy="13" r="3"/>
              </svg>
              Take Photo
            </button>
            <input
              ref={cameraInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              onChange={handleInputChange}
              className="hidden"
            />

            {/* Upload from gallery / file */}
            <div
              onDrop={handleDrop}
              onDragOver={(e) => e.preventDefault()}
              onClick={() => fileInputRef.current?.click()}
              className="border-2 border-dashed border-gray-300 rounded-xl p-8 sm:p-16 text-center cursor-pointer hover:border-blue-400 hover:bg-blue-50 active:bg-blue-50 transition-colors"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mx-auto mb-3 text-gray-400">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                <polyline points="17 8 12 3 7 8"/>
                <line x1="12" y1="3" x2="12" y2="15"/>
              </svg>
              <div className="text-gray-500 text-base sm:text-lg mb-1">
                Upload from gallery
              </div>
              <div className="text-gray-400 text-xs sm:text-sm">
                or drop an image here
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleInputChange}
                className="hidden"
              />
            </div>
          </div>
        )}

        {/* Results */}
        {imageUrl && (
          <div className="space-y-3 sm:space-y-6">
            {/* Count display */}
            {result && (
              <div className="grid grid-cols-3 gap-2 sm:gap-4">
                <div className="bg-white rounded-lg p-3 sm:p-6 shadow-sm text-center">
                  <div className="text-3xl sm:text-4xl font-bold text-red-600">
                    {result.redCount}
                  </div>
                  <div className="text-xs sm:text-sm text-gray-500 mt-1">Red</div>
                </div>
                <div className="bg-white rounded-lg p-3 sm:p-6 shadow-sm text-center">
                  <div className="text-3xl sm:text-4xl font-bold text-blue-600">
                    {result.whiteCount}
                  </div>
                  <div className="text-xs sm:text-sm text-gray-500 mt-1">White</div>
                </div>
                <div className="bg-white rounded-lg p-3 sm:p-6 shadow-sm text-center">
                  <div className="text-3xl sm:text-4xl font-bold text-gray-800">
                    {result.totalCount}
                  </div>
                  <div className="text-xs sm:text-sm text-gray-500 mt-1">Total</div>
                </div>
              </div>
            )}

            {/* Processing indicator */}
            {processing && (
              <div className="bg-white rounded-lg p-6 sm:p-8 shadow-sm text-center">
                <div className="animate-spin w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full mx-auto mb-3" />
                <div className="text-gray-600 text-base">Processing...</div>
              </div>
            )}

            {/* Image display */}
            <div className="bg-white rounded-lg p-1 sm:p-2 shadow-sm">
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

            {/* Action buttons */}
            <div className="flex gap-2 sm:gap-3">
              <button
                onClick={() => {
                  setImageUrl(null);
                  setResult(null);
                  setShowSettings(false);
                }}
                className="flex-1 py-3 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white rounded-xl text-sm sm:text-base font-medium transition-colors"
              >
                New Photo
              </button>

              {result && (
                <button
                  onClick={() => setShowAnnotated(!showAnnotated)}
                  className="flex-1 py-3 bg-gray-100 hover:bg-gray-200 active:bg-gray-300 rounded-xl text-sm sm:text-base font-medium transition-colors"
                >
                  {showAnnotated ? "Original" : "Annotated"}
                </button>
              )}

              <button
                onClick={() => setShowSettings(!showSettings)}
                className="py-3 px-4 bg-gray-100 hover:bg-gray-200 active:bg-gray-300 rounded-xl transition-colors"
                aria-label="Settings"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="4" y1="21" x2="4" y2="14"/><line x1="4" y1="10" x2="4" y2="3"/>
                  <line x1="12" y1="21" x2="12" y2="12"/><line x1="12" y1="8" x2="12" y2="3"/>
                  <line x1="20" y1="21" x2="20" y2="16"/><line x1="20" y1="12" x2="20" y2="3"/>
                  <line x1="1" y1="14" x2="7" y2="14"/><line x1="9" y1="8" x2="15" y2="8"/>
                  <line x1="17" y1="16" x2="23" y2="16"/>
                </svg>
              </button>
            </div>

            {/* Settings panel - collapsible */}
            {showSettings && (
              <div className="bg-white rounded-xl p-4 shadow-sm space-y-4">
                <h3 className="font-medium text-gray-700 text-sm">Detection Settings</h3>
                <div className="space-y-3">
                  <div>
                    <label className="text-xs text-gray-500 block mb-1">
                      Min blob size: {params.minBlobSize}
                    </label>
                    <input
                      type="range"
                      min="5"
                      max="200"
                      value={params.minBlobSize}
                      onChange={(e) =>
                        setParams({ ...params, minBlobSize: +e.target.value })
                      }
                      className="w-full accent-blue-600"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 block mb-1">
                      Max blob size: {params.maxBlobSize}
                    </label>
                    <input
                      type="range"
                      min="500"
                      max="20000"
                      step="100"
                      value={params.maxBlobSize}
                      onChange={(e) =>
                        setParams({ ...params, maxBlobSize: +e.target.value })
                      }
                      className="w-full accent-blue-600"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 block mb-1">
                      Processing width: {params.processingWidth}px
                    </label>
                    <input
                      type="range"
                      min="600"
                      max="2000"
                      step="100"
                      value={params.processingWidth}
                      onChange={(e) =>
                        setParams({ ...params, processingWidth: +e.target.value })
                      }
                      className="w-full accent-blue-600"
                    />
                  </div>
                </div>
                <button
                  onClick={reprocess}
                  disabled={processing}
                  className="w-full py-3 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 disabled:bg-blue-300 text-white rounded-xl text-sm font-medium transition-colors"
                >
                  Reprocess
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
