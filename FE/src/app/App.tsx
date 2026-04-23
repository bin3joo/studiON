//화면과 기능이 모두 모이는 장소
//1.웹페이지 경로 안내(화면이 전환될때 서버에서 새 페이지를 받아오지 않고 App.tsx안에서 부품만 교체하는 일)
//2.서비스 전체에서 사용하는 도구들을 가장 바깥에 적용한다. 
//서버에서 가져온 트랙 정보나 오디오 데이터를 여러 화면에서 쓸때 App.tsx에서 상태관리 도구를 연결하면 모두 공유 가능
//3.서비스 전체 공통 UI 배치(글로벌 네비게이션 바, 저장 완료 토스트 메시지, 로딩 스피너..)
function App() {
  return (
    <div className="flex h-screen w-full items-center justify-center bg-background text-foreground">
      <h1 className="text-4xl font-bold">StudiON 프로젝트</h1>
    </div>
  )
}

export default App