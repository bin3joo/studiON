<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { Check, X } from 'lucide-vue-next'
import { completeOnboarding, fetchPositions } from '../api/onboarding.api'
import { useAuthStore } from '../stores/auth.store'
import type { Position } from '../types/onboarding.types'

const MAX_SELECTIONS = 3

const router = useRouter()
const authStore = useAuthStore()

const positions = ref<Position[]>([])
const selectedPositionCodes = ref<number[]>([])

const activeGroupCode = ref<number | null>(null)
const activePositionCode = ref<number | null>(null)

const done = ref(false)
const isLoading = ref(false)
const errorMessage = ref('')

const canSubmit = computed(() => {
  return selectedPositionCodes.value.length > 0 && !isLoading.value
})

const groupedPositions = computed(() => {
  const groupMap = new Map<number, {
    code: number
    name: string
    order: number
    positions: Position[]
  }>()

  positions.value.forEach((position) => {
    if (!groupMap.has(position.groupCode)) {
      groupMap.set(position.groupCode, {
        code: position.groupCode,
        name: position.groupName,
        order: position.groupOrder,
        positions: [],
      })
    }

    groupMap.get(position.groupCode)?.positions.push(position)
  })

  return Array.from(groupMap.values())
    .map(group => ({
      ...group,
      positions: group.positions.sort((a, b) => a.order - b.order),
    }))
    .sort((a, b) => a.order - b.order)
})

const activeGroup = computed(() => {
  if (activeGroupCode.value === null)
    return null

  return groupedPositions.value.find(group => group.code === activeGroupCode.value) ?? null
})

const activeGroupPositions = computed(() => {
  return activeGroup.value?.positions ?? []
})

const selectedPositions = computed(() => {
  return selectedPositionCodes.value
    .map(code => positions.value.find(position => position.code === code))
    .filter((position): position is Position => Boolean(position))
})

onMounted(async () => {
  try {
    const response = await fetchPositions()

    if (!response.isSuccess) {
      throw new Error(response.message)
    }

    positions.value = response.data

    const firstGroup = groupedPositions.value[0]
    if (firstGroup) {
      activeGroupCode.value = firstGroup.code
    }
  } catch (error) {
   // console.error(error)
    errorMessage.value = '포지션 목록을 불러오지 못했습니다.'
  }
})

function addSelection(positionCode: number) {
  if (selectedPositionCodes.value.includes(positionCode))
    return

  if (selectedPositionCodes.value.length >= MAX_SELECTIONS) {
    errorMessage.value = `포지션은 최대 ${MAX_SELECTIONS}개까지 선택할 수 있습니다.`
    return
  }

  errorMessage.value = ''
  selectedPositionCodes.value.push(positionCode)
}

function handleGroupClick(group: {
  code: number
  name: string
  order: number
  positions: Position[]
}) {
  activeGroupCode.value = group.code
  activePositionCode.value = null

  const hasSubOptions = group.positions.length > 1

  if (!hasSubOptions) {
    const onlyPosition = group.positions[0]
    if (onlyPosition) {
      activePositionCode.value = onlyPosition.code
      addSelection(onlyPosition.code)
    }
  }
}

function handlePositionClick(position: Position) {
  activePositionCode.value = position.code
  addSelection(position.code)
}

function removeSelection(positionCode: number) {
  selectedPositionCodes.value = selectedPositionCodes.value.filter(code => code !== positionCode)
}

function isGroupPicked(group: {
  positions: Position[]
}) {
  return group.positions.some(position => selectedPositionCodes.value.includes(position.code))
}

async function handleSubmit() {
  if (!canSubmit.value)
    return

  try {
    isLoading.value = true
    errorMessage.value = ''

    const response = await completeOnboarding({
      positionCodes: selectedPositionCodes.value,
    })

    if (!response.isSuccess) {
      throw new Error(response.message)
    }

    authStore.setAccessToken(response.data.accessToken)

    done.value = true
  } catch (error) {
   // console.error(error)
    errorMessage.value = '온보딩 처리 중 오류가 발생했습니다.'
  } finally {
    isLoading.value = false
  }
}

function handleSkip() {
  router.push('/dashboard')
}

function handleEnterDashboard() {
  router.push('/dashboard')
}

function handleEditAgain() {
  done.value = false
}
</script>

