<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { Check, X } from 'lucide-vue-next'

type Position =
  | '작곡가'
  | '프로듀서'
  | 'DJ'
  | '사운드 엔지니어'
  | '보컬'
  | '건반'
  | '기타'
  | '베이스'
  | '드럼'
  | '퍼커션'
  | '스트링'
  | '목관'
  | '금관'
  | '기타 포지션'

const POSITIONS: Position[] = [
  '작곡가',
  '프로듀서',
  'DJ',
  '사운드 엔지니어',
  '보컬',
  '건반',
  '기타',
  '베이스',
  '드럼',
  '퍼커션',
  '스트링',
  '목관',
  '금관',
  '기타 포지션',
]

const SUB_OPTIONS: Partial<Record<Position, string[]>> = {
  건반: ['피아노', '키보드', '오르간', '기타'],
  기타: ['클래식 기타', '일렉 기타', '어쿠스틱 기타', '기타'],
  베이스: ['콘트라베이스', '일렉 베이스', '기타'],
  스트링: ['바이올린', '비올라', '첼로', '더블베이스', '하프', '기타'],
  목관: ['피콜로', '플루트', '오보에', '클라리넷', '바순', '색소폰', '기타'],
  금관: ['호른', '트럼펫', '트롬본', '튜바', '기타'],
}

const MAX_SELECTIONS = 3

const router = useRouter()
const activePosition = ref<Position | null>('기타')
const activeSub = ref<string | null>('클래식 기타')
const selections = ref<string[]>([])
const done = ref(false)

const subOptions = computed(() => {
  return activePosition.value ? SUB_OPTIONS[activePosition.value] ?? [] : []
})

const canSubmit = computed(() => selections.value.length > 0)

function addSelection(label: string) {
  if (selections.value.includes(label))
    return

  if (selections.value.length >= MAX_SELECTIONS)
    return

  selections.value.push(label)
}

function handlePositionClick(position: Position) {
  activePosition.value = position

  const subs = SUB_OPTIONS[position]

  if (subs && subs.length > 0) {
    activeSub.value = null
    return
  }

  activeSub.value = null
  addSelection(position)
}

function handleSubClick(sub: string) {
  activeSub.value = sub
  addSelection(sub)
}

function removeSelection(label: string) {
  selections.value = selections.value.filter(item => item !== label)
}

function handleSubmit() {
  if (!canSubmit.value)
    return

  done.value = true
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

        <div class="mt-4 flex flex-wrap gap-2.5">
          <button
            v-for="position in POSITIONS"
            :key="position"
            type="button"
            class="rounded-full px-5 py-2 text-sm transition"
            :class="activePosition === position || selections.includes(position)
              ? 'bg-foreground text-background shadow-[0_0_20px_hsl(0_0%_100%/0.15)]'
              : 'bg-muted text-foreground/85 hover:bg-muted/80 dark:bg-[hsl(230_20%_14%)] dark:hover:bg-[hsl(230_20%_18%)]'"
            @click="handlePositionClick(position)"
          >
            {{ position }}
          </button>
        </div>
      </div>

      <div
        v-if="activePosition && subOptions.length > 0"
        class="mt-10 animate-fade-in"
      >
        <span class="text-[11px] uppercase tracking-[0.35em] text-muted-foreground/80">
          {{ activePosition }}
        </span>

        <div class="mt-4 space-y-2.5">
          <button
            v-for="sub in subOptions"
            :key="sub"
            type="button"
            class="block w-full rounded-full px-6 py-3 text-left text-sm transition"
            :class="activeSub === sub || selections.includes(sub)
              ? 'bg-foreground text-background shadow-[0_0_24px_hsl(0_0%_100%/0.12)]'
              : 'bg-muted text-foreground/85 hover:bg-muted/80 dark:bg-[hsl(230_20%_14%)] dark:hover:bg-[hsl(230_20%_18%)]'"
            @click="handleSubClick(sub)"
          >
            {{ sub }}
          </button>
        </div>
      </div>

      <div class="mt-12 border-t border-border/60 pt-6">
        <div class="flex flex-wrap gap-2.5">
          <span
            v-if="selections.length === 0"
            class="text-xs text-muted-foreground/60"
          >
            포지션을 선택해주세요
          </span>

          <span
            v-for="selection in selections"
            v-else
            :key="selection"
            class="inline-flex items-center gap-2 rounded-full bg-muted px-4 py-1.5 text-sm text-foreground dark:bg-[hsl(230_20%_14%)]"
          >
            {{ selection }}

            <button
              type="button"
              class="text-muted-foreground transition hover:text-fuchsia-500 dark:hover:text-fuchsia-400"
              :aria-label="`${selection} 제거`"
              @click="removeSelection(selection)"
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
            완료하기
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