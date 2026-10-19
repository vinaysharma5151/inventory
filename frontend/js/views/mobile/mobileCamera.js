/**
 * mobileCamera.js — Mobile Camera Viewfinder, WebRTC & Native Fallback Controller.
 * 
 * WHY:
 * 1. Mobile browsers block getUserMedia on non-HTTPS origins (local showroom Wi-Fi IP).
 * 2. This module provides transparent dual-mode capture: live WebRTC stream if available,
 *    and instant HTML5 camera input (<input capture="environment">) if blocked.
 * 3. Handles shutter animations, canvas resolution capping (max 1200px), and memory cleanup.
 */

import { calculateMediumDimensions, compressToMediumResolution } from '../../imageUtils.js';

/**
 * Initializes mobile camera controller.
 * @param {HTMLElement} containerEl
 * @param {object} callbacks - { onPhotoCaptured(blob), onPhotoCleared() }
 * @returns {object} - { start(), stop(), reset(), getPhotoBlob(), destroy() }
 */
export function initMobileCamera(containerEl, callbacks = {}) {
  const video = containerEl.querySelector('#camera-video');
  const canvas = containerEl.querySelector('#camera-canvas');
  const nativeFileInput = containerEl.querySelector('#camera-native-input');
  const videoContainer = containerEl.querySelector('#video-container');
  const previewContainer = containerEl.querySelector('#preview-container');
  const previewImg = containerEl.querySelector('#preview-img');
  const fallbackScreen = containerEl.querySelector('#camera-fallback-screen');
  const flashEl = containerEl.querySelector('#flash-effect-el');

  const shutterBtn = containerEl.querySelector('#btn-shutter');
  const flipBtn = containerEl.querySelector('#btn-flip-camera');
  const galleryBtn = containerEl.querySelector('#btn-open-gallery');
  const retakeBtn = containerEl.querySelector('#btn-retake-photo');
  const fallbackTrigger = containerEl.querySelector('#btn-fallback-trigger');

  let stream = null;
  let facingMode = 'environment';
  let cameraDenied = false;
  let photoBlob = null;
  let photoPreviewUrl = null;

  const stopCamera = () => {
    if (stream) {
      stream.getTracks().forEach((track) => {
        try { track.stop(); } catch (_) {}
      });
      stream = null;
    }
  };

  const startCamera = async () => {
    stopCamera();
    cameraDenied = false;

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      // Insecure HTTP or unsupported mobile browser
      if (videoContainer) videoContainer.style.display = 'none';
      if (fallbackScreen) fallbackScreen.style.display = 'flex';
      cameraDenied = true;
      return;
    }

    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          facingMode: { ideal: facingMode },
          width: { ideal: 1920, min: 1280 },
          height: { ideal: 1080, min: 720 },
        },
      });

      stream = mediaStream;
      if (video) {
        video.srcObject = mediaStream;
        await video.play().catch(() => {});
      }
      if (videoContainer) videoContainer.style.display = 'block';
      if (fallbackScreen) fallbackScreen.style.display = 'none';
    } catch (err) {
      console.warn('getUserMedia stream unavailable:', err);
      cameraDenied = true;
      if (videoContainer) videoContainer.style.display = 'none';
      if (fallbackScreen) fallbackScreen.style.display = 'flex';
    }
  };

  const setPhoto = (blob) => {
    photoBlob = blob;
    if (photoPreviewUrl) URL.revokeObjectURL(photoPreviewUrl);
    photoPreviewUrl = URL.createObjectURL(blob);
    if (previewImg) previewImg.src = photoPreviewUrl;

    stopCamera();
    if (videoContainer) videoContainer.style.display = 'none';
    if (fallbackScreen) fallbackScreen.style.display = 'none';
    if (previewContainer) previewContainer.style.display = 'block';

    if (callbacks.onPhotoCaptured) callbacks.onPhotoCaptured(blob);
  };

  const clearPhoto = () => {
    photoBlob = null;
    if (photoPreviewUrl) {
      URL.revokeObjectURL(photoPreviewUrl);
      photoPreviewUrl = null;
    }
    if (previewContainer) previewContainer.style.display = 'none';

    if (cameraDenied) {
      if (fallbackScreen) fallbackScreen.style.display = 'flex';
    } else {
      if (videoContainer) videoContainer.style.display = 'block';
      startCamera();
    }

    if (callbacks.onPhotoCleared) callbacks.onPhotoCleared();
  };

  // Wire Shutter Click
  if (shutterBtn) {
    shutterBtn.addEventListener('click', () => {
      if (!video || !video.videoWidth) {
        if (nativeFileInput) nativeFileInput.click();
        return;
      }

      // Flash animation
      if (flashEl) {
        flashEl.style.display = 'block';
        setTimeout(() => (flashEl.style.display = 'none'), 200);
      }

      // Haptic feedback
      if (navigator.vibrate) navigator.vibrate([25, 20, 40]);

      const { width: targetWidth, height: targetHeight } = calculateMediumDimensions(
        video.videoWidth,
        video.videoHeight,
        1200
      );

      canvas.width = targetWidth;
      canvas.height = targetHeight;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';

      if (facingMode === 'user') {
        ctx.translate(canvas.width, 0);
        ctx.scale(-1, 1);
      }
      ctx.drawImage(video, 0, 0, targetWidth, targetHeight);

      canvas.toBlob(
        (blob) => {
          canvas.width = 0;
          canvas.height = 0;
          if (blob) setPhoto(blob);
        },
        'image/jpeg',
        0.80
      );
    });
  }

  // Flip Camera
  if (flipBtn) {
    flipBtn.addEventListener('click', () => {
      if (navigator.vibrate) navigator.vibrate(35);
      facingMode = facingMode === 'environment' ? 'user' : 'environment';
      if (video) video.classList.toggle('flipped', facingMode === 'user');
      startCamera();
    });
  }

  // Open Native Camera or Gallery
  if (galleryBtn && nativeFileInput) {
    galleryBtn.addEventListener('click', () => nativeFileInput.click());
  }
  if (fallbackTrigger && nativeFileInput) {
    fallbackTrigger.addEventListener('click', () => nativeFileInput.click());
  }
  if (fallbackScreen && nativeFileInput) {
    fallbackScreen.addEventListener('click', () => nativeFileInput.click());
  }

  if (nativeFileInput) {
    nativeFileInput.addEventListener('change', async (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      if (navigator.vibrate) navigator.vibrate(40);

      const mediumBlob = await compressToMediumResolution(file, 1200, 0.80);
      if (mediumBlob) setPhoto(mediumBlob);
    });
  }

  // Retake Photo
  if (retakeBtn) {
    retakeBtn.addEventListener('click', () => {
      if (navigator.vibrate) navigator.vibrate(30);
      clearPhoto();
    });
  }

  return {
    start: startCamera,
    stop: stopCamera,
    reset: clearPhoto,
    getPhotoBlob: () => photoBlob,
    destroy() {
      stopCamera();
      if (photoPreviewUrl) {
        URL.revokeObjectURL(photoPreviewUrl);
        photoPreviewUrl = null;
      }
    },
  };
}
