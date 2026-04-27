//진입점 파일
//프로그램이 시작되면 가장 먼저 읽는 파일
//여기서 전역 설정(언어, 라우터, 상태관리 등)을 하고 앱을 시작함
//vue의 핵심 기능인 createApp을 가져와서 앱을 생성하고 #app에 마운트(연결)함
import { createApp } from 'vue'
//디자인 가져오기
import './style.css'
import App from './app/App.vue'
import router from './app/router'
//마운트된 앱을 index.html의 #app에 연결
createApp(App).use(router).mount('#app')
