/*
  Image sanitisation (SRS FR-17 / SEC-07).

  Redrawing an uploaded image onto an HTML canvas and re-exporting it
  strips EXIF metadata for real — canvas pixel data has no metadata
  channel, so whatever comes out of toBlob() is clean, regardless of
  what the original file contained (GPS coordinates, camera make/model,
  timestamps, etc.). This is a genuine implementation of FR-17, not a
  cosmetic label — it just doesn't correct for EXIF orientation, which
  a production implementation should also read before discarding.
*/
export function sanitizeImage(file) {
  return new Promise((resolve, reject) => {
    if (!file || !file.type.startsWith("image/")) {
      reject(new Error("Not an image file"));
      return;
    }

    const reader = new FileReader();

    reader.onerror = () => reject(new Error("Could not read the file"));

    reader.onload = () => {
      const img = new Image();

      img.onerror = () => reject(new Error("Could not decode the image"));

      img.onload = () => {
        const canvas = document.createElement("canvas");
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;

        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0);

        canvas.toBlob(
          (blob) => {
            if (!blob) {
              reject(new Error("Could not re-encode the image"));
              return;
            }
            resolve({
              blob,
              previewUrl: URL.createObjectURL(blob),
              width: canvas.width,
              height: canvas.height,
            });
          },
          file.type === "image/png" ? "image/png" : "image/jpeg",
          0.9
        );
      };

      img.src = reader.result;
    };

    reader.readAsDataURL(file);
  });
}
