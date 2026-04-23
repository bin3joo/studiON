//index.html 위에 올라가 있는 파일, 이제 열어볼 일 없다.
//리액트에서 제공하는 품질 검사
import { StrictMode } from 'react'
//렌더링 엔진, 버벅거림 방지
import { createRoot } from 'react-dom/client'
//테일윈드와 shadcn설정을 넣어둔 디자인 파일
import './index.css'
//우리 서비스의 최상위 메인 화면, 랜딩 페이지, 대시보드, 에디터 화면들이 APP안에 담기게 된다.
import App from './app/App.tsx'

//index.html에 만든 root라는 공간을 사용할 거임. !으로 무조건 가져오게 한다.
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {/* App을 렌더링한다. */}
    <App />
  </StrictMode>,
)
