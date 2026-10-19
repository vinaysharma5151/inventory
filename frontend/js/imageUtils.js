/**
 * imageUtils.js — Image processing utilities for client-side medium-resolution compression.
 * 
 * WHY:
 * Modern smartphone cameras capture 12-48 megapixel photos (5MB - 20MB per photo).
 * Sending such massive files over a local shop Wi-Fi network to an old laptop:
 * 1. Slows down submission to several seconds.
 * 2. Bloats disk space.
 * 3. Crashes browser tabs on low-RAM machines.
 * 
 * This module downscales images directly in the browser using the HTML5 Canvas API
 * to max 1200px width/height at 80% JPEG quality (~100KB to 250KB), ensuring instant
 * uploads and crisp image quality for hanger tags and desktop displays.
 */

export const MAX_MEDIUM_DIMENSION = 1200;
export const MEDIUM_JPEG_QUALITY = 0.80;

/**
 * Calculates new dimensions scaled to fit within maxEdge while maintaining aspect ratio.
 * @param {number} width - Original width
 * @param {number} height - Original height
 * @param {number} [maxEdge=1200] - Maximum dimension in pixels
 * @returns {{width: number, height: number}}
 */
export function calculateMediumDimensions(width, height, maxEdge = MAX_MEDIUM_DIMENSION) {
  if (!width || !height) return { width: maxEdge, height: maxEdge };
  if (width <= maxEdge && height <= maxEdge) {
    return { width, height };
  }

  if (width >= height) {
    const scale = maxEdge / width;
    return {
      width: maxEdge,
      height: Math.round(height * scale)
    };
  } else {
    const scale = maxEdge / height;
    return {
      width: Math.round(width * scale),
      height: maxEdge
    };
  }
}

/**
 * Compresses any File or Blob to a medium-resolution JPEG blob.
 * @param {Blob|File} fileOrBlob - Input image from file input or camera canvas
 * @param {number} [maxEdge=1200] - Maximum width or height
 * @param {number} [quality=0.80] - JPEG compression quality (0.0 to 1.0)
 * @returns {Promise<Blob>}
 */
export function compressToMediumResolution(fileOrBlob, maxEdge = MAX_MEDIUM_DIMENSION, quality = MEDIUM_JPEG_QUALITY) {
  return new Promise((resolve) => {
    if (!fileOrBlob) {
      resolve(null);
      return;
    }

    const img = new Image();
    const objectUrl = URL.createObjectURL(fileOrBlob);

    img.onload = () => {
      URL.revokeObjectURL(objectUrl);

      const naturalW = img.naturalWidth || img.width;
      const naturalH = img.naturalHeight || img.height;
      const { width, height } = calculateMediumDimensions(naturalW, naturalH, maxEdge);

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;

      const ctx = canvas.getContext('2d');
      if (!ctx) {
        resolve(fileOrBlob);
        return;
      }

      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(img, 0, 0, width, height);

      canvas.toBlob(
        (blob) => {
          // Immediately free GPU canvas memory buffer to avoid memory leaks on phones
          canvas.width = 0;
          canvas.height = 0;
          resolve(blob || fileOrBlob);
        },
        'image/jpeg',
        quality
      );
    };

    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(fileOrBlob);
    };

    img.src = objectUrl;
  });
}
