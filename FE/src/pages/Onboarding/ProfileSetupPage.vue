<script setup lang="ts">
import ThemeToggle from '@/shared/ui/theme/ThemeToggle.vue'
import logoLight from '@/assets/logo_light.png'
import logoDark from '@/assets/logo_dark.png'
import ProfileSetupForm from './components/ProfileSetupForm.vue'

</script>

<template>
  <main class="min-h-screen bg-background text-foreground">
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
      <!-- glow -->
      <div class="pointer-events-none absolute inset-0 -z-10">
        <div
          class="absolute -left-40 top-0 h-[70vh] w-[70vh] rounded-full blur-[140px] bg-fuchsia-500/8 dark:bg-fuchsia-500/15"
        />
        <div
          class="absolute -right-32 bottom-0 h-[55vh] w-[55vh] rounded-full blur-[120px] bg-violet-500/6 dark:bg-violet-500/10"
        />
      </div>

      <!-- grid -->
      <div class="absolute inset-0 -z-10 opacity-30 dark:opacity-30">
        <div
          class="h-full w-full dark:hidden"
          style="
            background-image:
              linear-gradient(to right, rgba(0,0,0,0.06) 1px, transparent 1px),
              linear-gradient(to bottom, rgba(0,0,0,0.06) 1px, transparent 1px);
            background-size: 32px 32px;
          "
        />
        <div
          class="hidden h-full w-full dark:block"
          style="
            background-image:
              linear-gradient(to right, rgba(255,255,255,0.05) 1px, transparent 1px),
              linear-gradient(to bottom, rgba(255,255,255,0.05) 1px, transparent 1px);
            background-size: 32px 32px;
          "
        />
      </div>

      <div class="mx-auto flex max-w-3xl flex-col px-6 pb-16 pt-6 md:px-10">
        <ProfileSetupForm />
      </div>
    </section>
  </main>
</template>