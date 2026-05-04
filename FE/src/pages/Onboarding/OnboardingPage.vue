<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import ThemeToggle from '@/shared/ui/theme/ThemeToggle.vue'
import logoLight from '@/assets/logo_light.png'
import logoDark from '@/assets/logo_dark.png'
import Waveform from './components/Waveform.vue'

import { redirectToGoogleLogin } from './api/onboarding.api'

function handleLoginClick() {
  redirectToGoogleLogin()
}

const isDark = ref(document.documentElement.classList.contains('dark'))

let observer: MutationObserver | null = null

onMounted(() => {
  observer = new MutationObserver(() => {
    isDark.value = document.documentElement.classList.contains('dark')
  })

  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['class'],
  })
})

onBeforeUnmount(() => {
  observer?.disconnect()
})

const waveformColor = computed(() =>
  isDark.value ? 'hsl(0 0% 96%)' : 'hsl(230 20% 18%)',
)
</script>

<template>
  <main class="min-h-screen bg-background text-foreground font-grotesk">
    <header class="relative z-10 flex items-center justify-between border-b border-border/60 px-6 py-5 md:px-10">
      <div class="flex items-center gap-3">
        <img
          :src="logoLight"
          alt="StudiON"
          class="h-20 w-auto dark:hidden"
        >
        <img
          :src="logoDark"
          alt="StudiON"
          class="hidden h-20 w-auto dark:block"
        >
      </div>

      <ThemeToggle />
    </header>

    <section class="relative overflow-hidden">
      <div class="absolute inset-0 -z-10 bg-grid opacity-20 dark:opacity-40" />
      <div class="absolute inset-0 -z-10 bg-grain opacity-30 dark:opacity-60" />

      <div class="mx-auto flex max-w-6xl flex-col items-center gap-12 px-6 pb-24 pt-20 text-center md:px-10 md:pt-28">

        <div class="relative w-full max-w-3xl">
          <div class="relative aspect-[16/9] overflow-visible">
            <!-- animated neon frames -->
            <div
              class="pointer-events-none absolute inset-0 rounded-md border neon-line-cyan neon-cycle-b"
              style="box-shadow:
                0 0 6px hsl(190 100% 55% / 0.7),
                0 0 18px hsl(190 100% 55% / 0.4),
                inset 0 0 6px hsl(190 100% 55% / 0.25);"
            />
            <div
              class="pointer-events-none absolute inset-0 rounded-md border neon-line-amber neon-cycle-c"
              style="box-shadow:
                0 0 6px hsl(38 100% 58% / 0.7),
                0 0 18px hsl(38 100% 58% / 0.4),
                inset 0 0 6px hsl(38 100% 58% / 0.25);"
            />
            <div
              class="pointer-events-none absolute inset-0 rounded-md border neon-line-magenta neon-cycle-a"
              style="box-shadow:
                0 0 6px hsl(320 100% 62% / 0.75),
                0 0 18px hsl(320 100% 62% / 0.45),
                inset 0 0 6px hsl(320 100% 62% / 0.3);"
            />

            <!-- content -->
            <div class="absolute inset-[14px] z-10 rounded-md border border-border/40 bg-background/80 backdrop-blur-sm">
              <div class="flex h-full flex-col items-center justify-center gap-5 px-8">
                <h1 class="font-display text-[clamp(2.5rem,9vw,6rem)] leading-none tracking-tight text-foreground">
                  StudiON
                </h1>

                <div class="h-12 w-full max-w-md opacity-90">
                  <Waveform
                    :bars="64"
                    :speed="0.3"
                    class-name="h-full w-full"
                    :color="waveformColor"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>

        <button
          type="button"
          class="group relative overflow-hidden rounded-none border border-foreground bg-transparent px-10 py-4 font-mono-tight text-[11px] uppercase tracking-[0.4em] text-foreground transition-all duration-300 hover:bg-foreground hover:text-background"
          @click="handleLoginClick"
        >
          <span class="relative z-10">Login</span>
        </button>
      </div>
    </section>
  </main>
</template>