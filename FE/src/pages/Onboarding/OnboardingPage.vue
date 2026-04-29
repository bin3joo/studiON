<script setup lang="ts">
import ThemeToggle from '@/shared/ui/theme/ThemeToggle.vue'
import logoLight from '@/assets/logo_light.png'
import logoDark from '@/assets/logo_dark.png'

function handleLoginClick() {
  // TODO: 구글 OAuth 연결 예정
  console.log('google login placeholder')
}
</script>

<template>
  <main class="min-h-screen bg-background text-foreground">
    <!-- top bar -->
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

    <!-- hero -->
    <section class="relative overflow-hidden">
      <div class="absolute inset-0 -z-10 opacity-40">
        <div
          class="h-full w-full"
          style="
            background-image:
              linear-gradient(to right, rgba(255,255,255,0.06) 1px, transparent 1px),
              linear-gradient(to bottom, rgba(255,255,255,0.06) 1px, transparent 1px);
            background-size: 32px 32px;
          "
        />
      </div>

      <div class="absolute inset-0 -z-10 opacity-30">
        <div
          class="h-full w-full"
          style="
            background:
              radial-gradient(circle at 20% 20%, rgba(255,255,255,0.05), transparent 30%),
              radial-gradient(circle at 80% 30%, rgba(255,255,255,0.04), transparent 28%),
              radial-gradient(circle at 40% 80%, rgba(255,255,255,0.03), transparent 24%);
          "
        />
      </div>

      <div class="mx-auto flex max-w-6xl flex-col items-center gap-12 px-6 pb-24 pt-20 text-center md:px-10 md:pt-28">
        <div class="relative w-full max-w-3xl">
          <div class="relative aspect-[16/9]">
            <!-- neon frames -->
            <div class="absolute inset-0 rounded-md border border-cyan-400/70 shadow-[0_0_18px_rgba(34,211,238,0.35)]" />
            <div class="absolute inset-2 rounded-md border border-amber-400/70 shadow-[0_0_18px_rgba(251,191,36,0.3)]" />
            <div class="absolute inset-4 rounded-md border border-fuchsia-500/70 shadow-[0_0_18px_rgba(217,70,239,0.35)]" />

            <!-- content -->
            <div class="absolute inset-0 z-10 rounded-md bg-background/80 backdrop-blur-sm">
              <div class="flex h-full flex-col items-center justify-center gap-5 px-8">
                <h1 class="text-[clamp(2.5rem,9vw,6rem)] font-semibold leading-none tracking-tight text-foreground">
                  StudiON
                </h1>

                <!-- fake waveform -->
                <div class="flex h-12 w-full max-w-md items-end justify-center gap-[3px] opacity-90">
                  <span
                    v-for="i in 48"
                    :key="i"
                    class="inline-block w-[3px] rounded-full bg-white/90"
                    :style="{ height: `${12 + ((i * 17) % 36)}px` }"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>

        <button
          type="button"
          class="group relative overflow-hidden border border-foreground bg-transparent px-10 py-4 text-[11px] uppercase tracking-[0.4em] text-foreground transition-all duration-300 hover:bg-foreground hover:text-background"
          @click="handleLoginClick"
        >
          Login
        </button>
      </div>
    </section>
  </main>
</template>