<template>
  <div class="animate-fade-in">
    <div
      v-if="!done"
      class="rounded-3xl border border-border/60 bg-white/80 p-8 shadow-2xl backdrop-blur-xl dark:bg-[hsl(230_25%_10%/0.85)] md:p-12"
      style="box-shadow: 0 30px 80px -20px hsl(320 100% 50% / 0.18), inset 0 1px 0 hsl(0 0% 100% / 0.04);"
    >
      <div class="flex items-start justify-between gap-4">
        <div>
          <p class="text-[11px] font-semibold uppercase tracking-[0.35em] text-fuchsia-500 dark:text-fuchsia-400">
            환영합니다!
          </p>

          <h1 class="mt-4 font-display text-4xl font-bold leading-[1.05] tracking-tight text-foreground md:text-5xl">
            스튜디온에<br>
            초대합니다.
          </h1>

          <p class="mt-5 text-sm leading-relaxed text-muted-foreground">
            선호 포지션을 입력해주세요.<br>
            협업 매칭에 사용됩니다.
          </p>
        </div>

        <button
          type="button"
          class="rounded-full border border-border px-4 py-1.5 text-xs uppercase tracking-[0.25em] text-muted-foreground transition hover:border-fuchsia-500/60 hover:text-fuchsia-500 dark:hover:text-fuchsia-400"
          @click="handleSkip"
        >
          Skip
        </button>
      </div>

      <div class="mt-10">
  <span class="text-[11px] uppercase tracking-[0.35em] text-muted-foreground/80">
    포지션
  </span>

  <p
    v-if="positions.length === 0 && !errorMessage"
    class="mt-4 text-sm text-muted-foreground"
  >
    포지션 목록을 불러오는 중입니다.
  </p>

  <div class="mt-4 flex flex-wrap gap-2.5">
    <button
      v-for="group in groupedPositions"
      :key="group.code"
      type="button"
      class="rounded-full px-5 py-2 text-sm transition"
      :class="activeGroupCode === group.code || isGroupPicked(group)
        ? 'bg-foreground text-background shadow-[0_0_20px_hsl(0_0%_100%/0.15)]'
        : 'bg-muted text-foreground/85 hover:bg-muted/80 dark:bg-[hsl(230_20%_14%)] dark:hover:bg-[hsl(230_20%_18%)]'"
      @click="handleGroupClick(group)"
    >
      {{ group.name }}
    </button>
  </div>
</div>

<div
  v-if="activeGroup && activeGroupPositions.length > 1"
  class="mt-10 animate-fade-in"
>
  <span class="text-[11px] uppercase tracking-[0.35em] text-muted-foreground/80">
    {{ activeGroup.name }}
  </span>

  <div class="mt-4 space-y-2.5">
    <button
      v-for="position in activeGroupPositions"
      :key="position.code"
      type="button"
      class="block w-full rounded-full px-6 py-3 text-left text-sm transition"
      :class="activePositionCode === position.code || selectedPositionCodes.includes(position.code)
        ? 'bg-foreground text-background shadow-[0_0_24px_hsl(0_0%_100%/0.15)]'
        : 'bg-muted text-foreground/85 hover:bg-muted/80 dark:bg-[hsl(230_20%_14%)] dark:hover:bg-[hsl(230_20%_18%)]'"
      @click="handlePositionClick(position)"
    >
      {{ position.name }}
    </button>
  </div>
</div>

      <p
        v-if="errorMessage"
        class="mt-6 text-sm text-red-500"
      >
        {{ errorMessage }}
      </p>

      <div class="mt-12 border-t border-border/60 pt-6">
        <div class="flex flex-wrap gap-2.5">
          <span
            v-if="selectedPositions.length === 0"
            class="text-xs text-muted-foreground/60"
          >
            포지션을 선택해주세요
          </span>

          <span
            v-for="selection in selectedPositions"
            v-else
            :key="selection.code"
            class="inline-flex items-center gap-2 rounded-full bg-muted px-4 py-1.5 text-sm text-foreground dark:bg-[hsl(230_20%_14%)]"
          >
            {{ selection.name }}

            <button
              type="button"
              class="text-muted-foreground transition hover:text-fuchsia-500 dark:hover:text-fuchsia-400"
              :aria-label="`${selection.name} 제거`"
              @click="removeSelection(selection.code)"
            >
              <X class="h-3.5 w-3.5" />
            </button>
          </span>
        </div>

        <div class="mt-5 flex items-end justify-between gap-4">
          <p class="text-xs tracking-wide text-muted-foreground">
            포지션은 <span class="text-foreground">{{ MAX_SELECTIONS }}개</span>까지 입력 가능합니다.
          </p>

          <button
            type="button"
            :disabled="!canSubmit"
            class="rounded-full bg-fuchsia-500 px-7 py-2.5 text-sm font-medium text-white shadow-[0_0_24px_rgba(217,70,239,0.35)] transition hover:bg-fuchsia-500/90 disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground disabled:shadow-none"
            @click="handleSubmit"
          >
            {{ isLoading ? '처리 중...' : '완료하기' }}
          </button>
        </div>
      </div>
    </div>

    <div
      v-else
      class="rounded-3xl border border-fuchsia-500/40 bg-white/80 p-10 text-center shadow-[0_0_24px_rgba(217,70,239,0.25)] backdrop-blur-xl dark:bg-[hsl(230_25%_10%/0.85)] animate-fade-in"
    >
      <div class="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-fuchsia-500/15 text-fuchsia-500 dark:text-fuchsia-400">
        <Check class="h-6 w-6" />
      </div>

      <h2 class="mt-6 font-display text-3xl leading-tight text-foreground">
        환영합니다!
      </h2>

      <p class="mt-3 text-sm text-muted-foreground">
        프로필이 준비됐어요. 첫 세션을 시작해보세요.
      </p>

      <div class="mt-8 flex justify-center gap-3">
        <button
          type="button"
          class="rounded-full bg-fuchsia-500 px-6 py-2.5 text-xs uppercase tracking-[0.3em] text-white shadow-[0_0_24px_rgba(217,70,239,0.35)] transition hover:bg-fuchsia-500/90"
          @click="handleEnterDashboard"
        >
          Enter Dashboard
        </button>

        <button
          type="button"
          class="rounded-full border border-border px-6 py-2.5 text-xs uppercase tracking-[0.3em] text-muted-foreground transition hover:border-fuchsia-500/60 hover:text-fuchsia-500 dark:hover:text-fuchsia-400"
          @click="handleEditAgain"
        >
          Edit again
        </button>
      </div>
    </div>
  </div>
</template>