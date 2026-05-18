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
          <!-- Main Headlines -->
          <h1 class="font-display-lg text-[#e5e2e1] drop-shadow-2xl md:text-[64px]">
            브라우저에서 만나는<br/>
            <span class="text-transparent bg-clip-text bg-gradient-to-r from-[#FF3DCB] to-[#e3b5ff]">무한한 음악의 세계</span>
          </h1>

          <h2 class="font-headline-md text-gray-400 max-w-2xl">
            실시간으로 연결되는 우리만의 스튜디오
          </h2>
        </div>

        <!-- CTA Container -->
        <div class="relative z-10 flex flex-col items-center mt-12 mb-12">
          <button class="gsi-material-button" @click="handleLoginClick">
            <div class="gsi-material-button-state"></div>
            <div class="gsi-material-button-content-wrapper">
              <div class="gsi-material-button-icon">
                <svg version="1.1" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" xmlns:xlink="http://www.w3.org/1999/xlink" style="display: block;">
                  <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"></path>
                  <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"></path>
                  <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"></path>
                  <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"></path>
                  <path fill="none" d="M0 0h48v48H0z"></path>
                </svg>
              </div>
              <span class="gsi-material-button-contents">Google 계정으로 로그인</span>
              <span style="display: none;">Google 계정으로 로그인</span>
            </div>
          </button>
          <div class="mt-8 font-body-md text-gray-300 text-center flex flex-col gap-2.5 bg-[#1c1b1b]/60 border border-white/10 p-6 rounded-2xl backdrop-blur-md max-w-lg shadow-2xl">
            <div class="flex items-center justify-center gap-2 mb-2">
              <span class="material-symbols-outlined text-[20px] text-[#00dce6]" style="font-variation-settings: 'FILL' 1;">info</span>
              <span class="text-white font-bold text-[15px]">베타 서비스 이용 안내</span>
            </div>
            <p class="text-[14px] leading-relaxed tracking-wide">계정 당 총 <strong class="text-[#00dce6]">100MB</strong>, 1회 최대 <strong class="text-[#00dce6]">50MB</strong>의 오디오를 업로드할 수 있습니다.</p>
            <p class="text-[14px] leading-relaxed tracking-wide">원활한 동기화를 위해 프로젝트당 최대 <strong class="text-[#00dce6]">6명</strong>까지 동시 참여를 권장합니다.</p>
            <p class="text-[13px] leading-relaxed text-gray-500 mt-1">현재 베타 버전은 오디오 트랙 생성 위주로 지원되며, 더 많은 기능이 곧 추가될 예정입니다.</p>
          </div>
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
                <p class="font-body-md text-[15px] text-gray-400 leading-relaxed">
                  팀원들과 함께 동일한 프로젝트에 접속하여 딜레이 없는 실시간 공동 작업을 경험하세요. 커서 위치부터 파라미터 변경까지
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
                <p class="font-body-md text-[15px] text-gray-400 leading-relaxed">
                  무거운 설치 파일이나 복잡한 설정은 그만. 
                  인터넷이 연결된 브라우저만 있다면 어디서나 스튜디오 환경이 펼쳐집니다.
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
                <p class="font-body-md text-[15px] text-gray-400 leading-relaxed">
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

/* Google Sign-In Button Material Design Styles */
.gsi-material-button {
  -moz-user-select: none;
  -webkit-user-select: none;
  -ms-user-select: none;
  -webkit-appearance: none;
  background-color: WHITE;
  background-image: none;
  border: 1px solid #747775;
  -webkit-border-radius: 4px;
  border-radius: 4px;
  -webkit-box-sizing: border-box;
  box-sizing: border-box;
  color: #1f1f1f;
  cursor: pointer;
  font-family: 'Roboto', arial, sans-serif;
  font-size: 14px;
  height: 40px;
  letter-spacing: 0.25px;
  outline: none;
  overflow: hidden;
  padding: 0 12px;
  position: relative;
  text-align: center;
  -webkit-transition: background-color .218s, border-color .218s, box-shadow .218s;
  transition: background-color .218s, border-color .218s, box-shadow .218s;
  vertical-align: middle;
  white-space: nowrap;
  width: auto;
  max-width: 400px;
  min-width: min-content;
}

.gsi-material-button .gsi-material-button-icon {
  height: 20px;
  margin-right: 12px;
  min-width: 20px;
  width: 20px;
}

.gsi-material-button .gsi-material-button-content-wrapper {
  -webkit-align-items: center;
  align-items: center;
  display: flex;
  -webkit-flex-direction: row;
  flex-direction: row;
  -webkit-flex-wrap: nowrap;
  flex-wrap: nowrap;
  height: 100%;
  justify-content: space-between;
  position: relative;
  width: 100%;
}

.gsi-material-button .gsi-material-button-contents {
  -webkit-flex-grow: 1;
  flex-grow: 1;
  font-family: 'Roboto', arial, sans-serif;
  font-weight: 500;
  overflow: hidden;
  text-overflow: ellipsis;
  vertical-align: top;
}

.gsi-material-button .gsi-material-button-state {
  -webkit-transition: opacity .218s;
  transition: opacity .218s;
  bottom: 0;
  left: 0;
  opacity: 0;
  position: absolute;
  right: 0;
  top: 0;
}

.gsi-material-button:disabled {
  cursor: default;
  background-color: #ffffff61;
  border-color: #1f1f1f1f;
}

.gsi-material-button:disabled .gsi-material-button-contents {
  opacity: 38%;
}

.gsi-material-button:disabled .gsi-material-button-icon {
  opacity: 38%;
}

.gsi-material-button:not(:disabled):active .gsi-material-button-state, 
.gsi-material-button:not(:disabled):focus .gsi-material-button-state {
  background-color: #303030;
  opacity: 12%;
}

.gsi-material-button:not(:disabled):hover {
  -webkit-box-shadow: 0 1px 2px 0 rgba(60, 64, 67, .30), 0 1px 3px 1px rgba(60, 64, 67, .15);
  box-shadow: 0 1px 2px 0 rgba(60, 64, 67, .30), 0 1px 3px 1px rgba(60, 64, 67, .15);
}

.gsi-material-button:not(:disabled):hover .gsi-material-button-state {
  background-color: #303030;
  opacity: 8%;
}
</style>