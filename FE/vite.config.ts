//프로젝트 지침, 서버 켜기, 리액트 코드 읽기등
//Vite 환경 설정을 도와주는 도구를 가져오고 코드 자동완성을 띄워줌
import { defineConfig } from 'vite'
//vite에게 뷰언어 번역 능력 부여
import vue from '@vitejs/plugin-vue'
//tailwind css 번역 능력 부여
import tailwindcss from '@tailwindcss/vite'
//npm다운 말고 노드제이에스 원래 부품을 가져오기
import { fileURLToPath, URL } from 'node:url'

// https://vite.dev/config/
//지침을 내보낸다.
export default defineConfig({
  //바이트에 장착하는 플러그인
  plugins: [vue(), tailwindcss()],
  resolve: {
    //dirname 설정파일이 있는 FE폴더, @는 src폴더를 가리킴
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
})
