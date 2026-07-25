const MAX_DIMENSION = 1600
const JPEG_QUALITY = 0.82
const TARGET_MAX_BYTES = 350_000

function resizeToJpeg(img) {
  let { width, height } = img

  if (width > MAX_DIMENSION || height > MAX_DIMENSION) {
    if (width > height) {
      height = Math.round((height / width) * MAX_DIMENSION)
      width = MAX_DIMENSION
    } else {
      width = Math.round((width / height) * MAX_DIMENSION)
      height = MAX_DIMENSION
    }
  }

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  canvas.getContext('2d').drawImage(img, 0, 0, width, height)
  return canvas.toDataURL('image/jpeg', JPEG_QUALITY)
}

export function compressImage(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      const img = new Image()
      img.onload = () => resolve(resizeToJpeg(img))
      img.onerror = () => reject(new Error('Failed to load image'))
      img.src = e.target.result
    }
    reader.onerror = () => reject(new Error('Failed to read file'))
    reader.readAsDataURL(file)
  })
}

export function compressDataUrl(dataUrl) {
  return compressDataUrlIfNeeded(dataUrl, 0)
}

export function compressDataUrlIfNeeded(dataUrl, threshold = TARGET_MAX_BYTES) {
  return new Promise((resolve, reject) => {
    if (!dataUrl?.startsWith('data:image/')) {
      reject(new Error('Invalid photo format'))
      return
    }

    const img = new Image()
    img.onload = () => {
      const isSmallJpeg =
        dataUrl.startsWith('data:image/jpeg') && dataUrl.length <= threshold
      resolve(isSmallJpeg ? dataUrl : resizeToJpeg(img))
    }
    img.onerror = () => reject(new Error('Failed to load image'))
    img.src = dataUrl
  })
}

export function validatePhotoDataUrl(dataUrl) {
  return new Promise((resolve, reject) => {
    if (!dataUrl?.startsWith('data:image/')) {
      reject(new Error('Invalid photo format'))
      return
    }

    const img = new Image()
    img.onload = () => resolve(true)
    img.onerror = () => reject(new Error('Photo appears damaged'))
    img.src = dataUrl
  })
}

export async function preparePhotoForApi(photo) {
  await validatePhotoDataUrl(photo)
  return compressDataUrlIfNeeded(photo)
}

/** Smaller JPEG for check-history storage (keeps localStorage lighter). */
export function createThumbnail(dataUrl, maxDimension = 480, quality = 0.72) {
  return new Promise((resolve, reject) => {
    if (!dataUrl?.startsWith('data:image/')) {
      reject(new Error('Invalid photo format'))
      return
    }

    const img = new Image()
    img.onload = () => {
      let { width, height } = img
      if (width > maxDimension || height > maxDimension) {
        if (width > height) {
          height = Math.round((height / width) * maxDimension)
          width = maxDimension
        } else {
          width = Math.round((width / height) * maxDimension)
          height = maxDimension
        }
      }
      const canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = height
      canvas.getContext('2d').drawImage(img, 0, 0, width, height)
      resolve(canvas.toDataURL('image/jpeg', quality))
    }
    img.onerror = () => reject(new Error('Failed to load image'))
    img.src = dataUrl
  })
}
