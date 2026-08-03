import { api } from './api'

export interface FileUploadResponse {
  id: number
  filename: string
  original_filename: string
  mime_type: string
  size: number
  path: string
  url: string
  created_at: string
}

export interface FileUploadProgress {
  onProgress?: (progress: number) => void
}

class FileService {
  /**
   * Upload a single file
   */
  async uploadFile(
    file: File,
    onProgress?: (progress: number) => void,
    folder?: string
  ): Promise<FileUploadResponse> {
    const formData = new FormData()
    formData.append('file', file)
    if (folder) {
      formData.append('folder', folder)
    }

    return new Promise((resolve, reject) => {
      api
        .post('/files/upload', formData, {
          headers: {
            'Content-Type': 'multipart/form-data',
          },
          onUploadProgress: (progressEvent) => {
            if (progressEvent.total) {
              const progress = Math.round(
                (progressEvent.loaded * 100) / progressEvent.total
              )
              onProgress?.(progress)
            }
          },
        })
        .then((response) => {
          const result = response.data?.data || response.data
          resolve(result)
        })
        .catch(reject)
    })
  }

  /**
   * Upload multiple files
   */
  async uploadFiles(
    files: File[],
    onProgress?: (fileIndex: number, progress: number) => void,
    folder?: string
  ): Promise<FileUploadResponse[]> {
    const results: FileUploadResponse[] = []

    for (let i = 0; i < files.length; i++) {
      const file = files[i]
      try {
        const result = await this.uploadFile(
          file,
          (progress) => onProgress?.(i, progress),
          folder
        )
        results.push(result)
      } catch (error) {
        console.error(`Failed to upload file ${file.name}:`, error)
        throw error
      }
    }

    return results
  }

  /**
   * Get list of uploaded files
   */
  async listFiles(
    params?: {
      page?: number
      limit?: number
      folder?: string
      mimeType?: string
    }
  ) {
    return api
      .get('/files', { params })
      .then((r) => r.data.data)
  }

  /**
   * Delete a file
   */
  async deleteFile(fileId: number) {
    return api
      .delete(`/files/${fileId}`)
      .then((r) => r.data)
  }

  /**
   * Get file by ID
   */
  async getFile(fileId: number) {
    return api
      .get(`/files/${fileId}`)
      .then((r) => r.data.data)
  }

  /**
   * Download file
   */
  async downloadFile(fileId: number, filename?: string) {
    return api
      .get(`/files/${fileId}/download`, {
        responseType: 'blob',
      })
      .then((response) => {
        // Create blob link to download
        const url = window.URL.createObjectURL(new Blob([response.data]))
        const link = document.createElement('a')
        link.href = url
        link.setAttribute('download', filename || 'file')
        document.body.appendChild(link)
        link.click()
        link?.parentNode?.removeChild(link)
        window.URL.revokeObjectURL(url)
      })
  }
}

export const fileService = new FileService()
