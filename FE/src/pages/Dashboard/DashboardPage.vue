<script setup lang="ts">
import { RouterLink } from 'vue-router';
import { AudioLines, Disc3, Mic, Play, Plus } from 'lucide-vue-next'
import DashboardHeader from './components/DashboardHeader.vue'

const projects = [
  {
    title: 'Neon Genesis EP',
    meta: 'SYNTHWAVE / 120 BPM',
    edited: 'EDITED 2H AGO',
    icon: Disc3,
    collaborators: 2,
  },
  {
    title: 'Midnight Run V2',
    meta: 'TECHNO / 135 BPM',
    edited: 'EDITED 1D AGO',
    icon: AudioLines,
    collaborators: 1,
  },
  {
    title: 'Vocals — Track 4',
    meta: 'POP / 95 BPM',
    edited: 'EDITED 3D AGO',
    icon: Mic,
    collaborators: 3,
  },
]
</script>

<template>
  <main class="min-h-screen bg-background text-foreground font-grotesk">
    <DashboardHeader />

    <section class="relative overflow-hidden px-6 py-12 md:px-10 md:py-16">
      <div class="pointer-events-none absolute -left-24 top-0 -z-10 h-[40vh] w-[40vh] rounded-full bg-primary/20 blur-[120px]" />
      <div class="absolute inset-0 -z-10 bg-grain opacity-30" />

      <div class="flex flex-col items-start gap-4">

        <h1 class="font-display text-[clamp(3rem,9vw,6rem)] leading-none text-foreground">
          <span class="text-neon-magenta">내 프로젝트</span>
        </h1>

      </div>
    </section>

    <section class="px-6 pb-20 md:px-10 md:pb-28">
      <div class="mb-6 flex items-center justify-between">
        <div class="text-[10px] uppercase tracking-[0.3em] text-muted-foreground">
          {{ projects.length }} 개의 활성 프로젝트
        </div>
      </div>

      <div class="space-y-3">
        <RouterLink
          v-for="(project, idx) in projects"
          :key="project.title"
          :to="`/project/${idx + 1}`"
          class="group relative grid grid-cols-1 gap-4 overflow-hidden rounded-xl border border-border bg-card px-6 py-6 transition hover:border-primary hover:shadow-neon md:grid-cols-[auto_minmax(0,1.4fr)_auto_minmax(0,1fr)_auto] md:items-center md:gap-8 md:px-8 md:py-7"
        >
          <div class="flex min-w-0 items-center gap-5">
            <span class="font-mono-tight text-[10px] uppercase tracking-widest text-muted-foreground">
              0{{ idx + 1 }}
            </span>

            <div class="grid h-12 w-12 place-items-center rounded-lg bg-secondary text-primary transition group-hover:bg-primary group-hover:text-primary-foreground group-hover:shadow-neon">
              <component :is="project.icon" class="h-5 w-5" />
            </div>

            <div class="min-w-0">
              <h3 class="truncate font-display text-xl leading-tight tracking-wide text-foreground md:text-2xl">
                {{ project.title }}
              </h3>

              <div class="mt-1.5 flex items-center gap-2 text-[9px] uppercase tracking-[0.25em] text-muted-foreground">
                <span>{{ project.meta.split(' / ')[0] }}</span>
                <span class="h-1 w-1 rounded-full bg-muted-foreground/50" />
                <span class="text-primary/80">{{ project.meta.split(' / ')[1] }}</span>
              </div>
            </div>
          </div>

          <div class="hidden h-12 w-px bg-border md:block" />

          <div class="hidden items-center gap-8 md:flex">
            <div class="flex flex-col">
              <span class="text-[9px] uppercase tracking-[0.25em] text-muted-foreground">
                Tracks
              </span>
              <span class="mt-1 font-display text-lg leading-none text-foreground">
                37
              </span>
            </div>

            <div class="flex flex-col">
              <span class="text-[9px] uppercase tracking-[0.25em] text-muted-foreground">
                Length
              </span>
              <span class="mt-1 font-mono-tight text-lg leading-none text-foreground">
                3:24
              </span>
            </div>

            <div class="flex flex-col">
              <span class="text-[9px] uppercase tracking-[0.25em] text-muted-foreground">
                Size
              </span>
              <span class="mt-1 font-mono-tight text-lg leading-none text-foreground">
                120<span class="ml-0.5 text-xs text-muted-foreground">MB</span>
              </span>
            </div>
          </div>

          <div class="flex items-center justify-self-end gap-5">
            <div class="flex -space-x-2">
              <div
                v-for="i in Math.min(project.collaborators, 3)"
                :key="i"
                class="h-7 w-7 rounded-full border-2 border-card"
                :style="{ backgroundColor: `hsl(${300 - (i - 1) * 40} 60% ${45 + (i - 1) * 8}%)` }"
              />
            </div>

            <span class="hidden font-mono-tight text-[9px] uppercase tracking-widest text-muted-foreground lg:inline">
              {{ project.edited }}
            </span>

            <div class="grid h-10 w-10 place-items-center rounded-full border border-border text-primary transition group-hover:border-primary group-hover:bg-primary/10 group-hover:shadow-neon">
              <Play class="h-4 w-4" />
            </div>
          </div>
        </RouterLink>
      </div>
    </section>

    <footer class="border-t border-border px-6 py-8 md:px-10">
      <div class="flex flex-col items-center justify-between gap-4 text-[10px] uppercase tracking-[0.3em] text-muted-foreground md:flex-row">
        <div>© 2026 스튜디오 연어</div>

        <div class="flex items-center gap-6">
          <a href="#" class="transition hover:text-primary">Privacy</a>
          <a href="#" class="transition hover:text-primary">Terms</a>
          <a href="#" class="transition hover:text-primary">API Docs</a>
          <a href="#" class="transition hover:text-primary">Community</a>
        </div>
      </div>
    </footer>
  </main>
</template>