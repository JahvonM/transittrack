// Profile pictures are displayed to authorised users of the transport service.
// Convert camera/library images to a small JPEG before using the documented upload API.
export async function prepareProfilePhoto(file) {
  if (!file || !/^image\/(jpeg|png|webp|heic|heif)$/i.test(file.type || '')) {
    throw new Error('Choose a JPG, PNG or WebP photo. If an iPhone photo cannot open, export it as JPG first.');
  }
  if (file.size > 12 * 1024 * 1024) throw new Error('Choose a photo smaller than 12 MB.');
  const url = URL.createObjectURL(file);
  try {
    const image = await new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('This photo could not be opened. Try a JPG or PNG photo.'));
      img.src = url;
    });
    const scale = Math.min(1, 768 / Math.max(image.naturalWidth, image.naturalHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Photo processing is unavailable. Try another browser.');
    context.fillStyle = '#fff'; context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.85));
    if (!blob) throw new Error('Could not prepare this photo. Try another photo.');
    return new File([blob], 'profile.jpg', { type: 'image/jpeg' });
  } finally { URL.revokeObjectURL(url); }
}

export async function uploadProfilePhoto(client, file) {
  const prepared = await prepareProfilePhoto(file);
  const response = await client.integrations.Core.UploadFile({ file: prepared });
  if (typeof response?.file_url !== 'string' || !response.file_url) {
    throw new Error('The upload did not return a photo. Your previous picture has been kept.');
  }
  return response.file_url;
}
