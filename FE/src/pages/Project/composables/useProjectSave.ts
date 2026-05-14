// useProjectSave.ts
import { ref } from 'vue'
import { projectApi } from '../api/project.api'

export function useProjectSave(projectId: number) {
    const lastSavedTime = ref<string>('--:--')

    function formatTime(isoString: string) {
        const date = new Date(isoString);
        const hours = String(date.getHours()).padStart(2, '0');
        const minutes = String(date.getMinutes()).padStart(2, '0');
        return `${hours}:${minutes}`;
    }

    async function handleSave() {
        try {
            const response = await projectApi.saveProjectSnapshot(projectId)
            lastSavedTime.value = formatTime(response.saveAt)
        } catch (error) {
           // console.error('저장 실패:', error)
        }
    }

    return { lastSavedTime, handleSave }
}
