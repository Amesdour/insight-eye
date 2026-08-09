export type SampledFrame = { offset: number; image: string };

/**
 * Samples still frames from a local video file in the browser.
 * Frames are what gets sent to the detection provider — the raw clip stays in storage.
 */
export async function sampleFrames(file: File, count = 8, maxWidth = 640): Promise<SampledFrame[]> {
  const url = URL.createObjectURL(file);
  const video = document.createElement("video");
  video.muted = true;
  video.playsInline = true;
  video.preload = "auto";
  video.src = url;

  try {
    await new Promise<void>((resolve, reject) => {
      video.onloadedmetadata = () => resolve();
      video.onerror = () => reject(new Error("Unreadable video file"));
    });

    const duration = Number.isFinite(video.duration) && video.duration > 0 ? video.duration : 0;
    const canvas = document.createElement("canvas");
    const ratio = video.videoWidth ? Math.min(1, maxWidth / video.videoWidth) : 1;
    canvas.width = Math.max(160, Math.round((video.videoWidth || maxWidth) * ratio));
    canvas.height = Math.max(90, Math.round((video.videoHeight || maxWidth * 0.5625) * ratio));
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas unavailable");

    const frames: SampledFrame[] = [];
    const total = Math.max(1, count);

    for (let i = 0; i < total; i += 1) {
      const offset = duration ? (duration * (i + 0.5)) / total : 0;
      await new Promise<void>((resolve, reject) => {
        const onSeeked = () => {
          video.removeEventListener("seeked", onSeeked);
          resolve();
        };
        video.addEventListener("seeked", onSeeked);
        video.onerror = () => reject(new Error("Seek failed"));
        video.currentTime = Math.min(offset, Math.max(0, duration - 0.05));
      });
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      frames.push({ offset, image: canvas.toDataURL("image/jpeg", 0.6) });
    }

    return frames;
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function videoDuration(file: File): Promise<number> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement("video");
    video.preload = "metadata";
    video.onloadedmetadata = () => {
      URL.revokeObjectURL(url);
      resolve(Number.isFinite(video.duration) ? video.duration : 0);
    };
    video.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(0);
    };
    video.src = url;
  });
}
