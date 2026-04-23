//css 전용 자동화 번역기, 테일윈드css작동과 사이트 디자인이 브라우저마다 같게
export default {
  plugins: {
    //코드를 브라우저가 이해할 수 있게 번역
    tailwindcss: {},
    //브라우저마다(크롬, 사파리...) 다르게 작동하는 css를 같게 번역
    autoprefixer: {},
  },
}
