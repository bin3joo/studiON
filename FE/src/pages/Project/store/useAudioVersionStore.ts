import { defineStore } from 'pinia'
import { ref } from 'vue'
import {
  getAudioVersionList,
  createAudioVersion,
  deleteAudioVersion,
  getAudioVersionDownloadUrl,
  type AudioVersionSummary,
  type AudioVersionCreateRequest
} from '../api/audioVersion.api'

export const useAudioVersionStore = defineStore('audioVersion', () => {
  const versions = ref<AudioVersionSummary[]>([])
  const isLoading = ref(false)

  const fetchVersions = async (projectId: number) => {
    try {
      isLoading.value = true
      const res = await getAudioVersionList(projectId)
      if (res && res.data) {
        // 백엔드 응답이 { data: { versions: [...] } } 인지 { data: [...] } 인지 확인
        versions.value = res.data.versions || []
      }
    } catch (error) {
      console.error('버전 목록을 불러오는 중 오류 발생:', error)
    } finally {
      isLoading.value = false
    }
  }

  const saveVersion = async (projectId: number, payload: AudioVersionCreateRequest) => {
    try {
      const res = await createAudioVersion(projectId, payload)
      return res.isSuccess !== false // 성공 여부 반환
    } catch (error) {
      console.error('버전 저장 중 오류 발생:', error)
      return false
    }
  }

  const removeVersion = async (projectId: number, versionId: number) => {
    try {
      await deleteAudioVersion(projectId, versionId)
      await fetchVersions(projectId)
      return true
    } catch (error) {
      console.error('버전 삭제 중 오류 발생:', error)
      return false
    }
  }

  const downloadVersion = async (projectId: number, versionId: number, fileName: string) => {
    try {
      const res = await getAudioVersionDownloadUrl(projectId, versionId)
      if (res && res.data && res.data.downloadUrl) {
        const url = res.data.downloadUrl
        // presigned URL을 통해 다운로드 유도
        const link = document.createElement('a')
        link.href = url
        link.download = fileName.endsWith('.wav') ? fileName : `${fileName}.wav`
        document.body.appendChild(link)
        link.click()
        document.body.removeChild(link)
        return true
      }
    } catch (error) {
      console.error('다운로드 URL 발급 중 오류 발생:', error)
    }
    return false
  }

  return {
    versions,
    isLoading,
    fetchVersions,
    saveVersion,
    removeVersion,
    downloadVersion
  }
})
