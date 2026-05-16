<script setup lang="ts">
import logoDark from '@/assets/logo_dark.png'
import { redirectToGoogleLogin } from './api/onboarding.api'

function handleLoginClick() {
  redirectToGoogleLogin()
}
</script>

<template>
  <main class="onboarding-page min-h-screen flex flex-col overflow-x-hidden font-body-md text-body-md bg-[#131313] text-[#e5e2e1] selection:bg-[#FF3DCB]/30">
    <!-- Minimal Header for Landing Page -->
    <header class="fixed top-0 left-0 w-full z-50 bg-[#131313]/70 backdrop-blur-xl border-b border-white/10 px-4 md:px-10 h-[64px] flex items-center justify-between">
      <div class="flex items-center gap-3">
        <img
          :src="logoDark"
          alt="StudiON"
          class="h-10 w-auto"
        >
      </div>
      <div class="flex gap-4 items-center">
        <button
          @click="handleLoginClick"
          class="px-5 py-2 bg-white text-black text-sm font-bold rounded-full hover:bg-gray-200 transition-colors"
        >
          로그인
        </button>
      </div>
    </header>

    <!-- Main Content -->
    <section class="flex-1 w-full pt-[64px] relative bg-[#131313]">
      <div class="relative min-h-[870px] w-full flex flex-col items-center justify-start pt-6 md:pt-8 px-4 md:px-10 overflow-hidden pb-32">
        <div class="relative z-10 max-w-4xl mx-auto flex flex-col items-center text-center space-y-8">
          <!-- Eyebrow -->
          <div class="inline-flex items-center px-3 py-1 rounded-full border border-[#FF3DCB]/30 bg-[#FF3DCB]/10 font-label-sm text-[#FF3DCB] tracking-widest backdrop-blur-md">
            <span class="material-symbols-outlined text-[14px] mr-2" style="font-variation-settings: 'FILL' 1;">graphic_eq</span>
            NEXT-GEN WEB DAW
          </div>

          <!-- Main Headlines -->
          <h1 class="font-display-lg text-[#e5e2e1] drop-shadow-2xl md:text-[64px]">
            브라우저에서 만나는<br/>
            <span class="text-transparent bg-clip-text bg-gradient-to-r from-[#FF3DCB] to-[#e3b5ff]">무한한 음악의 세계</span>
          </h1>

          <h2 class="font-headline-md text-[#e5bcc5] max-w-2xl">
            실시간으로 연결되는 우리만의 스튜디오
          </h2>
        </div>

        <!-- CTA Container -->
        <div class="relative z-10 flex flex-col items-center mt-12 mb-12">
          <button 
            @click="handleLoginClick"
            class="group relative flex items-center justify-center rounded-full p-[2.5px] overflow-hidden transition-transform duration-300 hover:scale-[1.02] hover:shadow-[0_0_20px_rgba(66,133,244,0.4)]"
          >
            <!-- Animated flowing gradient border -->
            <div class="absolute inset-[-1000%] animate-[spin_3s_linear_infinite] bg-[conic-gradient(from_90deg_at_50%_50%,#4285F4_0%,#9b72cb_33%,#d96570_66%,#4285F4_100%)]"></div>
            
            <!-- Inner white background -->
            <div class="relative z-10 flex items-center justify-center space-x-3 bg-white px-8 py-4 rounded-full w-full h-full transition-colors group-hover:bg-gray-50">
              <svg class="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"></path>
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"></path>
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"></path>
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"></path>
              </svg>
              <span class="font-body-lg text-black font-semibold">Google 계정으로 시작하기</span>
            </div>
          </button>
          <p class="mt-4 font-label-sm text-[#e5bcc5]/70 text-center">
            별도의 설치 없이 바로 시작하세요.
          </p>
        </div>

        <!-- Video Showcase -->
        <div class="relative z-10 w-full max-w-4xl mx-auto mb-16 md:mb-24">
          <div class="relative rounded-[2rem] overflow-hidden border border-white/10 shadow-[0_20px_50px_rgba(0,0,0,0.5)] bg-black">
            <div class="absolute inset-0 bg-gradient-to-t from-[#131313] via-transparent to-transparent opacity-50 z-10 pointer-events-none"></div>
            <video autoplay class="w-full aspect-video object-cover opacity-90" loop muted playsinline>
              <source src="/back1.mp4" type="video/mp4"/>
            </video>
          </div>
        </div>

        <!-- Features Bento Grid -->
        <div class="w-full max-w-[1200px] mx-auto pt-8 pb-12 md:pt-16 md:pb-16 relative z-10">
          <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
            <!-- Feature 1 -->
            <div class="group relative bg-[#1c1b1b]/60 backdrop-blur-xl border border-white/5 rounded-[1.5rem] p-8 overflow-hidden hover:bg-[#2a2a2a]/80 hover:border-[#FF3DCB]/30 transition-all duration-500 ease-out flex flex-col items-start min-h-[320px]">
              <div class="absolute -inset-1 bg-gradient-to-br from-[#FF3DCB]/10 to-transparent opacity-0 group-hover:opacity-100 blur-2xl transition-opacity duration-500 rounded-[1.5rem] pointer-events-none"></div>
              <div class="relative z-10 w-14 h-14 rounded-2xl bg-[#131313] border border-white/10 flex items-center justify-center mb-8 shadow-[0_0_15px_rgba(0,0,0,0.5)] group-hover:border-[#FF3DCB]/50 group-hover:shadow-[0_0_20px_rgba(255,61,203,0.2)] transition-all duration-300">
                <span class="material-symbols-outlined text-[28px] text-[#FF3DCB]" style="font-variation-settings: 'FILL' 1;">groups</span>
              </div>
              <div class="relative z-10 flex-1">
                <h3 class="font-headline-md text-[20px] text-[#e5e2e1] mb-3">실시간 동시 편집</h3>
                <p class="font-body-md text-[15px] text-[#e5bcc5]">
                  팀원들과 함께 동일한 프로젝트에 접속하여 딜레이 없는 실시간 공동 작업을 경험하세요. 커서 위치부터 파라미터 변경까지
                  <br>
                  즉각적으로 동기화됩니다.
                </p>
              </div>
            </div>

            <!-- Feature 2 -->
            <div class="group relative bg-[#1c1b1b]/60 backdrop-blur-xl border border-white/5 rounded-[1.5rem] p-8 overflow-hidden hover:bg-[#2a2a2a]/80 hover:border-[#00dce6]/30 transition-all duration-500 ease-out flex flex-col items-start min-h-[320px]">
              <div class="absolute -inset-1 bg-gradient-to-br from-[#00dce6]/10 to-transparent opacity-0 group-hover:opacity-100 blur-2xl transition-opacity duration-500 rounded-[1.5rem] pointer-events-none"></div>
              <div class="relative z-10 w-14 h-14 rounded-2xl bg-[#131313] border border-white/10 flex items-center justify-center mb-8 shadow-[0_0_15px_rgba(0,0,0,0.5)] group-hover:border-[#00dce6]/50 group-hover:shadow-[0_0_20px_rgba(0,220,230,0.2)] transition-all duration-300">
                <span class="material-symbols-outlined text-[28px] text-[#00dce6]" style="font-variation-settings: 'FILL' 1;">cloud_sync</span>
              </div>
              <div class="relative z-10 flex-1">
                <h3 class="font-headline-md text-[20px] text-[#e5e2e1] mb-3">별도 설치 없는 웹 기반 DAW</h3>
                <p class="font-body-md text-[15px] text-[#e5bcc5]">
                  무거운 설치 파일이나 복잡한 설정은 그만. 
                  <br>
                  인터넷이 연결된 브라우저만 있다면 
                  <br>
                  어디서나 스튜디오 환경이 펼쳐집니다.
                </p>
              </div>
            </div>

            <!-- Feature 3 -->
            <div class="group relative bg-[#1c1b1b]/60 backdrop-blur-xl border border-white/5 rounded-[1.5rem] p-8 overflow-hidden hover:bg-[#2a2a2a]/80 hover:border-[#e3b5ff]/30 transition-all duration-500 ease-out flex flex-col items-start min-h-[320px]">
              <div class="absolute -inset-1 bg-gradient-to-br from-[#e3b5ff]/10 to-transparent opacity-0 group-hover:opacity-100 blur-2xl transition-opacity duration-500 rounded-[1.5rem] pointer-events-none"></div>
              <div class="relative z-10 w-14 h-14 rounded-2xl bg-[#131313] border border-white/10 flex items-center justify-center mb-8 shadow-[0_0_15px_rgba(0,0,0,0.5)] group-hover:border-[#e3b5ff]/50 group-hover:shadow-[0_0_20px_rgba(227,181,255,0.2)] transition-all duration-300">
                <span class="material-symbols-outlined text-[28px] text-[#e3b5ff]" style="font-variation-settings: 'FILL' 1;">tune</span>
              </div>
              <div class="relative z-10 flex-1">
                <h3 class="font-headline-md text-[20px] text-[#e5e2e1] mb-3"> AI 분석을 통한 오디오 믹싱</h3>
                <p class="font-body-md text-[15px] text-[#e5bcc5]">
                  AI가 주파수 충돌 구간을 자동으로 분석하여 작곡에만 집중할 수 있도록 도와드립니다.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  </main>
