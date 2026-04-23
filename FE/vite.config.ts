//프로젝트 지침, 서버 켜기, 리액트 코드 읽기등
//Vite 환경 설정을 도와주는 도구를 가져오고 코드 자동완성을 띄워줌
import { defineConfig } from 'vite'
//Vite에게 react언어를 번역하는 능력 부여
import react from '@vitejs/plugin-react'
//경로를 편하게 설정하기 위해 가져옴 윈도우와 맥의 표기법이 달라서
import path from "path"
// https://vite.dev/config/
//지침내보내기
export default defineConfig({
  //플러그인 : 리액트 번역기를 우리 프로젝트에 적용해준다. -> 코드를 수정할때 바로 화면이 바뀜
  plugins: [react()],
  resolve: {
    //경로 설정 : @를 src로 인식하게 한다.
    alias: {
      "@": path.resolve(__dirname, "./src"),
    }
  }
})