</template>

<style scoped>
@import url('https://fonts.googleapis.com/css2?family=Hanken+Grotesk:ital,wght@0,100..900;1,100..900&family=JetBrains+Mono:ital,wght@0,100..800;1,100..800&display=swap');
@import url('https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:wght,FILL@100..700,0..1&display=swap');

.onboarding-page {
  font-family: 'Hanken Grotesk', sans-serif;
}
.font-display-lg {
  font-family: 'Hanken Grotesk', sans-serif;
  font-size: 48px;
  line-height: 1.1;
  letter-spacing: -0.02em;
  font-weight: 800;
}
.font-headline-md {
  font-family: 'Hanken Grotesk', sans-serif;
  font-size: 24px;
  line-height: 1.3;
  font-weight: 700;
}
.font-body-lg {
  font-family: 'Hanken Grotesk', sans-serif;
  font-size: 18px;
  line-height: 1.6;
  font-weight: 400;
}
.font-body-md {
  font-family: 'Hanken Grotesk', sans-serif;
  font-size: 16px;
  line-height: 1.6;
  font-weight: 400;
}
.font-label-sm {
  font-family: 'JetBrains Mono', monospace;
  font-size: 12px;
  line-height: 1.0;
  letter-spacing: 0.05em;
  font-weight: 500;
}

@media (max-width: 768px) {
  .font-display-lg {
    font-size: 32px;
    line-height: 1.2;
  }
}
</style>